"""Merge existing verified JD evidence into a newly resumed State Street search snapshot.

Keeps successful JDs by canonical LinkedIn ID, never trusts a changed title/link
as a new ID and never publishes an incomplete history.
"""
import argparse
import json
from pathlib import Path
from linkedin_ids import linkedin_job_id

def combine(search, previous):
    rows = search.get("jobs", [])
    old = {}
    for row in previous.get("jobs", []):
        key = linkedin_job_id(row.get("sourceJobId") or row.get("link"))
        if key:
            old[key] = row
    merged = []
    for incoming in rows:
        row = dict(incoming)
        key = linkedin_job_id(row.get("sourceJobId") or row.get("link"))
        prior = old.get(key, {})
        if key and prior.get("detailStatus") == "ok" and (prior.get("descriptionHtml") or prior.get("descriptionText")):
            for field in ("descriptionHtml", "descriptionText", "detailStatus", "detailFetchedAt",
                          "detailError", "detailRetryable", "jdCheckedAt", "jdChangeStatus"):
                if field in prior:
                    row[field] = prior[field]
        merged.append(row)
    return {**search, "jobs": merged, "count": len(merged)}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--search", type=Path, required=True)
    parser.add_argument("--previous", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    search = json.loads(args.search.read_text(encoding="utf-8"))
    previous = json.loads(args.previous.read_text(encoding="utf-8")) if args.previous.exists() else {"jobs": []}
    result = combine(search, previous)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("preserved_jds", sum(row.get("detailStatus") == "ok" for row in result["jobs"]),
          "total_jobs", len(result["jobs"]), flush=True)

if __name__ == "__main__":
    main()
