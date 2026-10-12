#!/usr/bin/env python3
"""Retry legacy queues using the same guest-first, identity-checked HTTP policy."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from fetch_details_parallel import www
from linkedin_detail import fetch_detail
from linkedin_http import Coordinator, LinkedInSession


def fetch(session, item, timeout, attempts):
    result = fetch_detail(session, {**item, "link": www(item.get("link", ""))}, (10, timeout))
    item.update(result)
    item.update(status="ok" if result.get("detailStatus") == "ok" else "failed",
                lastError=result.get("detailError"), fetchedAt=result.get("detailFetchedAt"),
                attempts=int(item.get("attempts") or 0) + len(result.get("detailAttempts", [])))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--queue", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--timeout", type=int, default=15)
    parser.add_argument("--attempts", type=int, default=3)
    parser.add_argument("--delay", type=float, default=3)
    args = parser.parse_args()
    doc = json.loads(args.queue.read_text(encoding="utf-8"))
    items = doc.get("jobs", [])
    args.output.parent.mkdir(parents=True, exist_ok=True)

    def save():
        args.output.write_text(json.dumps({**doc, "generatedAt": datetime.now(timezone.utc).isoformat(),
                                          "count": len(items), "jobs": items}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    save()
    with LinkedInSession(attempts=args.attempts, coordinator=Coordinator(min_interval=args.delay),
                         context={"stage": "details"}) as session:
        session.headers.update({"User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9"})
        for index, item in enumerate(items, 1):
            if item.get("status") == "ok" and item.get("descriptionHtml"):
                continue
            print(f"detail {index}/{len(items)} {item.get('sourceJobId')}", flush=True)
            fetch(session, item, args.timeout, args.attempts)
            save()
            if item.get("detailStatus") == "blocked":
                break
    print(json.dumps({"total": len(items), "ok": sum(x.get("status") == "ok" for x in items),
                      "failed": sum(x.get("status") == "failed" for x in items)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
