#!/usr/bin/env python3
"""Merge an n8n incremental array into the last full jobs snapshot.

n8n's six-hour feed is incremental; it must never replace the lifecycle snapshot.
This script preserves history/details/expired records and only upserts rows present
in the n8n batch. Expiry decisions remain exclusively in the CN JobSpy full-snapshot
workflow.
"""
import argparse
import json
from pathlib import Path


def job_key(job):
    return str(job.get("sourceJobId") or job.get("link") or "").strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--batch", required=True)
    ap.add_argument("--output", required=True)
    args = ap.parse_args()
    baseline = json.loads(Path(args.baseline).read_text(encoding="utf-8"))
    batch = json.loads(Path(args.batch).read_text(encoding="utf-8"))
    if not isinstance(batch, list):
        raise SystemExit("n8n batch must be a JSON array")
    if not isinstance(baseline, dict) or not isinstance(baseline.get("jobs"), list):
        raise SystemExit("baseline must be the lifecycle snapshot object")
    rows = list(baseline["jobs"])
    by_key = {job_key(row): i for i, row in enumerate(rows) if job_key(row)}
    for incoming in batch:
        key = job_key(incoming)
        if not key:
            continue
        if key in by_key:
            current = rows[by_key[key]]
            merged = dict(current)
            merged.update(incoming)
            merged["jobStatus"] = "active"
            merged.pop("expiredAt", None)
            rows[by_key[key]] = merged
        else:
            merged = dict(incoming)
            merged["jobStatus"] = "active"
            rows.append(merged)
            by_key[key] = len(rows) - 1
    result = dict(baseline)
    result["jobs"] = rows
    result["n8nIncrementalMerge"] = {
        "batchJobs": len(batch),
        "mergedJobs": len(rows),
        "source": "n8n incremental feed",
    }
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
