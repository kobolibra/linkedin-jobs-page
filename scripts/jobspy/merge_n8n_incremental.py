#!/usr/bin/env python3
"""Merge an n8n incremental array into the lifecycle snapshot without URL duplicates."""
import argparse
import json
import re
from pathlib import Path


def job_key(job):
    raw = str(job.get("sourceJobId") or job.get("link") or "").strip()
    match = re.search(r"(?:li-|ln:)?(\d{7,})", raw)
    return match.group(1) if match else raw


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
            # n8n is an incremental detail/feed source.  Re-seeing an existing
            # LinkedIn ID must not make the job look newly discovered or erase
            # the JobSpy lifecycle snapshot.  In particular, preserve pushTime
            # and firstSeen; only a genuinely new ID may take those fields from
            # the incoming n8n row.
            protected = {
                "pushTime", "firstSeen", "jobStatus", "expiredAt",
                "expiredReason", "lastSeenAt", "jobspyFetchedAt",
                "jobspyFirstSeen", "jobspyLastPosted", "jobspyRepost",
            }
            merged.update({k: v for k, v in incoming.items() if k not in protected})
            if current.get("dataSources") or incoming.get("dataSources"):
                merged["dataSources"] = list(dict.fromkeys(
                    list(current.get("dataSources") or [])
                    + list(incoming.get("dataSources") or [])
                ))
            merged.setdefault("sourceJobId", current.get("sourceJobId") or f"li-{key}")
            rows[by_key[key]] = merged
        else:
            merged = dict(incoming)
            merged.setdefault("sourceJobId", f"li-{key}")
            merged["jobStatus"] = "active"
            rows.append(merged)
            by_key[key] = len(rows) - 1
    result = dict(baseline)
    result["jobs"] = rows
    result["count"] = len(rows)
    result["n8nIncrementalMerge"] = {
        "batchJobs": len(batch),
        "mergedJobs": len(rows),
        "source": "n8n incremental feed",
    }
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
