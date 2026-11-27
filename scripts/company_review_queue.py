#!/usr/bin/env python3
"""Build and persist the company investigation queue.

This file tracks research progress only. financial_blacklist.json remains the
sole runtime employer-classification source and company_industries.json remains
the industry source. Resolved decisions are applied through reclassify.py or a
reviewed classification-correction PR, never through this progress file.
"""
from __future__ import annotations

import argparse
import copy
import datetime as dt
import json
import re
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from reclassify import BEIJING, BLACKLIST, EXCLUDED, INDUSTRIES, TARGET, blacklist_records, norm, read_ledger, requester_excluded_names
from scripts.jobspy.linkedin_ids import linkedin_job_id

STATUS_PATH = "reports/employer-review-status.json"
PENDING = "待查证"
VALID_STATUS = {"verified", "inconclusive", "not_started"}
VALID_DECISIONS = {"protect", "delete", "undetermined"}
VALID_TYPES = {"direct_employer", "recruitment_agency", "recruitment_platform", "mixed", "unknown", None}


def read_json(path: Path, default=None):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def jobs_from(root: Path, name: str) -> list[dict]:
    data = read_json(root / name, {})
    return data.get("jobs", data) if isinstance(data, dict) else data


def website_jobs(index: list[dict]) -> list[dict]:
    return [
        job for job in index
        if job.get("jobStatus") != "expired" and job.get("location") in ("CN", "HK", "SG")
        and job.get("title") and job.get("company")
        and re.match(r"https://(?:[a-z]{2,3}\.)?linkedin\.com/jobs/view/", job.get("link") or "", re.I)
    ]


def previous_rows(root: Path) -> dict[str, dict]:
    data = read_json(root / STATUS_PATH, {}) or {}
    return {norm(row["company"]): row for row in data.get("companies", []) if row.get("company")}


def resolved(row: dict, records: dict[str, dict], industries: dict[str, str],
             targets: dict[str, list], excluded: dict[str, list]) -> bool:
    if row.get("investigationStatus") != "verified":
        return False
    decision = row.get("protectionDecision")
    key = norm(row["company"])
    if decision == "delete":
        return (key not in records and key in industries and industries[key] != PENDING
                and bool(row.get("industryEvidence")) and key in targets and key not in excluded
                and targets[key][1] == industries[key])
    if decision == "protect":
        record = records.get(key)
        if not record or record.get("employerType") != row.get("employerType"):
            return False
        if record["employerType"] in {"unknown", "mixed"}:
            return False
        return bool(record.get("evidence")) and key in excluded and key not in targets
    return False


def job_id(job):
    return linkedin_job_id(job.get("sourceJobId")) or linkedin_job_id(job.get("link"))


def job_observations(jobs, index, staging):
    """Use stable listing IDs; confirmed or pending linked reposts share their root."""
    all_ids, open_ids = defaultdict(set), defaultdict(set)
    aliases = {}
    canonical = {}
    for job in jobs:
        name, listing = job.get("company"), job_id(job)
        if not name or not listing:
            continue
        key = norm(name)
        canonical[(key, listing)] = job.get("jobStatus")
        lineage = job.get("crossIdRepost") or {}
        if lineage.get("rootId"):
            root = linkedin_job_id(lineage["rootId"])
            if root:
                aliases[(key, listing)] = root
    for job in jobs + index + staging:
        name, listing = job.get("company"), job_id(job)
        if not name or not listing:
            continue
        key = norm(name)
        root = aliases.get((key, listing), listing)
        all_ids[key].update((listing, root))
        # A stale RSS copy cannot reopen a canonical expired listing.
        if canonical.get((key, listing), job.get("jobStatus")) != "expired":
            open_ids[key].add(root)
    return all_ids, open_ids, aliases


def established(key, records, industries, targets, excluded):
    record = records.get(key)
    if record and record["employerType"] not in {"unknown", "mixed"} and record.get("evidence"):
        return True
    return (key not in records and key in targets and key not in excluded
            and key in industries and industries[key] != PENDING
            and targets[key][1] == industries[key])


def review_due(row):
    # Verified decisions with inconsistent ledgers are a reconciliation issue,
    # never an instruction to research the same company again.
    if row.get("investigationStatus") == "verified":
        return False
    return bool(set(row.get("candidateJobIds", [])) - set(row.get("reviewedJobIds", [])))


