#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, os, random, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from urllib.parse import urlsplit, urlunsplit
from linkedin_http import Coordinator, LinkedInSession
from linkedin_detail import fetch_detail
from linkedin_ids import linkedin_job_id

def www(url: str) -> str:
    p = urlsplit(url.strip())
    host = "www.linkedin.com" if (p.hostname == "linkedin.com" or str(p.hostname).endswith(".linkedin.com")) else p.netloc
    return urlunsplit(("https", host, p.path.rstrip("/"), p.query, ""))

def one(item: dict, timeout: int, attempts: int, delay_min: float, delay_max: float, coordinator=None, retry_round=0) -> dict:
    out = dict(item)
    out["link"] = www(out.get("link", ""))
    # The shared coordinator paces guest and fallback requests, including retries.
    # Legacy delay arguments remain accepted during executor rolling upgrades.
    with LinkedInSession(attempts=attempts, coordinator=coordinator, context={"stage": "details", "retryRound": retry_round, "jobId": linkedin_job_id(out.get("link")), "company": out.get("company"), "region": out.get("location")}) as session:
        session.headers.update({"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36", "Accept-Language": "en-US,en;q=0.9"})
        return fetch_detail(session, out, (10, timeout))


def main() -> int:
    ap = argparse.ArgumentParser(); ap.add_argument("--input", type=Path, required=True); ap.add_argument("--output", type=Path, required=True); ap.add_argument("--workers", type=int, default=3); ap.add_argument("--timeout", type=int, default=15); ap.add_argument("--attempts", type=int, default=3); ap.add_argument("--delay-min", type=float, default=1); ap.add_argument("--delay-max", type=float, default=3); ap.add_argument("--stop-on-rate-limit", action="store_true"); ap.add_argument("--continue-after-rate-limit", action="store_true"); ap.add_argument("--rate-limit-pause-seconds", type=float, default=360); ap.add_argument("--max-rate-limit-pauses", type=int, default=5); ap.add_argument("--max-runtime-seconds", type=int, default=9000); a = ap.parse_args()
    doc = json.loads(a.input.read_text(encoding="utf-8")); rows = doc if isinstance(doc, list) else doc.get("jobs", [])
    rows = [dict(x) for x in rows]; lock = Lock(); done = 0
    if a.output.parent and str(a.output.parent) not in ("", "."):
        os.makedirs(a.output.parent, exist_ok=True)
    todo = [i for i,x in enumerate(rows) if not (x.get("descriptionHtml") or "").strip()]
    def save():
        result = rows if isinstance(doc, list) else {**doc, "jobs": rows, "count": len(rows), "detailsFetchedAt": datetime.now(timezone.utc).isoformat(), "health": {"attempted": done, "candidates": len(todo), **{state: sum(rows[i].get("detailStatus") == state for i in todo) for state in ("ok", "blocked", "failed", "gone")}}}
        a.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # Always materialize the output file first so downstream steps never hit a missing path,
    # even when there is nothing to fetch in this increment.
    save()
    print(f"total={len(rows)} todo_details={len(todo)} workers={a.workers}", flush=True)
    if not todo:
        print(json.dumps({"total":len(rows),"ok":0,"empty":0,"failed":0,"skipped":"no detail candidates"}, ensure_ascii=False), flush=True)
        return 0
    if a.stop_on_rate_limit:
        # Dedicated historical import: one request at a time, server cooldown
        # respected, then retry the SAME job after a bounded pause. The regular
        # parallel JobSpy collector is deliberately unchanged.
        coordinator = Coordinator(min_interval=max(3, a.delay_min),
                                  interval_jitter=max(0, a.delay_max - a.delay_min))
        deadline = time.monotonic() + max(0, a.max_runtime_seconds)
        position, pauses = 0, 0
        while position < len(todo) and time.monotonic() < deadline:
            i = todo[position]
            rows[i] = one(rows[i], a.timeout, a.attempts, a.delay_min, a.delay_max, coordinator)
            done += 1
            save()
            print(f"detail {done}/{len(todo)} {rows[i].get('sourceJobId')} {rows[i].get('detailStatus')}", flush=True)
            if rows[i].get('detailStatus') == 'blocked':
                pauses += 1
                if not a.continue_after_rate_limit or pauses >= max(1, a.max_rate_limit_pauses):
                    print("Rate-limit recovery budget exhausted; checkpoint retained", flush=True)
                    break
                try:
                    server_retry_at = float(rows[i].get('detailRetryAt') or 0)
                except (ValueError, TypeError):
                    server_retry_at = 0
                # Never retry before the server's own retry boundary; after a
                # 429 give the rolling quota time to recover as well.
                wait = max(max(0, a.rate_limit_pause_seconds), server_retry_at - time.time())
                if time.monotonic() + wait >= deadline:
                    print("Historical JD runtime budget reached; checkpoint retained", flush=True)
                    break
                print(f"LinkedIn 429: pause {wait:.0f}s before retrying the blocked job", flush=True)
                time.sleep(wait)
                continue
            position += 1
    else:
        with ThreadPoolExecutor(max_workers=max(1, a.workers)) as pool:
            coordinator = Coordinator()
            pending = todo
            for round_number in range(max(1, a.attempts)):
                fs = {pool.submit(one, rows[i], a.timeout, a.attempts, a.delay_min, a.delay_max, coordinator, round_number): i for i in pending}
                for f in as_completed(fs):
                    i = fs[f]; rows[i] = f.result()
                    if round_number == 0: done += 1
                    with lock: save()
                    print(f"detail {done}/{len(todo)} round={round_number+1} {rows[i].get('sourceJobId')} {rows[i].get('detailStatus')}", flush=True)
                pending = [i for i in pending if rows[i].get('detailRetryable')]
                if not pending: break
        save()
    ok = sum(x.get("detailStatus") == "ok" for x in rows); failed = sum(x.get("detailStatus") in ("failed", "blocked", "gone") for x in rows); empty = sum(x.get("detailStatus") == "empty" for x in rows)
    print(json.dumps({"total":len(rows),"ok":ok,"empty":empty,"failed":failed}, ensure_ascii=False)); return 0
if __name__ == "__main__": raise SystemExit(main())
