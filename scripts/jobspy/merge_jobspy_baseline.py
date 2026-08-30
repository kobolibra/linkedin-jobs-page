#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from zoneinfo import ZoneInfo
CN_TZ = ZoneInfo("Asia/Shanghai")
def text(v: object) -> str: return str(v).strip() if v not in (None, "") else ""
def job_id(v: object) -> str:
    s = text(v)
    m = re.search(r"/jobs/view/[^/?#]*?(\d{5,})(?:[/?#]|$)", s, re.I) or re.search(r"(?:currentJobId=|li-|ln:)(\d{5,})", s, re.I)
    return m.group(1) if m else ""
def date_cn(v: object) -> str:
    s=text(v)
    if not s: return ""
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}",s): return s
    try:
        dt=datetime.fromisoformat(s.replace("Z","+00:00")); dt=dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
        return dt.astimezone(CN_TZ).date().isoformat()
    except ValueError:
        m=re.match(r"(\d{4}-\d{2}-\d{2})",s); return m.group(1) if m else ""
def city(raw: object) -> str:
    p=[x.strip() for x in text(raw).split(",") if x.strip()]
    while p and p[-1].casefold() in {"china","cn","mainland china"}: p.pop()
    return p[0] if p else ""
def www(url: object) -> str:
    s=text(url)
    if not s:return ""
    p=urlsplit(s)
    if p.netloc.casefold().endswith("linkedin.com"):p=p._replace(netloc="www.linkedin.com")
    return urlunsplit(p)
def merge_one(base: dict, src: dict, incremental: bool) -> tuple[dict,dict]:
    out=dict(base); ch={"firstSeenUpdated":False,"repostDetected":False,"jdUpdated":False,"jdHtmlUpdated":False,"cityUpdated":False}
    sid=job_id(src.get("sourceJobId") or src.get("link"))
    if sid:out["sourceJobId"]=f"li-{sid}"
    if text(src.get("companyCanonical")):out["companyCanonical"]=text(src["companyCanonical"])
    if text(src.get("requestedCompany")):out["requestedCompany"]=text(src["requestedCompany"])
    if text(src.get("link")):out["link"]=www(src["link"])
    sources=list(out.get("dataSources") or [])
    if "jobspy" not in sources:sources.append("jobspy")
    out["dataSources"]=sources
    posted=date_cn(src.get("datePosted")); old=date_cn(out.get("firstSeen"))
    if posted:
        if not old and incremental: out["firstSeen"]=posted; ch["firstSeenUpdated"]=True
        elif incremental and posted < old: out["firstSeen"]=posted; ch["firstSeenUpdated"]=True
        elif incremental and posted > old: out["jobspyLastPosted"]=posted; ch["repostDetected"]=True
        out["datePosted"]=posted
    desc=text(src.get("descriptionText") or src.get("description"))
    raw_html=text(src.get("descriptionHtml"))
    if desc:
        out["descriptionText"]=desc
        if "description" in out:out["description"]=desc
        ch["jdUpdated"]=True
    if raw_html:
        out["descriptionHtml"]=raw_html
        ch["jdHtmlUpdated"]=True
    raw=text(src.get("locationRaw"))
    company=text(src.get("company") or out.get("company"))
    # LinkedIn detail pages can expose the employer label in the location selector.
    # Never persist a location that is identical to the company name.
    if raw and company and raw.casefold()==company.casefold():
        raw=""
    if raw:
        out["locationRaw"]=raw
        if city(raw):out["city"]=city(raw); ch["cityUpdated"]=True
    if text(src.get("fetchedAt")):out["jobspyFetchedAt"]=text(src["fetchedAt"])
    return out,ch
def main()->int:
    ap=argparse.ArgumentParser(); ap.add_argument("--existing",type=Path,required=True); ap.add_argument("--jobspy",type=Path,required=True); ap.add_argument("--output",type=Path,required=True); ap.add_argument("--incremental",action="store_true"); ap.add_argument("--preview",action="store_true"); a=ap.parse_args()
    existing=json.loads(a.existing.read_text(encoding="utf-8")); incoming=json.loads(a.jobspy.read_text(encoding="utf-8"))
    existing_jobs = existing if isinstance(existing, list) else existing.get("jobs", [])
    incoming_jobs = incoming if isinstance(incoming, list) else incoming.get("jobs", [])
    jobs=[dict(x) for x in existing_jobs]
    byid={job_id(x.get("sourceJobId") or x.get("link")):i for i,x in enumerate(jobs) if job_id(x.get("sourceJobId") or x.get("link"))}
    st={"mode":"incremental" if a.incremental else "baseline","incoming":0,"matched":0,"added":0,"firstSeenUpdated":0,"repostDetected":0,"jdUpdated":0,"jdHtmlUpdated":0,"cityUpdated":0}
    for src in incoming_jobs:
        sid=job_id(src.get("sourceJobId") or src.get("link"))
        if not sid:continue
        st["incoming"]+=1
        if sid in byid:
            i=byid[sid]; jobs[i],ch=merge_one(jobs[i],src,a.incremental); st["matched"]+=1
            for k,v in ch.items():st[k]+=int(v)
        else:
            posted=date_cn(src.get("datePosted")); fetched=text(src.get("fetchedAt")); new={"title":text(src.get("title")),"link":www(src.get("link")),"company":src.get("company"),"location":"CN"}
            # Baseline additions use the source posting date for both fields.
            # Incremental additions use fetch time for pushTime so they appear on the discovery day.
            if a.incremental:
                if fetched:new["pushTime"]=fetched
                if posted:new["firstSeen"]=posted
            else:
                if posted:new["pushTime"]=posted; new["firstSeen"]=posted
            jobs.append(merge_one(new,src,a.incremental)[0]);byid[sid]=len(jobs)-1;st["added"]+=1
    if isinstance(existing, list):
        result=jobs
    else:
        result=dict(existing); result["jobs"]=jobs; result["count"]=len(jobs); result["jobspyMerge"]=st
    if a.preview:print(json.dumps(st,ensure_ascii=False,indent=2))
    else:a.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8");print(json.dumps(st,ensure_ascii=False,indent=2))
    return 0
if __name__=="__main__":raise SystemExit(main())
