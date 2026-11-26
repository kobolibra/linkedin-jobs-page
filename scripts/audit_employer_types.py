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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pending", action="store_true", help="List unknown and unlisted names by the homepage job count")
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

    report = {
        "originalNames": len(records),
        "companyKeys": len(types),
        "namesByType": dict(Counter(row["employerType"] for row in records)),
        "reviewedUnknown": sum(row["employerType"] == "unknown" and bool(row.get("evidence")) for row in records),
        "all": counts(jobs),
        "active": counts(active),
        "website": counts(website, lambda name: name.strip().lower()),
    }
    if args.pending:
        live_counts = Counter(norm(job["company"]) for job in active if job.get("company"))
        website_counts = Counter(norm(job["company"]) for job in website)
        pending = {}
        for row in records:
            if row["employerType"] == "unknown":
                pending[row["company"]] = "inconclusive" if row.get("evidence") else "pending"
        for job in jobs:
            name = job.get("company")
            if name and norm(name) not in types:
                pending[name] = "unlisted"
        report["reviewQueue"] = sorted(
            ({"company": name, "status": status, "activeJobsForKey": live_counts[norm(name)],
              "websiteJobsForKey": website_counts[norm(name)]}
             for name, status in pending.items()),
            key=lambda row: (-row["websiteJobsForKey"], -row["activeJobsForKey"], norm(row["company"]), row["company"]),
        )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
