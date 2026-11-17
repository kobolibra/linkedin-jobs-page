#!/usr/bin/env python3
"""Check non-target CN/HK/SG jobs once; use only already-fetched date evidence."""
from __future__ import annotations
import argparse, json, time, signal
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import requests
from bs4 import BeautifulSoup
from job_liveness import classify, jid, select_regional_candidates, NON_TARGET_RETENTION_DAYS
from reconcile_full_snapshots import location_key
from posting_evidence import detail_posting_date, detail_posting_raw, relative_posting_bounds, search_posting_dates
from posting_dates import posting_day
from logo_sources import source_hint
from linkedin_http import Coordinator, LinkedInSession, RequestStopped, RequestDeadlineExceeded
from linkedin_ids import linkedin_job_id

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36"
MAX_LIVENESS_SECONDS = 15 * 60


class LivenessBudgetExpired(Exception):
    pass


@contextmanager
def wall_clock_limit(seconds):
    """Interrupt slow requests too; requests' read timeout is only an idle timeout."""
    if seconds <= 0: raise LivenessBudgetExpired()
    previous_handler=signal.getsignal(signal.SIGALRM)
    previous_timer=signal.getitimer(signal.ITIMER_REAL)
    started=time.monotonic()
    def expired(_signum,_frame): raise LivenessBudgetExpired()
    signal.signal(signal.SIGALRM,expired)
    signal.setitimer(signal.ITIMER_REAL,seconds)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL,0)
        signal.signal(signal.SIGALRM,previous_handler)
        if previous_timer[0]:
            signal.setitimer(signal.ITIMER_REAL,max(.001,previous_timer[0]-(time.monotonic()-started)),previous_timer[1])

def rows(doc):
    return doc if isinstance(doc, list) else doc.get("jobs", []) if isinstance(doc, dict) else []

def lookup_posting_date(row, html, checked_at, cache=None, stats=None):
    """Read verified page/cache evidence. This function never makes a request."""
    key = jid(row)
    soup = html if isinstance(html, BeautifulSoup) else BeautifulSoup(html or "", "html.parser")
    observed = posting_day(checked_at)
    posted, source = detail_posting_date(soup, key, checked_at)
    if posted and observed and posting_day(posted) <= observed:
        return posted, source
    stats = stats if stats is not None else {}
    # Source watermarks may rule out a repost; RSS discovery dates cannot.
    known = [posting_day(row.get(field)) for field in ("postingLastDate", "jobspyLastPosted")]
    known = [day for day in known if day and observed and day <= observed]
    bounds = relative_posting_bounds(soup, key, checked_at)
    if known and (max(known) == observed or bounds and bounds[1] <= max(known)):
        return None, None
    if cache is not None and key in cache:
        cached_day = posting_day(cache[key])
        if cached_day and observed and cached_day <= observed and (not bounds or bounds[0] <= cached_day <= bounds[1]):
            stats["postingDateCacheHits"] = stats.get("postingDateCacheHits", 0) + 1
            return cache[key], "linkedin-cached-card"
    return None, None


