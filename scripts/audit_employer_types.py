"""Report employer classification coverage against the canonical jobs snapshot."""
import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from reclassify import BLACKLIST, blacklist_records, norm
from scripts.company_review_queue import discover

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pending", action="store_true", help="List unknown and unlisted names by the homepage job count")
    parser.add_argument("--ranked", action="store_true", help="List every protected company in descending homepage job count")
    args = parser.parse_args()
    records = blacklist_records(json.loads((ROOT / BLACKLIST).read_text(encoding="utf-8")), allow_legacy=False)
    jobs = json.loads((ROOT / "jobs.json").read_text(encoding="utf-8"))["jobs"]
    types = {norm(row["company"]): row["employerType"] for row in records}
    active = [job for job in jobs if job.get("jobStatus") == "active"]
    index = json.loads((ROOT / "jobs-index.json").read_text(encoding="utf-8"))
    # Match the public homepage metric in scripts/guest_preview.mjs.
    website = [
        job for job in index["jobs"]
        if job.get("jobStatus") != "expired" and job.get("location") in ("CN", "HK", "SG")
        and job.get("title") and job.get("company")
        and re.match(r"https://(?:[a-z]{2,3}\.)?linkedin\.com/jobs/view/", job.get("link") or "", re.I)
    ]

    def counts(rows, company_key=norm):
        companies = {company_key(job["company"]): norm(job["company"]) for job in rows if job.get("company")}
        return {
            "jobs": len(rows),
            "companyKeys": len(companies),
            "jobsByType": dict(Counter(types.get(norm(job.get("company") or ""), "unlisted") for job in rows)),
            "companyKeysByType": dict(Counter(types.get(key, "unlisted") for key in companies.values())),
        }

    def was_reviewed(record):
        return bool(record.get("evidence") or record.get("review"))

    report = {
        "originalNames": len(records),
        "companyKeys": len(types),
        "namesByType": dict(Counter(row["employerType"] for row in records)),
        "reviewedUnknown": sum(row["employerType"] == "unknown" and was_reviewed(row) for row in records),
        "all": counts(jobs),
        "active": counts(active),
        "website": counts(website, lambda name: name.strip().lower()),
    }
    if args.pending:
        # Same worklist as the scheduler, never a second unconditional queue.
        _, work = discover(ROOT)
        report["reviewQueue"] = work["reviewQueue"]
        report["deferredCompanies"] = work["summary"]["deferredCompanies"]
    if args.ranked:
        live_counts = Counter(norm(job["company"]) for job in active if job.get("company"))
        website_counts = Counter(norm(job["company"]) for job in website)
        ranked = sorted(records, key=lambda row: (-website_counts[norm(row["company"])], -live_counts[norm(row["company"])], norm(row["company"]), row["company"]))
        print("rank\twebsite_jobs\tactive_jobs\temployer_type\tcompany")
        for i, row in enumerate(ranked, 1):
            key = norm(row["company"])
            print(f'{i}\t{website_counts[key]}\t{live_counts[key]}\t{row["employerType"]}\t{row["company"]}')
        return
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
