#!/usr/bin/env python3
"""Check non-target CN/HK/SG jobs and their posting dates in one bounded pass."""
from __future__ import annotations
import argparse, json, time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
import requests
from bs4 import BeautifulSoup
from job_liveness import classify, jid, select_regional_candidates, NON_TARGET_RETENTION_DAYS
from reconcile_full_snapshots import location_key
from posting_evidence import detail_posting_date, relative_posting_bounds, search_posting_dates
from posting_dates import posting_day
from logo_sources import source_hint
from linkedin_http import Coordinator, LinkedInSession, RequestStopped

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
    response = None
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
            if response.status_code == 429:
                raise RequestStopped('HTTP 429 posting-date search deferred', response=response, recoverable=True)
            if response.status_code in {401,403,999}: return None, None, True
            return None, None, transient_failure() if response.status_code >= 500 else False
        stats["postingDateSearchConsecutiveErrors"] = 0
        dates = search_posting_dates(response.text)
        dates = {job_id: day for job_id, day in dates.items() if observed and posting_day(day) <= observed}
        if cache is not None:
            cache.update(dates)
        posted = dates.get(key)
        return posted, "linkedin-search-id" if posted else None, False
    except RequestStopped as exc:
        if exc.recoverable: raise
        return None, None, True
    except requests.RequestException:
        return None, None, transient_failure()
    finally:
        if response is not None: response.close()
        if isinstance(context, dict):
            session.context = context

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", required=True); ap.add_argument("--output", required=True)
    ap.add_argument("--max-probes", type=int, default=150, help="Total job cap across all regions; due CN jobs first, HK/SG share spare places (not an HTTP request cap)"); ap.add_argument("--min-interval-hours", type=float, default=20)
    ap.add_argument("--gone-confirm-hours", type=float, default=12); ap.add_argument("--recheck-expired-hours", type=float, default=None, help=argparse.SUPPRESS)
    ap.add_argument("--recheck-expired-days", type=float, default=None, help=argparse.SUPPRESS);
    ap.add_argument("--delete-after-days",type=float,default=NON_TARGET_RETENTION_DAYS,help="Confirmed expired jobs receive one final recheck after this age"); ap.add_argument("--delay-min", type=float, default=None, help=argparse.SUPPRESS)
    ap.add_argument("--delay-max", type=float, default=None, help=argparse.SUPPRESS); ap.add_argument("--timeout", type=float, default=20)
    ap.add_argument("--breaker", type=int, default=3); ap.add_argument("--guard-ratio", type=float, default=.6)
    ap.add_argument("--guard-min", type=int, default=10)
    ap.add_argument("--location", action="append", choices=["CN","HK","SG"], default=None)
    args = ap.parse_args(); locations = list(dict.fromkeys(args.location or ["CN","HK","SG"]))
    now = datetime.now(timezone.utc).isoformat()
    out = {"schemaVersion":"1.1","mode":"job-liveness","scopeLocations":locations,"observedAt":now,"observations":[],"stats":{}}
    def save():
        output=Path(args.output); output.parent.mkdir(parents=True,exist_ok=True)
        temporary=output.with_suffix(output.suffix+'.tmp')
        temporary.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        temporary.replace(output)
    try:
        doc=json.loads(Path(args.jobs).read_text(encoding="utf-8"))
        candidates=select_regional_candidates(rows(doc), locations, now=now, max_probes=args.max_probes,
            min_interval_hours=args.min_interval_hours, gone_confirm_hours=args.gone_confirm_hours,
            delete_after_days=args.delete_after_days)
        # Only this stage uses a shorter bounded randomized interval: 2.25–2.75s.
        # List/detail pacing, global Retry-After and shared circuits are unchanged.
        coordinator=Coordinator(min_interval=2.25, interval_jitter=.5)
        session=LinkedInSession(attempts=1, coordinator=coordinator, context={"stage":"liveness"}); session.headers.update({"User-Agent":UA,"Accept-Language":"en-US,en;q=0.9"})
        breaker=0; search_dates=True; cache={}; started=time.monotonic()
        pending=deque({'index':i, 'kind':'view', 'attempt':1, 'readyAt':0} for i in range(len(candidates)))
        observations={}
        try:
            while pending:
                # A different successful lookup may already have resolved a
                # cooling date task. Consume that verified cache without waiting.
                for waiting in pending:
                    if waiting['kind'] == 'date' and waiting['readyAt'] > coordinator.clock() and jid(candidates[waiting['index']]) in cache:
                        day,source,_=lookup_posting_date(session,candidates[waiting['index']],waiting['html'],waiting['checkedAt'],args.timeout,allow_search=False,cache=cache,stats=out['stats'])
                        if day:
                            waiting.update(cachedDate=(day,source),readyAt=0)
                # A cooling query must not hold up a different ready job/date.
                ready=next((i for i,task in enumerate(pending) if task['readyAt'] <= coordinator.clock()), None)
                if ready is None:
                    coordinator.wait(max(0, min(t['readyAt'] for t in pending)-coordinator.clock()))
                    continue
                pending.rotate(-ready); task=pending.popleft(); pending.rotate(ready)
                i=task['index']; row=candidates[i]; key=jid(row)
                kind=task['kind']; url=f"https://www.linkedin.com/jobs/view/{key}"
                if kind == 'date' and not search_dates: continue
                posted=source=hint=None; blocked=False; shared_stop=False
                result='unknown'; checked_at=datetime.now(timezone.utc).isoformat()
                observation=observations.get(i)
                session.context={"stage":"liveness","jobId":key,"endpoint":"view" if kind == 'view' else "posting-date-search", "retryRound":task['attempt']-1}
                if task['attempt'] > 1:
                    out['stats']['deferredTasksRetried']=out['stats'].get('deferredTasksRetried',0)+1
                try:
                    if kind == 'view':
                        response=session.get(url, timeout=args.timeout, allow_redirects=False)
                        try:
                            checked_at=datetime.now(timezone.utc).isoformat()
                            if response.status_code == 429:
                                raise RequestStopped('HTTP 429 job page deferred', response=response, recoverable=True)
                            result=classify(response.status_code, response.text, key)
                            soup=BeautifulSoup(response.text,'html.parser') if response.status_code==200 else None
                            if soup is not None: hint=source_hint(soup,row.get('company'),url,checked_at)
                            blocked=response.status_code in {403,999} or response.status_code >= 500
                            if result == 'open':
                                skipped=out['stats'].get('postingDateSearchSkippedKnown',0)
                                posted,source,_=lookup_posting_date(session,row,soup,checked_at,args.timeout,allow_search=False,cache=cache,stats=out['stats'])
                                if not posted and search_dates and row.get('title') and row.get('company') and skipped == out['stats'].get('postingDateSearchSkippedKnown',0):
                                    pending.append({'index':i,'kind':'date','attempt':1,'readyAt':0,'html':soup,'checkedAt':checked_at})
                        finally:
                            response.close()
                    else:
                        # Reuse the verified page; retry only the failed date endpoint.
                        if 'cachedDate' in task:
                            posted,source=task['cachedDate']; date_blocked=False
                        else:
                            posted,source,date_blocked=lookup_posting_date(session,row,task['html'],task['checkedAt'],args.timeout,cache=cache,stats=out['stats'])
                        if date_blocked:
                            search_dates=False
                            out['stats']['postingDateSearchPaused']=True
                            print('posting_date_search_paused',key,'transport failure; verified liveness is retained',flush=True)
                except requests.RequestException as exc:
                    checked_at=datetime.now(timezone.utc).isoformat()
                    shared_stop=isinstance(exc,RequestStopped) and not exc.recoverable
                    recoverable=isinstance(exc,RequestStopped) and exc.recoverable
                    if recoverable and task['attempt'] < 3:
                        pending.append({**task,'attempt':task['attempt']+1,'readyAt':exc.retry_at or 0})
                        out['stats']['rateLimitedDeferred']=out['stats'].get('rateLimitedDeferred',0)+1
                    elif recoverable:
                        out['stats']['rateLimitedExhausted']=out['stats'].get('rateLimitedExhausted',0)+1
                    blocked=kind == 'view' or shared_stop
                    print('probe_error',kind,key,type(exc).__name__,str(exc),flush=True)
                if kind == 'view':
                    observation={"sourceJobId":row.get("sourceJobId") or f"li-{key}","jobId":key,"location":location_key(row),"result":result,"checkedAt":checked_at}
                    if hint: observation['companyLogoSource']=hint
                    observations[i]=observation
                if posted and observation is not None:
                    observation.update(datePosted=posted,dateSource=source)
                out['observations']=[observations[j] for j in sorted(observations)]
                out['stats']['probed']=len(observations)
                save()
                print('liveness',f"{len(observations)}/{len(candidates)}",kind,key,observation['result'] if observation else 'unknown',f"attempt={task['attempt']}",flush=True)
                # Optional date limits do not erase open evidence. The transport
                # still opens its host circuit after six consecutive real 429s.
                breaker=breaker+1 if blocked else 0
                if shared_stop or breaker >= args.breaker:
                    out['stats']['circuitOpen']=True
                    out['stats']['skippedCircuitOpen']=len(candidates)-len(observations)
                    out['stats']['skippedDeferred']=len(pending)
                    break
        finally:
            session.close()
        classified=[x['result'] for x in out['observations']]
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
            **{state:sum(x["result"]==state for x in out["observations"]) for state in ("open","closed","not_accepting","gone","unknown")},
            "postingDates":sum(bool(x.get("datePosted")) for x in out["observations"]),
            "regions":{loc:sum(x["location"]==loc for x in out["observations"]) for loc in locations},
            "circuitOpen":stats.get("circuitOpen",False),"selectorGuardTripped":stats.get("selectorGuardTripped",False)})
    except Exception as exc:
        out["stats"]={"error":type(exc).__name__,"probed":len(out["observations"]),"circuitOpen":False,"selectorGuardTripped":False}
        print("liveness_error",type(exc).__name__,str(exc),flush=True)
    out["observedAt"]=datetime.now(timezone.utc).isoformat()
    save()
    print(json.dumps(out["stats"],ensure_ascii=False),flush=True)

if __name__ == "__main__": main()
