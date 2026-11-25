#!/usr/bin/env python3
"""Retained-role firstSeen cohorts: reposts add nothing; expiration keeps counts.

Reconcile against all canonical jobs, including expired rows. A replacement
keeps its role's original cohort while any linked listing is retained. Legacy
repost events are intentionally removed when migrating to pure new counts.
"""
from __future__ import annotations

import argparse
import json
import os
import tempfile
from datetime import date
from pathlib import Path

from jobspy.posting_dates import posting_day
from jobspy.linkedin_ids import linkedin_job_id

REGIONS = frozenset({"CN", "HK", "SG", "OTHER"})
SCHEMA = "1.0"
def identity(job):
    # Same canonical ID parser as the JobSpy merge and the homepage. Handles
    # slugged URLs such as /jobs/view/cfo-financial...-4489793926/.
    for raw in (job.get("sourceJobId"), job.get("link")):
        key = linkedin_job_id(raw)
        if key:
            return "ln:" + key
    return ""


def day(value):
    parsed = posting_day(value)
    return parsed.isoformat() if parsed else ""


def region_of(job):
    value = str(job.get("location") or "").upper()
    return value if value in REGIONS else "OTHER"


def read_ledger(path):
    if not path.exists():
        return {"schemaVersion": SCHEMA, "events": []}
    doc = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(doc, dict) or doc.get("schemaVersion") != SCHEMA or not isinstance(doc.get("events"), list):
        raise ValueError("Invalid posting event ledger; refusing to reset history")
    keys = set()
    for row in doc["events"]:
        if not isinstance(row, dict) or not all(isinstance(row.get(k), str) for k in ("jobId", "day", "region", "kind")):
            raise ValueError("Malformed posting event in historical ledger")
        key = (row["jobId"], row["day"], row["kind"])
        if key in keys or row["region"] not in REGIONS or row["kind"] not in ("first", "repost") or day(row["day"]) != row["day"]:
            raise ValueError("Duplicate or invalid historical posting event")
        keys.add(key)
    return doc


def reconcile(ledger, jobs):
    events = []
    seen = set()
    for job in jobs:
        if not isinstance(job, dict):
            continue
        repost = job.get("crossIdRepost")
        job_id = "ln:" + repost["rootId"] if repost else identity(job)
        first = day(job.get("rolePostDate") or job.get("firstSeen"))
        if not job_id or not first or job_id in seen:
            continue
        seen.add(job_id)
        events.append({"jobId": job_id, "day": first,
                       "region": region_of(job), "kind": "first"})
    events.sort(key=lambda e: (e["day"], e["jobId"], e["kind"]))
    return {"schemaVersion": SCHEMA, "events": events}


def daily_counts(ledger):
    counts = {}
    for event in ledger["events"]:
        row = counts.setdefault(event["day"], {})
        region = event["region"]
        row[region] = row.get(region, 0) + 1
    return {key: counts[key] for key in sorted(counts)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--jobs", type=Path, default=Path("jobs.json"))
    parser.add_argument("--ledger", type=Path, default=Path("data/posting-events-ledger.json"))
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    raw = json.loads(args.jobs.read_text(encoding="utf-8"))
    jobs = raw if isinstance(raw, list) else raw.get("jobs", [])
    if not isinstance(jobs, list):
        raise ValueError("Invalid canonical jobs")
    previous = read_ledger(args.ledger)
    updated = reconcile(previous, jobs)
    changed = updated["events"] != previous["events"]
    if args.check:
        if changed:
            raise SystemExit("Posting events ledger requires publication update")
    elif changed or not args.ledger.exists():
        args.ledger.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix=".posting-events-", dir=args.ledger.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as output:
                json.dump(updated, output, ensure_ascii=False, separators=(",", ":"))
                output.write("\n")
            os.replace(temporary, args.ledger)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    print("posting_events", len(updated["events"]), "new", len(updated["events"]) - len(previous["events"]))


if __name__ == "__main__":
    main()
