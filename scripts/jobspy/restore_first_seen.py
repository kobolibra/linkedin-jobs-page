#!/usr/bin/env python3
"""Restore immutable firstSeen for IDs that existed before lifecycle rollout."""
import argparse
import json
import re
from pathlib import Path


def rows(doc):
    return doc if isinstance(doc, list) else doc.get("jobs", []) if isinstance(doc, dict) else []


def jid(job):
    raw = str(job.get("sourceJobId") or job.get("link") or "").strip()
    match = re.search(r"(?:li-|ln:)?(\d{7,})", raw)
    return match.group(1) if match else raw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--current", required=True)
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--output", required=True)
    args = ap.parse_args()
    current = json.loads(Path(args.current).read_text(encoding="utf-8"))
    baseline = json.loads(Path(args.baseline).read_text(encoding="utf-8"))
    old = {jid(x): x for x in rows(baseline) if isinstance(x, dict) and jid(x)}
    changed = initialized = 0
    for job in rows(current):
        if not isinstance(job, dict) or not jid(job):
            continue
        prior = old.get(jid(job), {})
        canonical = prior.get("firstSeen")
        if canonical not in (None, "") and job.get("firstSeen") != canonical:
            job["firstSeen"] = canonical
            changed += 1
        elif jid(job) not in old and job.get("firstSeen") in (None, "") and job.get("pushTime") not in (None, ""):
            job["firstSeen"] = job["pushTime"]
            initialized += 1
    if isinstance(current, dict):
        current["firstSeenRepair"] = {
            "baseline": "80303549cec3822e1b84ad4ab9466c6caa553af4",
            "restoredExisting": changed,
            "initializedNew": initialized,
            "policy": "immutable per LinkedIn ID; RSS may only advance pushTime"
        }
        current["count"] = len(rows(current))
    Path(args.output).write_text(json.dumps(current, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"restoredExisting": changed, "initializedNew": initialized, "total": len(rows(current))}))


if __name__ == "__main__":
    main()
