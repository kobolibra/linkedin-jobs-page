"""Publish truthful checkpoint progress; never mark an incomplete import as live."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def progress(search, details):
    source_rows = search.get("jobs", [])
    jd_rows = details.get("jobs", [])
    valid = [row for row in jd_rows
             if row.get("location") == "CN" and row.get("detailStatus") == "ok"
             and (row.get("descriptionHtml") or row.get("descriptionText"))]
    total = sum(row.get("location") == "CN" for row in source_rows)
    ok = len(valid)
    regions = {region: sum(row.get("location") == region for row in source_rows)
               for region in ("CN", "HK", "SG")}
    jd_regions = {region: sum(row.get("location") == region for row in valid)
                  for region in ("CN", "HK", "SG")}
    blocked = [row for row in jd_rows if row.get("location") == "CN" and row.get("detailStatus") == "blocked"]
    retry_times = [float(row.get("detailRetryAt") or 0) for row in blocked]
    search_status = search.get("statusSummary", {})
    search_complete = all(str(search_status.get("State Street::" + region, "")).startswith(
        ("ok:", "partial@resumed-end:")) for region in regions)
    return {
        "status": "INCOMPLETE; checkpoints only, NOT published canonical jobs",
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "company": "State Street",
        "companyIds": ["1767", "1089754"],
        "regions": regions,
        "searchStatus": search_status,
        "searchComplete": search_complete,
        "jdOk": ok,
        "jdTotal": total,
        "jdMissing": total - ok,
        "jdNotApplicable": regions["HK"] + regions["SG"],
        "jdPolicy": "CN-only; HK and SG listing/lifecycle only",
        "jdOkByRegion": jd_regions,
        "jdBlocked": len(blocked),
        "detailRetryAt": max(retry_times, default=0),
        "searchCheckpoint": "data/jobspy/backfill/state-street-live-search-checkpoint.json",
        "jdCheckpoint": "data/jobspy/backfill/state-street-live-jd-checkpoint.json",
        "sourceRepos": ["kobolibra/linkedin-jobs-page", "kobolibra/linkedin-jobs-executor"],
        "datePolicy": "Authoritative State Street historical rows: pushTime = datePosted",
        "blocker": ("LinkedIn JD rate limiting; recover after cooldown"
                    if blocked else "Missing JD; continue verified historical detail collection"),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--search", type=Path, required=True)
    parser.add_argument("--details", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    search = json.loads(args.search.read_text(encoding="utf-8"))
    details = json.loads(args.details.read_text(encoding="utf-8")) if args.details.exists() else {"jobs": []}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(progress(search, details),
                                      ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
