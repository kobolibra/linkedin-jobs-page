#!/usr/bin/env python3
"""Check non-target CN/HK/SG jobs and their posting dates in one bounded pass."""
from __future__ import annotations
import argparse, json, time
from datetime import datetime, timezone
from pathlib import Path
import requests
from bs4 import BeautifulSoup
from job_liveness import classify, jid, select_regional_candidates
from reconcile_full_snapshots import location_key
from posting_evidence import detail_posting_date, relative_posting_bounds, search_posting_dates
from posting_dates import posting_day
from logo_sources import source_hint
from linkedin_http import Coordinator, LinkedInSession, RequestStopped
from company_liveness import (cached_identity, employer_url, fetch_snapshot,
    identity_key, prefer_snapshot, verified_identity)

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36"
SEARCH_URL = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"

def rows(doc):
    return doc if isinstance(doc, list) else doc.get("jobs", []) if isinstance(doc, dict) else []

def lookup_posting_date(session, row, html, checked_at, timeout, allow_search=True, cache=None, stats=None):
    key = jid(row)
    soup = html if isinstance(html, BeautifulSoup) else BeautifulSoup(html or "", "html.parser")
    posted, source = detail_posting_date(soup, key, checked_at)
    if posted:
        return posted, source, False
    stats = stats if stats is not None else {}
    observed = posting_day(checked_at)
    # Only source watermarks qualify; RSS discovery/push dates are excluded.
    known = [posting_day(row.get(field)) for field in ("postingLastDate", "jobspyLastPosted")]
    known = [day for day in known if day and observed and day <= observed]
    bounds = relative_posting_bounds(soup, key, checked_at)
    if known and (max(known) == observed or bounds and bounds[1] <= max(known)):
        stats["postingDateSearchSkippedKnown"] = stats.get("postingDateSearchSkippedKnown", 0) + 1
        return None, None, False
    # One successful search can contain several other candidates. Reuse only
    # their exact numeric-ID matches, never a missing/failed search result.
    if cache is not None and key in cache:
        cached_day = posting_day(cache[key])
        if cached_day and observed and cached_day <= observed and (not bounds or bounds[0] <= cached_day <= bounds[1]):
            stats["postingDateSearchCacheHits"] = stats.get("postingDateSearchCacheHits", 0) + 1
            return cache[key], "linkedin-search-id", False
        cache.pop(key, None)  # A newer age/repost must trigger fresh evidence.
    if not allow_search or not row.get("title") or not row.get("company"):
        return None, None, False
    def transient_failure():
        stats["postingDateSearchErrors"] = stats.get("postingDateSearchErrors", 0) + 1
        streak = stats.get("postingDateSearchConsecutiveErrors", 0) + 1
        stats["postingDateSearchConsecutiveErrors"] = streak
        return streak >= 3
    context = getattr(session, "context", None)
    try:
        if isinstance(context, dict):
            session.context = {**context, "endpoint": "posting-date-search"}
        stats["postingDateSearchRequests"] = stats.get("postingDateSearchRequests", 0) + 1
        response = session.get(SEARCH_URL, params={
            "keywords": str(row["title"]) + " " + str(row["company"]),
            "location": {"CN":"China", "HK":"Hong Kong", "SG":"Singapore"}[location_key(row)],
            "start": 0,
        }, timeout=timeout, allow_redirects=False)
        if response.status_code != 200:
            if response.status_code in {401,403,429,999}:
                return None, None, True
            return None, None, transient_failure() if response.status_code >= 500 else False
        stats["postingDateSearchConsecutiveErrors"] = 0
        dates = search_posting_dates(response.text)
        dates = {job_id: day for job_id, day in dates.items() if observed and posting_day(day) <= observed}
        if cache is not None:
            cache.update(dates)
        posted = dates.get(key)
        return posted, "linkedin-search-id" if posted else None, False
    except RequestStopped:
        return None, None, True
    except requests.RequestException:
        return None, None, transient_failure()
    finally:
        if isinstance(context, dict):
            session.context = context

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", required=True); ap.add_argument("--output", required=True)
    ap.add_argument("--max-probes", type=int, default=150, help="Total job cap across all regions; due CN jobs first, HK/SG share spare places (not an HTTP request cap)"); ap.add_argument("--min-interval-hours", type=float, default=20)
    ap.add_argument("--gone-confirm-hours", type=float, default=12); ap.add_argument("--recheck-expired-hours", type=float, default=72)
    ap.add_argument("--recheck-expired-days", type=float, default=30); ap.add_argument("--delay-min", type=float, default=None, help=argparse.SUPPRESS)
    ap.add_argument("--delay-max", type=float, default=None, help=argparse.SUPPRESS); ap.add_argument("--timeout", type=float, default=20)
    ap.add_argument("--breaker", type=int, default=3); ap.add_argument("--guard-ratio", type=float, default=.6)
    ap.add_argument("--guard-min", type=int, default=10)
    ap.add_argument("--location", action="append", choices=["CN","HK","SG"], default=None)
    ap.add_argument("--identity-cache", help="Previous liveness report containing verified company identities")
    ap.add_argument("--strategy", choices=["adaptive", "individual"], default="adaptive")
    args = ap.parse_args(); locations = list(dict.fromkeys(args.location or ["CN","HK","SG"]))
    now = datetime.now(timezone.utc).isoformat()
    out = {"schemaVersion":"1.1","mode":"job-liveness","scopeLocations":locations,"observedAt":now,"observations":[],"stats":{},"companyIdentities":{},"companyQueries":{}}
    started=None
    def save():
        out['stats'].update(probed=len(out['observations']),
            **{state:sum(x['result']==state for x in out['observations']) for state in ('open','closed','not_accepting','gone','absent','unknown')},
            postingDates=sum(bool(x.get('datePosted')) for x in out['observations']))
        if started is not None: out['stats']['elapsedSeconds']=round(time.monotonic()-started,3)
        out['observedAt']=datetime.now(timezone.utc).isoformat()
        path=Path(args.output); path.parent.mkdir(parents=True,exist_ok=True)
        temp=path.with_suffix(path.suffix+'.tmp')
        temp.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        temp.replace(path)
    try:
        if args.identity_cache:
            try:
                previous=json.loads(Path(args.identity_cache).read_text(encoding="utf-8"))
                identities=previous.get("companyIdentities", {})
                if isinstance(identities,dict): out["companyIdentities"]=identities
            except (FileNotFoundError,ValueError): pass
        doc=json.loads(Path(args.jobs).read_text(encoding="utf-8"))
        candidates=select_regional_candidates(rows(doc), locations, now=now, max_probes=args.max_probes,
            min_interval_hours=args.min_interval_hours, gone_confirm_hours=args.gone_confirm_hours,
            recheck_expired_hours=args.recheck_expired_hours, recheck_expired_days=args.recheck_expired_days)
        session=LinkedInSession(attempts=1, coordinator=Coordinator(), context={"stage":"liveness"}); session.headers.update({"User-Agent":UA,"Accept-Language":"en-US,en;q=0.9"})
        breaker=0; classified=[]; search_dates=True; cache={}; started=time.monotonic()
        observed={}; identities=out["companyIdentities"]; pages={}
        out["stats"]["selected"]=len(candidates)
        def record(row, observation):
            key=jid(row); observed[key]=observation
            out["observations"]=list(observed.values())
            print("liveness",f"{len(observed)}/{len(candidates)}",key,observation["result"],observation.get("evidenceSource","view"),flush=True)
            save()
        def probe(row, allow_date=True):
            nonlocal breaker, search_dates
            key=jid(row); url=f"https://www.linkedin.com/jobs/view/{key}"
            posted=source=hint=None; blocked=False; shared_stop=False
            try:
                session.context={"stage":"liveness","jobId":key,"endpoint":"view"}
                response=session.get(url, timeout=args.timeout, allow_redirects=False)
                checked_at=datetime.now(timezone.utc).isoformat()
                result=classify(response.status_code, response.text, key)
                soup=BeautifulSoup(response.text,"html.parser") if response.status_code==200 else None
                if soup is not None:
                    pages[key]=soup
                    hint=source_hint(soup,row.get('company'),url,checked_at)
                    identity=verified_identity(response.text,row,checked_at)
                    if identity:
                        old=cached_identity(row,identities)
                        if old and old.get('companyId')==identity['companyId']:
                            identity['regions']=old.get('regions',{})
                        identities[identity_key(row)]=identity
                        identities[identity_key({**row,'companyUrl':identity['companyUrl']})]=identity
                blocked=response.status_code in {403,429,999} or response.status_code >= 500
                if result == "open" and allow_date:
                    posted,source,date_blocked=lookup_posting_date(session,row,soup,checked_at,args.timeout,allow_search=search_dates,cache=cache,stats=out["stats"])
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
            observation={"sourceJobId":row.get("sourceJobId") or f"li-{key}","jobId":key,"location":location_key(row),"result":result,"checkedAt":checked_at}
            if posted: observation.update({"datePosted":posted,"dateSource":source})
            if hint: observation['companyLogoSource']=hint
            record(row,observation)
            return observation, shared_stop or breaker >= args.breaker
        groups={}
        for row in candidates:
            groups.setdefault((identity_key(row),location_key(row)),[]).append(row)
        # Shared employers first; singleton views cannot postpone the largest
        # savings. The selected 150-job scope remains unchanged.
        groups=sorted(groups.items(),key=lambda item:-len(item[1]))
        stop=False
        for (company_key,region),group in groups:
            identity=cached_identity(group[0],identities)
            use_list=args.strategy=="adaptive" and bool(employer_url(group[0])) and prefer_snapshot(group,identity,region)
            bootstrap=None
            if use_list and not identity:
                # One already-selected job supplies a verified company ID and
                # a liveness result. Never read all job pages before a list.
                bootstrap,stop=probe(group[0],allow_date=False)
                identity=cached_identity(group[0],identities)
            if stop:
                out['stats'].update(circuitOpen=True,skippedCircuitOpen=len(candidates)-len(observed))
                break
            if use_list and identity:
                query_id=company_key+'::'+region
                def progress(snapshot):
                    out["companyQueries"][query_id]={k:v for k,v in snapshot.items() if k!='jobs'}
                    out["companyQueries"][query_id]['foundJobIds']=list(snapshot['jobs'])
                    for row in group:
                        key=jid(row); found=snapshot['jobs'].get(key); previous=observed.get(key)
                        if not found or previous and previous['result'] in {'closed','not_accepting','gone'}: continue
                        item={"sourceJobId":row.get('sourceJobId') or 'li-'+key,"jobId":key,"location":region,
                              "result":"open","checkedAt":snapshot['checkedAt'],"evidenceSource":"company-list","companyQuery":query_id}
                        if found.get('datePosted'):item.update(datePosted=found['datePosted'],dateSource='linkedin-company-list-id')
                        if found.get('companyLogoSource'):item['companyLogoSource']=found['companyLogoSource']
                        observed[key]=item
                    out['observations']=list(observed.values())
                    save()
                snapshot=fetch_snapshot(session,identity,region,{jid(row) for row in group},args.timeout,progress)
                identity.setdefault('regions',{})[region]={"complete":snapshot['complete'],"requests":snapshot['requests'],"count":len(snapshot['jobs']),"reason":snapshot['reason']}
                out["stats"]["companyListGroups"]=out["stats"].get("companyListGroups",0)+1
                for row in group:
                    key=jid(row); found=snapshot['jobs'].get(key)
                    previous=observed.get(key)
                    # A fresh explicit closure on the bootstrap page is
                    # stronger than a search index still containing that job.
                    if previous and previous['result'] in {'closed','not_accepting','gone'}: continue
                    if found:
                        observation={"sourceJobId":row.get('sourceJobId') or 'li-'+key,"jobId":key,"location":region,
                            "result":"open","checkedAt":snapshot['checkedAt'],"evidenceSource":"company-list","companyQuery":query_id}
                        if found.get('datePosted'): observation.update(datePosted=found['datePosted'],dateSource='linkedin-company-list-id')
                        if found.get('companyLogoSource'): observation['companyLogoSource']=found['companyLogoSource']
                    elif snapshot['complete']:
                        observation={"sourceJobId":row.get('sourceJobId') or 'li-'+key,"jobId":key,"location":region,
                            "result":"absent","checkedAt":snapshot['checkedAt'],"evidenceSource":"company-list","companyQuery":query_id}
                    elif previous and previous['result']!='unknown': continue
                    else:
                        observation={"sourceJobId":row.get('sourceJobId') or 'li-'+key,"jobId":key,"location":region,
                            "result":"unknown","checkedAt":snapshot.get('checkedAt') or datetime.now(timezone.utc).isoformat(),"evidenceSource":"company-list","companyQuery":query_id}
                    record(row,observation)
                if snapshot.get('blocked'):
                    # Do not turn a failed company query into N new view/date
                    # requests. A quota response leaves untouched jobs due.
                    stop=True
                elif not snapshot['complete'] and snapshot['reason']!='all-selected-found':
                    out['stats']['incompleteCompanyLists']=out['stats'].get('incompleteCompanyLists',0)+1
            else:
                # If the bootstrap could not resolve identity, its HTML still
                # supplies the individual date fallback without another view.
                if bootstrap and bootstrap['result']=='open' and jid(group[0]) in pages:
                    posted,source,date_blocked=lookup_posting_date(session,group[0],pages[jid(group[0])],bootstrap['checkedAt'],args.timeout,allow_search=search_dates,cache=cache,stats=out['stats'])
                    if posted: bootstrap.update(datePosted=posted,dateSource=source)
                    if date_blocked:
                        search_dates=False;out['stats']['postingDateSearchPaused']=True
                    record(group[0],bootstrap)
                for row in group:
                    if jid(row) in observed: continue
                    observation,stop=probe(row)
                    if stop: break
            if stop:
                out["stats"]["circuitOpen"] = True
                out["stats"]["skippedCircuitOpen"] = len(candidates)-len(observed)
                break
        classified=[item['result'] for item in out['observations']]
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
            "elapsedSeconds":round(time.monotonic()-started,3),
            **{state:sum(x["result"]==state for x in out["observations"]) for state in ("open","closed","not_accepting","gone","absent","unknown")},
            "postingDates":sum(bool(x.get("datePosted")) for x in out["observations"]),
            "regions":{loc:sum(x["location"]==loc for x in out["observations"]) for loc in locations},
            "circuitOpen":stats.get("circuitOpen",False),"selectorGuardTripped":stats.get("selectorGuardTripped",False)})
    except Exception as exc:
        out["stats"].update({"error":type(exc).__name__,"probed":len(out["observations"]),"circuitOpen":True,"selectorGuardTripped":False,
            **{state:sum(x['result']==state for x in out['observations']) for state in ('open','closed','not_accepting','gone','absent','unknown')}})
        print("liveness_error",type(exc).__name__,str(exc),flush=True)
    out["observedAt"]=datetime.now(timezone.utc).isoformat()
    save()
    print(json.dumps(out["stats"],ensure_ascii=False),flush=True)

if __name__ == "__main__": main()
