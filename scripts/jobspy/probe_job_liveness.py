#!/usr/bin/env python3
"""Probe non-target CN LinkedIn detail pages and emit safe observations."""
from __future__ import annotations
import argparse, json, random, time
from datetime import datetime, timezone
from pathlib import Path
import requests
from job_liveness import classify, jid, select_candidates

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36"

def rows(doc):
    return doc if isinstance(doc, list) else doc.get("jobs", []) if isinstance(doc, dict) else []

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", required=True); ap.add_argument("--output", required=True)
    ap.add_argument("--max-probes", type=int, default=150); ap.add_argument("--min-interval-hours", type=float, default=20)
    ap.add_argument("--gone-confirm-hours", type=float, default=12); ap.add_argument("--recheck-expired-hours", type=float, default=72)
    ap.add_argument("--recheck-expired-days", type=float, default=30); ap.add_argument("--delay-min", type=float, default=2)
    ap.add_argument("--delay-max", type=float, default=5); ap.add_argument("--timeout", type=float, default=20)
    ap.add_argument("--breaker", type=int, default=3); ap.add_argument("--guard-ratio", type=float, default=.6)
    ap.add_argument("--guard-min", type=int, default=10); ap.add_argument("--location", action="append", default=["CN"])
    args = ap.parse_args()
    now = datetime.now(timezone.utc).isoformat()
    out = {"schemaVersion":"1.0","mode":"cn-job-liveness","observedAt":now,"observations":[],"stats":{}}
    try:
        doc=json.loads(Path(args.jobs).read_text(encoding="utf-8")); candidates=[]
        for loc in args.location: candidates.extend(select_candidates(rows(doc), now=now, max_probes=args.max_probes, min_interval_hours=args.min_interval_hours, gone_confirm_hours=args.gone_confirm_hours, recheck_expired_hours=args.recheck_expired_hours, recheck_expired_days=args.recheck_expired_days, location=loc))
        seen=set(); candidates=[r for r in candidates if jid(r) and not (jid(r) in seen or seen.add(jid(r)))]
        session=requests.Session(); session.headers.update({"User-Agent":UA,"Accept-Language":"en-US,en;q=0.9"})
        breaker=0; classified=[]
        for i,row in enumerate(candidates[:args.max_probes]):
            key=jid(row); url=f"https://www.linkedin.com/jobs/view/{key}"
            try:
                response=session.get(url, timeout=args.timeout, allow_redirects=False)
                result=classify(response.status_code, response.text, key)
                if response.status_code in {403,429,999} or response.status_code >= 500: breaker += 1
                else: breaker=0
            except requests.RequestException as exc:
                result="unknown"; breaker += 1; response=None; print("probe_error",key,type(exc).__name__,flush=True)
            classified.append(result)
            out["observations"].append({"sourceJobId":row.get("sourceJobId") or f"li-{key}","jobId":key,"result":result,"checkedAt":now})
            if breaker >= args.breaker:
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
        stats=out["stats"]; stats.update({"probed":len(out["observations"]),"open":sum(x["result"]=="open" for x in out["observations"]),"closed":sum(x["result"]=="closed" for x in out["observations"]),"not_accepting":sum(x["result"]=="not_accepting" for x in out["observations"]),"gone":sum(x["result"]=="gone" for x in out["observations"]),"unknown":sum(x["result"]=="unknown" for x in out["observations"]),"circuitOpen":stats.get("circuitOpen",False),"selectorGuardTripped":stats.get("selectorGuardTripped",False)})
    except Exception as exc:
        out["stats"]={"error":type(exc).__name__,"probed":len(out["observations"]),"circuitOpen":False,"selectorGuardTripped":False}
        print("liveness_error",type(exc).__name__,str(exc),flush=True)
    Path(args.output).parent.mkdir(parents=True,exist_ok=True); Path(args.output).write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(out["stats"],ensure_ascii=False),flush=True)

if __name__ == "__main__": main()
