#!/usr/bin/env python3
"""Check non-target CN/HK/SG jobs and their posting dates in one bounded pass."""
from __future__ import annotations
import argparse, json, random, time
from datetime import datetime, timezone
from pathlib import Path
import requests
from job_liveness import classify, jid, select_candidates, select_regional_candidates
from reconcile_full_snapshots import location_key
from posting_evidence import detail_posting_date, search_posting_date

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36"
SEARCH_URL = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"

class BudgetExhausted(requests.RequestException):
    pass

class ProbeBudget:
    """Count actual HTTP attempts, including date lookups and failed requests."""
    def __init__(self, session, max_requests, max_seconds):
        self.session = session
        self.max_requests = max_requests
        self.max_seconds = max_seconds
        self.started = time.monotonic()
        self.requests = 0
        self.date_searches = 0

    @property
    def elapsed(self):
        return time.monotonic() - self.started

    @property
    def stop_reason(self):
        if self.requests >= self.max_requests:
            return "http_request_budget"
        if self.elapsed >= self.max_seconds:
            return "time_budget"
        return None

    def get(self, url, **kwargs):
        if self.stop_reason:
            raise BudgetExhausted(self.stop_reason)
        kwargs["timeout"] = min(kwargs.get("timeout", 20), self.max_seconds - self.elapsed)
        if kwargs["timeout"] <= 0:
            raise BudgetExhausted("time_budget")
        self.requests += 1
        self.date_searches += int(url == SEARCH_URL)
        return self.session.get(url, **kwargs)

def rows(doc):
    return doc if isinstance(doc, list) else doc.get("jobs", []) if isinstance(doc, dict) else []

def lookup_posting_date(session, row, html, checked_at, timeout):
    key = jid(row)
    posted, source = detail_posting_date(html, key, checked_at)
    if posted:
        return posted, source, False
    # Relative days/weeks often cross a calendar boundary. Resolve the date
    # from ONE search page, requiring the same numeric LinkedIn job ID.
    if not row.get("title") or not row.get("company"):
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
    except BudgetExhausted:
        # The main page was already verified open. Exhausting a budget during
        # its optional date lookup must not discard that valid status.
        return None, None, False
    except requests.RequestException:
        return None, None, True

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", required=True); ap.add_argument("--output", required=True)
    ap.add_argument("--max-probes", type=int, default=None, help="Optional additional job cap; defaults to the HTTP budget")
    ap.add_argument("--max-http-requests", type=int, default=300, help="Total HTTP attempts, including date searches; CN first")
    ap.add_argument("--max-seconds", type=float, default=900, help="Probe time budget; save partial results before the workflow timeout")
    ap.add_argument("--min-interval-hours", type=float, default=20)
    ap.add_argument("--gone-confirm-hours", type=float, default=12); ap.add_argument("--recheck-expired-hours", type=float, default=72)
    ap.add_argument("--recheck-expired-days", type=float, default=30); ap.add_argument("--delay-min", type=float, default=2)
    ap.add_argument("--delay-max", type=float, default=5); ap.add_argument("--timeout", type=float, default=20)
    ap.add_argument("--breaker", type=int, default=3); ap.add_argument("--guard-ratio", type=float, default=.6)
    ap.add_argument("--guard-min", type=int, default=10)
    ap.add_argument("--location", action="append", choices=["CN","HK","SG"], default=None)
    args = ap.parse_args(); locations = list(dict.fromkeys(args.location or ["CN","HK","SG"]))
    if args.max_http_requests < 1 or args.max_seconds <= 0 or (args.max_probes is not None and args.max_probes < 0):
        ap.error("Budgets must be positive; --max-probes may also be zero")
    job_cap = min(args.max_probes if args.max_probes is not None else args.max_http_requests, args.max_http_requests)
    now = datetime.now(timezone.utc).isoformat()
    out = {"schemaVersion":"1.1","mode":"job-liveness","scopeLocations":locations,"observedAt":now,"observations":[],"stats":{}}
    try:
        doc=json.loads(Path(args.jobs).read_text(encoding="utf-8"))
        all_rows=rows(doc)
        eligibility=dict(now=now,
            min_interval_hours=args.min_interval_hours, gone_confirm_hours=args.gone_confirm_hours,
            recheck_expired_hours=args.recheck_expired_hours, recheck_expired_days=args.recheck_expired_days)
        due_regions={loc:len(select_candidates(all_rows,location=loc,max_probes=len(all_rows),**eligibility)) for loc in locations}
        candidates=select_regional_candidates(all_rows, locations, max_probes=job_cap, **eligibility)
        session=requests.Session(); session.headers.update({"User-Agent":UA,"Accept-Language":"en-US,en;q=0.9"})
        budget=ProbeBudget(session,args.max_http_requests,args.max_seconds)
        breaker=0; classified=[]
        for i,row in enumerate(candidates):
            if budget.stop_reason:
                out["stats"].update({"budgetStopReason":budget.stop_reason,"skippedBudget":len(candidates)-i})
                break
            key=jid(row); url=f"https://www.linkedin.com/jobs/view/{key}"
            posted=source=None; blocked=False
            try:
                response=budget.get(url, timeout=args.timeout, allow_redirects=False)
                checked_at=datetime.now(timezone.utc).isoformat()
                result=classify(response.status_code, response.text, key)
                blocked=response.status_code in {403,429,999} or response.status_code >= 500
                if result == "open":
                    posted,source,date_blocked=lookup_posting_date(budget,row,response.text,checked_at,args.timeout)
                    blocked=blocked or date_blocked
            except BudgetExhausted:
                out["stats"].update({"budgetStopReason":budget.stop_reason or "time_budget","skippedBudget":len(candidates)-i})
                break
            except requests.RequestException as exc:
                checked_at=datetime.now(timezone.utc).isoformat()
                result="unknown"; blocked=True; print("probe_error",key,type(exc).__name__,flush=True)
            breaker=breaker+1 if blocked else 0
            classified.append(result)
            observation={"sourceJobId":row.get("sourceJobId") or f"li-{key}","jobId":key,"location":location_key(row),"result":result,"checkedAt":checked_at}
            if posted: observation.update({"datePosted":posted,"dateSource":source})
            out["observations"].append(observation)
            if breaker >= args.breaker:
                out["stats"]["circuitOpen"] = True
                out["stats"]["skippedCircuitOpen"] = len(candidates)-i-1
                break
            if i+1 < len(candidates) and not budget.stop_reason:
                time.sleep(min(random.uniform(args.delay_min,args.delay_max),max(0,args.max_seconds-budget.elapsed)))
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
            "selected":len(candidates),"maxHttpRequests":args.max_http_requests,"maxSeconds":args.max_seconds,
            "dueRegions":due_regions,"notProbedDue":sum(due_regions.values())-len(out["observations"]),
            "httpRequests":budget.requests,"dateSearchRequests":budget.date_searches,"elapsedSeconds":round(budget.elapsed,3),
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