def partition(companies, records, industries, targets, excluded):
    active, waiting = [], []
    for row in companies:
        key = norm(row["company"])
        if resolved(row, records, industries, targets, excluded) or established(key, records, industries, targets, excluded):
            continue
        (active if review_due(row) else waiting).append(row)
    order = lambda row: (-int(row.get("websiteJobsForKey") or 0),
                         -int(row.get("activeJobsForKey") or 0), norm(row["company"]))
    return sorted(active, key=order), sorted(waiting, key=order)


def queue_summary(summary, companies, active, waiting):
    return dict(summary, trackedCompanies=len(companies), reviewQueue=len(active),
                deferredCompanies=len(waiting),
                deferredByStatus=dict(Counter(row["investigationStatus"] for row in waiting)),
                queueByStatus=dict(Counter(row["investigationStatus"] for row in active)),
                queueBySource=dict(Counter(source for row in active for source in row.get("sourceStatuses", []))),
                stagingNotCanonical=sum(bool(row.get("stagingNotCanonical")) for row in active),
                indexNotCanonical=sum(bool(row.get("indexNotCanonical")) for row in active))


def discover(root: Path) -> tuple[list[dict], dict]:
    records_list = blacklist_records(read_json(root / BLACKLIST), allow_legacy=False)
    records = {norm(row["company"]): row for row in records_list}
    industries = {norm(key): value for key, value in read_json(root / INDUSTRIES, {}).items()}
    targets = read_ledger((root / TARGET).read_text(encoding="utf-8"), "备注")
    excluded = read_ledger((root / EXCLUDED).read_text(encoding="utf-8"), "排除原因")
    jobs = jobs_from(root, "jobs.json")
    index = jobs_from(root, "jobs-index.json")
    staging = jobs_from(root, "data/n8n/rss-latest.json")
    observed_ids, candidate_ids, aliases = job_observations(jobs, index, staging)
    observation_at = dt.datetime.now(dt.timezone.utc).isoformat()
    active = [job for job in jobs if job.get("jobStatus") == "active"]
    website = website_jobs(index)
    active_counts = Counter(norm(job["company"]) for job in active if job.get("company"))
    website_counts = Counter(norm(job["company"]) for job in website)
    manual = requester_excluded_names(lambda path: (root / path).read_text(encoding="utf-8") if (root / path).is_file() else None)
    previous = {key: row for key, row in previous_rows(root).items() if key not in manual}
    observed: dict[str, dict] = {}
    dates: dict[str, set[str]] = {}

    def observed_date(name, value):
        if not name or not isinstance(value, str):
            return
        try:
            stamp = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
            if stamp.tzinfo:
                stamp = stamp.astimezone(BEIJING)
            day = stamp.date().isoformat()
        except ValueError:
            return
        dates.setdefault(norm(name), set()).add(day)

    def job_dates(job):
        for field in ("firstSeen", "pushTime", "first_seen", "push_time"):
            observed_date(job.get("company"), job.get(field))

    for job in jobs + index:
        job_dates(job)

    def observe(name: str, source: str, date: str | None = None):
        key = norm(name)
        if key in manual:
            return
        row = observed.setdefault(key, {
            "company": name,
            "sourceStatuses": set(),
            "historicalPendingDates": set(),
            "stagingNotCanonical": False,
            "indexNotCanonical": False,
        })
        row["sourceStatuses"].add(source)
        if date:
            row["historicalPendingDates"].add(date)

    for record in records_list:
        if record["employerType"] in {"unknown", "mixed"}:
            status = "inconclusive" if record.get("evidence") or record.get("review") else "pending"
            observe(record["company"], status)
    for job in jobs:
        name = job.get("company")
        if name and norm(name) not in records:
            observe(name, "unlisted")
    for path in sorted((root / "reports").glob("today-companies-*.json")):
        report = read_json(path, {})
        day = report.get("date") or path.stem.removeprefix("today-companies-")
        for company in report.get("target_companies", []) + report.get("excluded_companies", []):
            observed_date(company.get("company"), company.get("pushTime") or day)
        for company in report.get("target_companies", []):
            if (company.get("reason") or "").strip() == PENDING:
                observe(company["company"], "historical_pending", day)

    canonical_names = {norm(job["company"]) for job in jobs if job.get("company")}
    index_names = {norm(job["company"]): job["company"] for job in index if job.get("company")}
    # JobSpy searches a fixed, already verified company universe. Only the
    # open-ended RSS input needs pre-publication company discovery.
    for job in staging:
        job_dates(job)
        name = job.get("company")
        if name and norm(name) not in canonical_names and norm(name) not in manual:
            observe(name, "staging_not_canonical")
            observed[norm(name)]["stagingNotCanonical"] = True
    for key in index_names.keys() - canonical_names - manual:
        observe(index_names[key], "index_not_canonical")
        observed[key]["indexNotCanonical"] = True

    # Carry unresolved investigations forward even after every job expires.
    for key, old in previous.items():
        if not resolved(old, records, industries, targets, excluded) and key not in observed:
            observe(old["company"], "carry_forward")

    companies = []
    for key, found in observed.items():
        old = copy.deepcopy(previous.get(key, {}))
        # Established policy entries do not require another AI investigation just
        # because a staging snapshot has not yet reached canonical publication.
        if not old and established(key, records, industries, targets, excluded):
            continue
        observation_days = dates.get(key, set()) | set(old.get("historicalPendingDates", [])) | found["historicalPendingDates"]
        observation_days.update(x for x in (old.get("observedFirstOn"), old.get("observedLastOn")) if x)
        row = {
            **old,
            "company": found["company"],
            "sourceStatuses": sorted(found["sourceStatuses"]),
            "activeJobsForKey": active_counts[key],
            "websiteJobsForKey": website_counts[key],
            "historicalPendingDates": sorted(found["historicalPendingDates"] | set(old.get("historicalPendingDates", []))),
            "stagingNotCanonical": found["stagingNotCanonical"],
            "indexNotCanonical": found["indexNotCanonical"],
            "existingRecord": records.get(key),
            "existingIndustry": industries.get(key),
            "investigationStatus": old.get("investigationStatus", "not_started"),
            "protectionDecision": old.get("protectionDecision", "undetermined"),
            "firstQueuedOn": old.get("firstQueuedOn") or dt.datetime.now(BEIJING).date().isoformat(),
            "observedFirstOn": min(observation_days, default=None),
            "observedLastOn": max(observation_days, default=None),
        }
        if not old and row["existingRecord"] and row["existingRecord"].get("employerType") in {"unknown", "mixed"}:
            record = row["existingRecord"]
            if record.get("evidence") or record.get("review"):
                row["investigationStatus"] = "inconclusive"
                row["investigationSummary"] = (record.get("review") or record.get("evidence") or {}).get("note")
                row["queries"] = [(record.get("review") or {}).get("query")] if record.get("review", {}).get("query") else []
        # Retain IDs even after expiration, removal, or a repeated RSS snapshot.
        all_seen = set(old.get("observedJobIds", [])) | observed_ids[key]
        reviewed = set(old.get("reviewedJobIds", []))
        if row["investigationStatus"] == "inconclusive" and "reviewedJobIds" not in old:
            # Legacy investigations have no per-job checkpoint. Baseline their
            # existing listings once rather than rerun old research on upgrade.
            reviewed.update(all_seen)
        # When canonical publication links a previously reviewed listing to a
        # repost lineage, carry that coverage across the known alias.
        for (company, listing), root_id in aliases.items():
            if company == key and (listing in reviewed or root_id in reviewed):
                reviewed.update((listing, root_id))
        row.update(observedJobIds=sorted(all_seen), reviewedJobIds=sorted(reviewed),
                   candidateJobIds=sorted(candidate_ids[key]), observationAt=observation_at)
        if resolved(row, records, industries, targets, excluded):
            row["sourceStatuses"] = sorted(set(row["sourceStatuses"]) | {"resolved_observation"})
        companies.append(row)

    # Preserve resolved history without putting it back into the active queue.
    current_keys = set(observed)
    for key, old in previous.items():
        if key not in current_keys:
            companies.append(old)

    companies.sort(key=lambda row: (norm(row["company"]), row["company"]))
    ready, deferred = partition(companies, records, industries, targets, excluded)
    summary = queue_summary({"canonicalJobs": len(jobs), "indexJobs": len(index),
                             "websiteJobs": len(website)}, companies, ready, deferred)
    # Deferred observations are for checkpointing only, never AI research.
    return companies, {"summary": summary, "reviewQueue": ready,
                       "deferredObservations": deferred}


