#!/usr/bin/env python3
"""Check non-target CN/HK/SG jobs and their posting dates in one bounded pass."""
from __future__ import annotations
import argparse, json, random, time
from datetime import datetime, timezone
from pathlib import Path
import requests
from job_liveness import classify, jid, select_regional_candidates
from reconcile_full_snapshots import location_key
from posting_evidence import detail_posting_date, search_posting_date
from logo_sources import source_hint
from linkedin_http import LinkedInSession, RequestStopped

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36"
SEARCH_URL = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"

def rows(doc):
    return doc if isinstance(doc, list) else doc.get("jobs", []) if isinstance(doc, dict) else []

def lookup_posting_date(session, row, html, checked_at, timeout, allow_search=True):
    key = jid(row)
    posted, source = detail_posting_date(html, key, checked_at)
    if posted:
        return posted, source, False
    # Relative days/weeks often cross a calendar boundary. Resolve the date
    # from ONE search page, requiring the same numeric LinkedIn job ID.
    if not allow_search or not row.get("title") or not row.get("company"):
        return None, None, False
    try:
        response = session.get(SEARCH_URL, params={
            "keywords": str(row["title"]) + " " + str(row["company"]),
            "location": {"CN":"China", "HK":"Hong Kong", "SG":"Singapore"}[location_key(row)],
            "start": 0,
        }, timeout=timeout, allow_redirects=False)
        if response.status_code != 200:
            return None, None, response.status_code in {403,429,999} or response.status_code >= 500
        posted = search_posting_date(response.text, key)
        return posted, "linkedin-search-id" if posted else None, False
    except requests.RequestException:
        return None, None, True

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", required=True); ap.add_argument("--output", required=True)
    ap.add_argument("--max-probes", type=int, default=150, help="Total job cap across all regions; due CN jobs first, HK/SG share spare places (not an HTTP request cap)"); ap.add_argument("--min-interval-hours", type=float, default=20)
    ap.add_argument("--gone-confirm-hours", type=float, default=12); ap.add_argument("--recheck-expired-hours", type=float, default=72)
    ap.add_argument("--recheck-expired-days", type=float, default=30); ap.add_argument("--delay-min", type=float, default=2)
    ap.add_argument("--delay-max", type=float, default=5); ap.add_argument("--timeout", type=float, default=20)
    ap.add_argument("--breaker", type=int, default=3); ap.add_argument("--guard-ratio", type=float, default=.6)
    ap.add_argument("--guard-min", type=int, default=10)
    ap.add_argument("--location", action="append", choices=["CN","HK","SG"], default=None)
    args = ap.parse_args(); locations = list(dict.fromkeys(args.location or ["CN","HK","SG"]))
    now = datetime.now(timezone.utc).isoformat()
    out = {"schemaVersion":"1.1","mode":"job-liveness","scopeLocations":locations,"observedAt":now,"observations":[],"stats":{}}
    try:
        doc=json.loads(Path(args.jobs).read_text(encoding="utf-8"))
        candidates=select_regional_candidates(rows(doc), locations, now=now, max_probes=args.max_probes,
            min_interval_hours=args.min_interval_hours, gone_confirm_hours=args.gone_confirm_hours,
            recheck_expired_hours=args.recheck_expired_hours, recheck_expired_days=args.recheck_expired_days)
        session=LinkedInSession(attempts=1, context={"stage":"liveness"}); session.headers.update({"User-Agent":UA,"Accept-Language":"en-US,en;q=0.9"})
        breaker=0; classified=[]; search_dates=True
        for i,row in enumerate(candidates):
            key=jid(row); url=f"https://www.linkedin.com/jobs/view/{key}"
            posted=source=hint=None; blocked=False; shared_stop=False
            try:
                response=session.get(url, timeout=args.timeout, allow_redirects=False)
                checked_at=datetime.now(timezone.utc).isoformat()
                result=classify(response.status_code, response.text, key)
                if response.status_code==200: hint=source_hint(response.text,row.get('company'),url,checked_at)
                blocked=response.status_code in {403,429,999} or response.status_code >= 500
                if result == "open":
                    posted,source,date_blocked=lookup_posting_date(session,row,response.text,checked_at,args.timeout,allow_search=search_dates)
                    if date_blocked:
                        # An optional date lookup failing does not invalidate
                        # the verified open job page or its liveness coverage.
                        # Pause only that fallback; dates in job HTML still work.
                        search_dates=False
                        out["stats"]["postingDateSearchPaused"] = True
                        print("posting_date_search_paused", key, "transport failure; continue verified liveness checks", flush=True)
            except requests.RequestException as exc:
                checked_at=datetime.now(timezone.utc).isoformat()
                result="unknown"; blocked=True; shared_stop=isinstance(exc,RequestStopped) and not exc.recoverable; print("probe_error",key,type(exc).__name__,str(exc),flush=True)
            breaker=breaker+1 if blocked else 0
            classified.append(result)
            observation={"sourceJobId":row.get("sourceJobId") or f"li-{key}","jobId":key,"location":location_key(row),"result":result,"checkedAt":checked_at}
            if posted: observation.update({"datePosted":posted,"dateSource":source})
            if hint: observation['companyLogoSource']=hint
            out["observations"].append(observation)
            print("liveness",f"{i+1}/{len(candidates)}",key,result,flush=True)
            if shared_stop or breaker >= args.breaker:
                out["stats"]["circuitOpen"] = True
                out["stats"]["skippedCircuitOpen"] = len(candidates)-i-1
                break
            if i+1 < len(candidates): time.sleep(random.uniform(args.delay_min,args.delay_max))
        meaningful=[x for x in classified if x != "unknown"]
        ratio=(meaningful.count("not_accepting")/len(meaningful)) if meaningful else 0
        if len(meaningful) >= args.guard_min and ratio > args.guard_ratio:
            out["stats"]["selectorGuardTripped"] = True
            for item in out["observations"]:
                if item["result"] == "not_accepting": item["result"]="unknown"
        # A selector change limited to one region must not be diluted by
        # successful pages from the other two regions.
        guarded=[]
        for loc in locations:
            regional=[x for x in out["observations"] if x["location"] == loc and x["result"] != "unknown"]
            if len(regional) >= args.guard_min and sum(x["result"] == "not_accepting" for x in regional)/len(regional) > args.guard_ratio:
                guarded.append(loc)
                for item in regional:
                    if item["result"] == "not_accepting": item["result"]="unknown"
        if guarded:
            out["stats"]["selectorGuardTripped"] = True
            out["stats"]["guardedRegions"] = guarded
        stats=out["stats"]; stats.update({"probed":len(out["observations"]),
            **{state:sum(x["result"]==state for x in out["observations"]) for state in ("open","closed","not_accepting","gone","unknown")},
            "postingDates":sum(bool(x.get("datePosted")) for x in out["observations"]),
            "regions":{loc:sum(x["location"]==loc for x in out["observations"]) for loc in locations},
            "circuitOpen":stats.get("circuitOpen",False),"selectorGuardTripped":stats.get("selectorGuardTripped",False)})
    except Exception as exc:
        out["stats"]={"error":type(exc).__name__,"probed":len(out["observations"]),"circuitOpen":False,"selectorGuardTripped":False}
        print("liveness_error",type(exc).__name__,str(exc),flush=True)
    out["observedAt"]=datetime.now(timezone.utc).isoformat()
    Path(args.output).parent.mkdir(parents=True,exist_ok=True); Path(args.output).write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(out["stats"],ensure_ascii=False),flush=True)

if __name__ == "__main__": main()