def remember_posting_dates(cache, conflicts, html, checked_at):
    """Cache exact-ID dates already present in fetched pages, never old/future guesses."""
    observed = posting_day(checked_at)
    for key, day in search_posting_dates(html).items():
        if key in conflicts or not observed or posting_day(day) > observed:
            continue
        if key in cache and cache[key] != day:
            cache.pop(key)
            conflicts.add(key)
        else:
            cache[key] = day

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", required=True); ap.add_argument("--output", required=True)
    ap.add_argument("--max-probes", type=int, default=150, help="At most one request per selected job; due CN jobs first, HK/SG share spare places"); ap.add_argument("--min-interval-hours", type=float, default=20)
    ap.add_argument("--gone-confirm-hours", type=float, default=12); ap.add_argument("--recheck-expired-hours", type=float, default=None, help=argparse.SUPPRESS)
    ap.add_argument("--recheck-expired-days", type=float, default=None, help=argparse.SUPPRESS);
    ap.add_argument("--delete-after-days",type=float,default=NON_TARGET_RETENTION_DAYS,help="Confirmed expired jobs receive one final recheck after this age"); ap.add_argument("--delay-min", type=float, default=None, help=argparse.SUPPRESS)
    ap.add_argument("--delay-max", type=float, default=None, help=argparse.SUPPRESS); ap.add_argument("--timeout", type=float, default=20)
    ap.add_argument("--breaker", type=int, default=3); ap.add_argument("--guard-ratio", type=float, default=.6)
    ap.add_argument("--guard-min", type=int, default=10)
    ap.add_argument("--max-seconds",type=float,default=MAX_LIVENESS_SECONDS,help="Liveness-only time limit, at most 900 seconds; completed results are published normally")
    ap.add_argument("--location", action="append", choices=["CN","HK","SG"], default=None)
    args = ap.parse_args(); locations = list(dict.fromkeys(args.location or ["CN","HK","SG"]))
    if not 0 < args.max_seconds <= MAX_LIVENESS_SECONDS: ap.error('--max-seconds must be greater than 0 and at most 900')
    started=time.monotonic()
    now = datetime.now(timezone.utc).isoformat()
    out = {"schemaVersion":"1.1","mode":"job-liveness","scopeLocations":locations,"observedAt":now,"observations":[],"stats":{"postingDateSearchRequests":0,"postingDateNetworkDisabled":True}}
    def save():
        output=Path(args.output); output.parent.mkdir(parents=True,exist_ok=True)
        temporary=output.with_suffix(output.suffix+'.tmp')
        temporary.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        temporary.replace(output)
    try:
        doc=json.loads(Path(args.jobs).read_text(encoding="utf-8"))
        # Canonical data is unique already; defend the HTTP pass against
        # duplicate/invalid input IDs without spending any of the 150 places.
        unique={}
        for row in rows(doc):
            key=linkedin_job_id(jid(row)) if isinstance(row,dict) else None
            if key: unique.setdefault(key,row)
        candidates=select_regional_candidates(list(unique.values()), locations, now=now, max_probes=args.max_probes,
            min_interval_hours=args.min_interval_hours, gone_confirm_hours=args.gone_confirm_hours,
            delete_after_days=args.delete_after_days)
        # Restore the pre-regression 3s baseline. A rate limit may slow this
        # stage to the existing 6s ceiling, but success does not accelerate it
        # again mid-pass. All host/server cooldowns still apply.
        remaining=args.max_seconds-(time.monotonic()-started)
        coordinator=Coordinator(min_interval=3, restore_recovery_pacing=False)
        coordinator.deadline=coordinator.clock()+max(0,remaining)
        session=LinkedInSession(attempts=1, coordinator=coordinator, defer_queries=False,
            context={"stage":"liveness"})
        session.headers.update({"User-Agent":UA,"Accept-Language":"en-US,en;q=0.9"})
        breaker=0; cache={}; conflicts=set(); date_contexts={}
        out['stats']['selected']=len(candidates)
        try:
            try:
                with wall_clock_limit(args.max_seconds-(time.monotonic()-started)):
                    for i,row in enumerate(candidates):
                        key=jid(row); url=f"https://www.linkedin.com/jobs/view/{key}"
                        posted=source=hint=raw_posted=None; blocked=False; shared_stop=False
                        result='unknown'; checked_at=datetime.now(timezone.utc).isoformat()
                        session.context={"stage":"liveness","jobId":key,"endpoint":"view"}
                        try:
                            response=session.get(url, timeout=args.timeout, allow_redirects=False)
                            try:
                                checked_at=datetime.now(timezone.utc).isoformat()
                                if response.status_code == 429:
                                    raise RequestStopped('HTTP 429 job page skipped this pass', response=response, recoverable=True)
                                result=classify(response.status_code, response.text, key)
                                soup=BeautifulSoup(response.text,'html.parser') if response.status_code==200 else None
                                if soup is not None and result != 'unknown':
                                    hint=source_hint(soup,row.get('company'),url,checked_at)
                                    remember_posting_dates(cache,conflicts,soup,checked_at)
                                blocked=response.status_code in {403,999} or response.status_code >= 500
                                if result == 'open':
                                    posted,source=lookup_posting_date(row,soup,checked_at,cache=cache,stats=out['stats'])
                                    if posted: raw_posted=detail_posting_raw(soup,key,source)
                                    if not posted: date_contexts[i]=(row,soup,checked_at)
                            finally:
                                response.close()
                        except RequestDeadlineExceeded as exc:
                            raise LivenessBudgetExpired() from exc
                        except requests.RequestException as exc:
                            checked_at=datetime.now(timezone.utc).isoformat()
                            shared_stop=isinstance(exc,RequestStopped) and not exc.recoverable
                            if exc.response is not None and exc.response.status_code == 429:
                                out['stats']['rateLimitedSkipped']=out['stats'].get('rateLimitedSkipped',0)+1
                            blocked=True
                            print('probe_error','view',key,type(exc).__name__,str(exc),flush=True)
                        observation={"sourceJobId":row.get("sourceJobId") or f"li-{key}","jobId":key,"location":location_key(row),"result":result,"checkedAt":checked_at}
                        if hint: observation['companyLogoSource']=hint
                        if posted:
                            observation.update(datePosted=posted,dateSource=source)
                            if raw_posted: observation['datePostedRaw']=raw_posted
                        out['observations'].append(observation)
                        out['stats']['probed']=len(out['observations'])
                        save()
                        print('liveness',f"{len(out['observations'])}/{len(candidates)}",'view',key,result,'attempt=1',flush=True)
                        breaker=breaker+1 if blocked else 0
                        if shared_stop or breaker >= args.breaker:
                            out['stats']['circuitOpen']=True
                            out['stats']['skippedCircuitOpen']=len(candidates)-len(out['observations'])
                            break
                    # Cache-only backfill shares the same deadline as requests.
                    for i,(row,soup,checked_at) in date_contexts.items():
                        if i >= len(out['observations']): continue
                        posted,source=lookup_posting_date(row,soup,checked_at,cache=cache,stats=out['stats'])
                        if posted:
                            out['observations'][i].update(datePosted=posted,dateSource=source)
                            raw_posted=detail_posting_raw(soup,jid(row),source)
                            if raw_posted: out['observations'][i]['datePostedRaw']=raw_posted
            except LivenessBudgetExpired:
                out['stats'].update(budgetExhausted=True,skippedBudget=len(candidates)-len(out['observations']))
                print('liveness_budget_exhausted',len(out['observations']),len(candidates),'completed observations retained; continue JobSpy',flush=True)
            # Remove contradictory cached evidence even after a partial pass.
            for observation in out['observations']:
                if observation.get('dateSource') == 'linkedin-cached-card' and observation['jobId'] in conflicts:
                    observation.pop('datePosted',None)
                    observation.pop('dateSource',None)
                    observation.pop('datePostedRaw',None)
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
            "postingDateSkippedNoEvidence":sum(x["result"] == "open" and not x.get("datePosted") for x in out["observations"]),
            "regions":{loc:sum(x["location"]==loc for x in out["observations"]) for loc in locations},
            "circuitOpen":stats.get("circuitOpen",False),"selectorGuardTripped":stats.get("selectorGuardTripped",False)})
    except Exception as exc:
        out["stats"].update(error=type(exc).__name__,probed=len(out["observations"]))
        print("liveness_error",type(exc).__name__,str(exc),flush=True)
    out["observedAt"]=datetime.now(timezone.utc).isoformat()
    save()
    print(json.dumps(out["stats"],ensure_ascii=False),flush=True)

if __name__ == "__main__": main()