def apply_results(companies: list[dict], results: list[dict], *, covered_ids=None) -> list[dict]:
    by_key = {norm(row["company"]): row for row in companies}
    for result in results:
        name = result.get("company")
        if not name:
            raise ValueError("Every investigation result requires company")
        status = result.get("investigationStatus")
        decision = result.get("protectionDecision", "undetermined")
        employer_type = result.get("employerType")
        if status not in VALID_STATUS:
            raise ValueError(f"Invalid investigationStatus for {name}: {status}")
        if decision not in VALID_DECISIONS:
            raise ValueError(f"Invalid protectionDecision for {name}: {decision}")
        if employer_type not in VALID_TYPES:
            raise ValueError(f"Invalid employerType for {name}: {employer_type}")
        if status == "verified" and decision == "undetermined":
            raise ValueError(f"Verified company cannot remain undetermined: {name}")
        if status != "not_started" and not result.get("queries"):
            raise ValueError(f"Investigated company requires actual queries: {name}")
        if status == "verified" and decision == "delete" and not result.get("industryEvidence"):
            raise ValueError(f"Verified delete decision requires industry evidence: {name}")
        if status == "verified" and decision == "protect":
            record = result.get("protectedRecord") or {}
            if employer_type in {None, "mixed"} or record.get("employerType") != employer_type:
                raise ValueError(f"Verified protection requires a typed protectedRecord: {name}")
            if not record.get("evidence"):
                raise ValueError(f"Verified protection requires evidence: {name}")
        if status == "inconclusive" and not result.get("remainingQuestion"):
            raise ValueError(f"Inconclusive investigation requires a specific remaining question: {name}")
        key = norm(name)
        row = by_key.setdefault(key, {"company": name, "firstQueuedOn": dt.datetime.now(BEIJING).date().isoformat(), "sourceStatuses": ["carry_forward"]})
        preserved = {field: row.get(field) for field in ("firstQueuedOn", "activeJobsForKey", "websiteJobsForKey", "sourceStatuses", "historicalPendingDates")}
        row.update(copy.deepcopy(result))
        for field, value in preserved.items():
            if value is not None:
                row[field] = value
        row["lastReviewedOn"] = result.get("lastReviewedOn") or dt.datetime.now(BEIJING).date().isoformat()
        covered = (covered_ids or {}).get(key, row.get("observedJobIds", []))
        row["reviewedJobIds"] = sorted(set(row.get("reviewedJobIds", [])) | set(covered))
    return sorted(by_key.values(), key=lambda row: (norm(row["company"]), row["company"]))


