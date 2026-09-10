#!/usr/bin/env python3
"""Merge an n8n RSS batch into the lifecycle snapshot.

For an existing LinkedIn ID, RSS re-observation is authoritative for repost
recency (pushTime) and active state, but never for the original firstSeen.
Empty incoming values do not erase canonical fields.
"""
import argparse
import json
import re
from pathlib import Path


def job_key(job):
    raw = str(job.get("sourceJobId") or job.get("link") or "").strip()
    match = re.search(r"(?:li-|ln:)?(\d{7,})", raw)
    return match.group(1) if match else raw


def nonempty(value):
    return value is not None and value != "" and value != [] and value != {}


def merge_sources(current, incoming):
    return list(dict.fromkeys(
        list(current.get("dataSources") or [])
        + list(incoming.get("dataSources") or [])
        + ["n8n-rss"]
    ))


def merge_documents(baseline, batch):
    if not isinstance(batch, list):
        raise ValueError("n8n batch must be a JSON array")
    if not isinstance(baseline, dict) or not isinstance(baseline.get("jobs"), list):
        raise ValueError("baseline must be the lifecycle snapshot object")

    rows = [dict(row) for row in baseline["jobs"]]
    by_key = {job_key(row): i for i, row in enumerate(rows) if job_key(row)}
    added = updated = reactivated = 0

    for incoming in batch:
        if not isinstance(incoming, dict):
            continue
        key = job_key(incoming)
        if not key:
            continue
        if key in by_key:
            current = rows[by_key[key]]
            merged = dict(current)
            # firstSeen is immutable for an existing ID. RSS pushTime is allowed
            # to advance because that is the website's repost/display contract.
            for field, value in incoming.items():
                if field == "firstSeen" or not nonempty(value):
                    continue
                merged[field] = value
            if nonempty(current.get("firstSeen")):
                merged["firstSeen"] = current["firstSeen"]
            elif nonempty(incoming.get("firstSeen")):
                merged["firstSeen"] = incoming["firstSeen"]
            merged["dataSources"] = merge_sources(current, incoming)
            if current.get("jobStatus") == "expired":
                reactivated += 1
            merged["jobStatus"] = "active"
            merged.pop("expiredAt", None)
            merged.pop("expiredReason", None)
            merged["missingSnapshotCount"] = 0
            merged.setdefault("sourceJobId", current.get("sourceJobId") or f"li-{key}")
            rows[by_key[key]] = merged
            updated += 1
        else:
            merged = {k: v for k, v in incoming.items() if nonempty(v)}
            merged.setdefault("sourceJobId", f"li-{key}")
            merged.setdefault("firstSeen", merged.get("pushTime"))
            merged["dataSources"] = merge_sources({}, merged)
            merged["jobStatus"] = "active"
            merged["missingSnapshotCount"] = 0
            rows.append(merged)
            by_key[key] = len(rows) - 1
            added += 1

    result = dict(baseline)
    result["jobs"] = rows
    result["count"] = len(rows)
    result["n8nIncrementalMerge"] = {
        "batchJobs": len(batch), "mergedJobs": len(rows),
        "added": added, "updated": updated, "reactivated": reactivated,
        "source": "n8n RSS incremental feed",
        "firstSeenPolicy": "immutable-for-existing-id",
        "pushTimePolicy": "RSS-repost-may-advance",
    }
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--batch", required=True)
    ap.add_argument("--output", required=True)
    args = ap.parse_args()
    baseline = json.loads(Path(args.baseline).read_text(encoding="utf-8"))
    batch = json.loads(Path(args.batch).read_text(encoding="utf-8"))
    try:
        result = merge_documents(baseline, batch)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    Path(args.output).write_text(
        json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