def main():
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--write", action="store_true", help="Write the merged progress state in the checkout")
    parser.add_argument("--apply-results", type=Path, help="Merge an agent investigation JSON object or array")
    args = parser.parse_args()
    companies, report = discover(args.root)
    if args.apply_results:
        results = read_json(args.apply_results)
        companies = apply_results(companies, results if isinstance(results, list) else [results])
        records = {norm(row["company"]): row for row in blacklist_records(read_json(args.root / BLACKLIST), allow_legacy=False)}
        industries = {norm(key): value for key, value in read_json(args.root / INDUSTRIES, {}).items()}
        targets = read_ledger((args.root / TARGET).read_text(encoding="utf-8"), "备注")
        excluded = read_ledger((args.root / EXCLUDED).read_text(encoding="utf-8"), "排除原因")
        ready, deferred = partition(companies, records, industries, targets, excluded)
        report["reviewQueue"], report["deferredObservations"] = ready, deferred
        report["summary"] = queue_summary(report["summary"], companies, ready, deferred)
    try:
        source_commit = subprocess.check_output(("git", "rev-parse", "HEAD"), cwd=args.root, text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        source_commit = None
    payload = {
        "version": 1,
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "sourceCommit": source_commit,
        **report,
        "companies": companies,
    }
    if args.write:
        path = args.root / STATUS_PATH
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in payload.items() if key != "companies"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
