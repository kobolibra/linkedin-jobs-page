#!/usr/bin/env python3
"""Atomic, evidence-gated TRAE review checkpoint and classification transaction."""
from __future__ import annotations

import argparse
import copy
import importlib.util
import json
import re
import ssl
import subprocess
import sys
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts")]
import reclassify as rc
import company_review_queue as queue
from trae_bootstrap import REPO, load_config, git_env
from trae_company_review import CODE_PATHS

TYPES = {"direct_employer", "recruitment_agency", "recruitment_platform"}
FIELDS = {"company", "investigationStatus", "protectionDecision", "identityStatus",
          "industry", "industryEvidence", "employerType", "protectedRecord",
          "queries", "investigationSummary", "remainingQuestion", "lastReviewedOn"}
OBSERVED = {"company", "sourceStatuses", "activeJobsForKey", "websiteJobsForKey",
            "historicalPendingDates", "stagingNotCanonical", "indexNotCanonical",
            "firstQueuedOn", "observedFirstOn", "observedLastOn", "candidateJobIds", "observationAt"}


def iso_day(value):
    return date.fromisoformat(value).isoformat()


def evidence(entries):
    if not isinstance(entries, list) or not entries:
        raise ValueError("Verified industry requires a nonempty evidence array")
    for item in entries:
        if not isinstance(item, dict):
            raise ValueError("Industry evidence must be an object")
        link = urlsplit(rc.field(item.get("url")))
        if link.scheme != "https" or not link.hostname:
            raise ValueError("Industry evidence must have an HTTPS source")
        rc.field(item.get("note"))


def normalize_result(result, day):
    """Translate a single research result into the existing persisted schema."""
    if not isinstance(result, dict) or "decision" not in result:
        return result
    permitted = {"company", "decision", "industry", "employerType", "evidence",
                 "queries", "summary", "remainingQuestion"}
    if set(result) - permitted:
        raise ValueError("Invalid compact review result fields")
    decision = result["decision"]
    if decision not in {"protect", "delete", "inconclusive"}:
        raise ValueError("Invalid review decision")
    compact = {
        "company": result.get("company"),
        "investigationStatus": "inconclusive" if decision == "inconclusive" else "verified",
        "protectionDecision": "undetermined" if decision == "inconclusive" else decision,
        "queries": result.get("queries"),
        "lastReviewedOn": day,
    }
    if result.get("summary"):
        compact["investigationSummary"] = rc.field(result["summary"])
    if decision == "inconclusive":
        if result.get("employerType") is not None:
            raise ValueError("Inconclusive result cannot assign an employer type")
        compact["remainingQuestion"] = result.get("remainingQuestion")
        return compact
    entries = result.get("evidence")
    evidence(entries)
    compact.update(identityStatus="confirmed", industry=result.get("industry"),
                   industryEvidence=entries)
    if decision == "protect":
        kind = result.get("employerType")
        compact.update(employerType=kind, protectedRecord={
            "company": compact["company"], "employerType": kind,
            "evidence": {"url": entries[0]["url"], "reviewedOn": day, "note": entries[0]["note"]},
        })
    elif result.get("employerType") is not None:
        raise ValueError("Target company cannot assign a protected employer type")
    return compact


def validate_result(result, allowed, records, day):
    if not isinstance(result, dict) or set(result) - FIELDS:
        raise ValueError("Invalid review result fields")
    key = rc.norm(rc.field(result.get("company")))
    if key not in allowed:
        raise ValueError("Company is not in this run's review queue: " + result["company"])
    status = result.get("investigationStatus")
    decision = result.get("protectionDecision")
    if status not in {"verified", "inconclusive"}:
        raise ValueError("Submit only researched verified/inconclusive results")
    queries = result.get("queries")
    if not isinstance(queries, list) or not queries or not all(
        (isinstance(q, str) and q.strip()) or (isinstance(q, dict) and isinstance(q.get("query"), str) and q["query"].strip())
        for q in queries
    ):
        raise ValueError("Record actual search queries for " + result["company"])
    reviewed = iso_day(result.get("lastReviewedOn") or day)
    if reviewed > day:
        raise ValueError("Review date is after this run's Beijing review date")
    if status == "inconclusive":
        rc.field(result.get("remainingQuestion"))
        if decision not in {"undetermined", "protect"} or (decision == "protect" and key not in records):
            raise ValueError("An inconclusive result cannot create protection or delete jobs")
        if result.get("protectedRecord"):
            raise ValueError("Inconclusive result cannot supply a new runtime record")
        return key
    if result.get("identityStatus") != "confirmed":
        raise ValueError("Verified decisions require confirmation of the exact employer identity")
    industry = rc.field(result.get("industry"))
    if industry == "待查证" or industry.lower() in {"unknown", "undetermined"}:
        raise ValueError("Verified industry must be specific")
    evidence(result.get("industryEvidence"))
    if decision == "delete":
        if key in records:
            raise ValueError("Protected employer cannot be deleted by TRAE: " + result["company"])
        if result.get("protectedRecord") or result.get("employerType") is not None:
            raise ValueError("Non-target employers must not receive a protected employer type")
        if industry.startswith("crypto/blockchain (always included)"):
            raise ValueError("Use the verified actual crypto/blockchain industry, not the keyword-only daily-report tag")
    elif decision == "protect":
        record = result.get("protectedRecord")
        if not isinstance(record, dict) or rc.norm(rc.field(record.get("company"))) != key:
            raise ValueError("Protected record must name the same exact employer")
        if result.get("employerType") not in TYPES or record.get("employerType") != result.get("employerType"):
            raise ValueError("Protection requires a confirmed direct/agency/platform type")
        rc.blacklist_records([record], allow_legacy=False)
        if key in records and records[key]["employerType"] != record["employerType"]:
            raise ValueError("Existing protected employer corrections require a reviewed PR: " + result["company"])
    else:
        raise ValueError("Verified decisions must protect or delete")
    return key


def merge_observation(old, observation):
    row = copy.deepcopy(old or observation)
    newer = observation.get("observationAt", "") >= row.get("observationAt", "")
    if newer:
        for k in OBSERVED:
            if k in observation and k not in {"company", "firstQueuedOn", "historicalPendingDates", "observedFirstOn", "observedLastOn"}:
                row[k] = copy.deepcopy(observation[k])
    row["observedJobIds"] = sorted(set(row.get("observedJobIds", [])) | set(observation.get("observedJobIds", [])))
    row["reviewedJobIds"] = sorted(set(row.get("reviewedJobIds", [])) | set(observation.get("reviewedJobIds", [])))
    row["company"] = row.get("company") or rc.field(observation["company"])
    row.setdefault("investigationStatus", "not_started")
    row.setdefault("protectionDecision", "undetermined")
    first = [iso_day(v) for v in (row.get("firstQueuedOn"), observation.get("firstQueuedOn")) if v]
    row["firstQueuedOn"] = min(first) if first else None
    pending = set(row.get("historicalPendingDates", [])) | set(observation.get("historicalPendingDates", []))
    row["historicalPendingDates"] = sorted(iso_day(v) for v in pending)
    dates = [iso_day(v) for v in (row.get("observedFirstOn"), row.get("observedLastOn"),
             observation.get("observedFirstOn"), observation.get("observedLastOn"), *pending) if v]
    row["observedFirstOn"] = min(dates, default=None)
    row["observedLastOn"] = max(dates, default=None)
    return row


def plan_review(read, snapshot, results, day):
    """Recompute against a single current Git head on every CAS retry."""
    day = iso_day(day)
    manual = rc.requester_excluded_names(read)
    current = json.loads(read(queue.STATUS_PATH) or "{}")
    rows = {rc.norm(row["company"]): copy.deepcopy(row) for row in current.get("companies", []) if rc.norm(row["company"]) not in manual}
    allowed = {}
    observed = set()
    for eligible, observations in ((True, snapshot["reviewQueue"]),
                                   (False, snapshot.get("deferredObservations", []))):
        for observation in observations:
            key = rc.norm(rc.field(observation["company"]))
            if key in manual:
                continue
            if key in observed:
                raise ValueError("Duplicate normalized company in queue")
            observed.add(key)
            if eligible:
                allowed[key] = observation
            rows[key] = merge_observation(rows.get(key), observation)
    records_list, industries_before = rc.classifications(read)
    records = {rc.norm(row["company"]): row for row in records_list}
    targets_before = rc.read_ledger(read(rc.TARGET), "备注")
    excluded_before = rc.read_ledger(read(rc.EXCLUDED), "排除原因")
    prior_industries = rc.verified_industries(industries_before)
    seen, accepted, protections, industries, covered_ids = set(), [], [], {}, {}
    for raw in results:
        result = normalize_result(raw, day)
        key = validate_result(result, allowed, records, day)
        if key in seen:
            raise ValueError("Duplicate normalized company in result batch")
        seen.add(key)
        old = rows[key]
        if old.get("investigationStatus") == "verified":
            if result["investigationStatus"] != "verified" or old.get("protectionDecision") != result["protectionDecision"]:
                raise ValueError("A newer/previous verified decision cannot be overwritten: " + result["company"])
            if result["protectionDecision"] == "protect" and old.get("employerType") != result.get("employerType"):
                raise ValueError("Conflicting verified employer type: " + result["company"])
            if result["protectionDecision"] == "delete" and old.get("industry") != result.get("industry"):
                raise ValueError("Conflicting verified industry: " + result["company"])
            if queue.resolved(old, records, prior_industries, targets_before, excluded_before):
                continue
        # CAS retries and overlapping runs cannot submit a second investigation
        # for the same job IDs. Only the snapshot actually researched is covered.
        observation = allowed[key]
        if queue.established(key, records, prior_industries, targets_before, excluded_before):
            continue
        if not (set(observation.get("candidateJobIds", [])) - set(old.get("reviewedJobIds", []))):
            continue
        covered_ids[key] = set(observation.get("observedJobIds", [])) | set(observation.get("candidateJobIds", []))
        clean = copy.deepcopy(result)
        clean["company"] = old["company"]
        clean["lastReviewedOn"] = clean.get("lastReviewedOn") or day
        accepted.append(clean)
        if clean["investigationStatus"] == "verified":
            if clean["protectionDecision"] == "protect":
                protections.append(clean["protectedRecord"])
            else:
                industries[clean["company"]] = clean["industry"]
    changed = {}
    if protections or industries:
        # Only explicitly accepted decisions may add a new deletion entry.
        # Historical industry labels alone are not a deletion authorization.
        changed.update(rc.plan(read, day, typed_additions=protections, industries=industries, finalize=False))
    get = lambda path: changed[path] if path in changed else read(path)
    new_records, new_industries = rc.classifications(get)
    record_map = {rc.norm(row["company"]): row for row in new_records}
    normalized_industries = rc.verified_industries(new_industries)
    normalized_industries.update({key: rc.REQUESTER_EXCLUSION for key in manual})
    targets = rc.read_ledger(get(rc.TARGET), "备注")
    excluded = rc.read_ledger(get(rc.EXCLUDED), "排除原因")
    historical_days = set()
    for result in accepted:
        if result["investigationStatus"] != "verified":
            continue
        name = result["company"]
        key = rc.norm(name)
        observation = rows[key]
        first = observation.get("observedFirstOn") or observation.get("firstQueuedOn") or day
        last = observation.get("observedLastOn") or first
        if result["protectionDecision"] == "delete":
            if key in record_map or key in excluded:
                raise ValueError("Protection/history conflict for " + name)
            rc.upsert(targets, name, normalized_industries[key], first, last)
        else:
            if key in targets:
                old = targets.pop(key)
                first, last = min(first, old[2]), max(last, old[3])
            existing = excluded.get(key)
            rc.upsert(excluded, name, existing[1] if existing else rc.REASON, first, last)
        historical_days.update(observation.get("historicalPendingDates", []))
    if set(targets) & set(excluded) or set(targets) & set(record_map):
        raise ValueError("Conflicting target/protection ledgers")
    if protections or industries:
        for path, label, ledger in ((rc.TARGET, "备注", targets), (rc.EXCLUDED, "排除原因", excluded)):
            changed[path] = rc.tsv([["公司名", label, "首次出现", "最近出现"], *ledger.values()])
        for historical_day in sorted(historical_days | {day}):
            path = rc.daily_paths(historical_day)[0]
            body = get(path)
            if body is not None:
                report = rc.classify(json.loads(body), set(record_map), normalized_industries)
                changed.update(rc.daily_files(historical_day, report))
    companies = queue.apply_results(list(rows.values()), accepted, covered_ids=covered_ids)
    for row in companies:
        key = rc.norm(row["company"])
        row["existingRecord"] = record_map.get(key)
        row["existingIndustry"] = normalized_industries.get(key)
    for result in accepted:
        if result["investigationStatus"] == "verified":
            row = next(x for x in companies if rc.norm(x["company"]) == rc.norm(result["company"]))
            if not queue.resolved(row, record_map, normalized_industries, targets, excluded):
                raise ValueError("Verified decision failed runtime reconciliation: " + result["company"])
    ready, waiting = queue.partition(companies, record_map, normalized_industries, targets, excluded)
    summary = queue.queue_summary(snapshot.get("summary") or {}, companies, ready, waiting)
    payload = {"version": 1, "sourceCommit": snapshot.get("sourceCommit"),
               "summary": summary, "reviewQueue": ready, "companies": companies}
    old_payload = {k: v for k, v in current.items() if k != "generatedAt"}
    if payload != old_payload:
        payload["generatedAt"] = datetime.now(timezone.utc).isoformat()
        changed[queue.STATUS_PATH] = rc.json_text(payload) + "\n"
    return changed


def plan_prepare(read, snapshot, jobs, day):
    """One transaction for today's report and the observed review checkpoint."""
    spec = importlib.util.spec_from_file_location("daily_report", ROOT / "auto-daily-companies.py")
    daily = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(daily)
    report = daily.plan_daily_report(read, jobs, day)
    overlay = lambda path: report[path] if path in report else read(path)
    return {**report, **plan_review(overlay, snapshot, [], day)}


def remaining_snapshot(snapshot, state):
    """Keep only still-due companies from this run's original observation."""
    live = {rc.norm(row["company"]): row for row in state["reviewQueue"]}
    ready = []
    for row in snapshot["reviewQueue"]:
        current = live.get(rc.norm(row["company"]))
        if current and (set(row.get("candidateJobIds", []))
                        & set(current.get("candidateJobIds", []))
                        - set(current.get("reviewedJobIds", []))):
            ready.append(row)
    summary = dict(snapshot.get("summary") or {})
    summary["reviewQueue"] = len(ready)
    summary["queueByStatus"] = {}
    summary["queueBySource"] = {}
    for row in ready:
        status = row.get("investigationStatus", "not_started")
        summary["queueByStatus"][status] = summary["queueByStatus"].get(status, 0) + 1
        for source in row.get("sourceStatuses", []):
            summary["queueBySource"][source] = summary["queueBySource"].get(source, 0) + 1
    for key in ("stagingNotCanonical", "indexNotCanonical"):
        summary[key] = sum(bool(row.get(key)) for row in ready)
    return dict(snapshot, reviewQueue=ready, summary=summary)


def main():
    p = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    p.add_argument("--queue", required=True, type=Path)
    p.add_argument("--results", type=Path)
    p.add_argument("--date", required=True)
    p.add_argument("--code-commit", required=True)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--prepare", action="store_true", help="Internal report and checkpoint transaction")
    args = p.parse_args()
    if args.prepare and (args.results or args.dry_run):
        raise ValueError("Preparation cannot submit research results or dry-run")
    run = ROOT.parent
    if not run.name.startswith("run.") or args.queue.resolve() != run / "company-review-queue.json":
        raise ValueError("Use a fresh TRAE run's own review queue")
    if args.results and not args.results.resolve().is_relative_to(run):
        raise ValueError("Use research results from the same run")
    if not re.fullmatch(r"[0-9a-f]{40}", args.code_commit):
        raise ValueError("Invalid pinned code commit")
    snapshot = json.loads(args.queue.read_text(encoding="utf-8"))
    results = json.loads(args.results.read_text(encoding="utf-8")) if args.results else []
    if not isinstance(results, list):
        raise ValueError("Research results must be an array")
    cfg = load_config()
    env = git_env(cfg)
    def guard(head):
        subprocess.run(["git", "-C", str(ROOT), "fetch", "--depth=1", "--no-tags", "origin", head], check=True, env=env)
        diff = subprocess.check_output(["git", "-C", str(ROOT), "diff", "--name-only", args.code_commit, head, "--", *CODE_PATHS], text=True, env=env)
        if diff:
            raise RuntimeError("Business code changed before transaction; restart from latest main")
    handlers = [urllib.request.HTTPSHandler(context=ssl.create_default_context())]
    if cfg.get("proxy"):
        handlers.append(urllib.request.ProxyHandler(dict.fromkeys(("http", "https"), cfg["proxy"])))
    repo = rc.Repo(cfg["github_token"], REPO, "main", urllib.request.build_opener(*handlers))
    jobs = json.loads((ROOT / "jobs.json").read_text(encoding="utf-8")) if args.prepare else None
    committed_state = {}

    def build(read):
        changes = (plan_prepare(read, snapshot, jobs, args.date) if args.prepare
                   else plan_review(read, snapshot, results, args.date))
        state = changes.get(queue.STATUS_PATH)
        committed_state["value"] = json.loads(state if state is not None else read(queue.STATUS_PATH))
        return changes

    message = ("Prepare company review" if args.prepare else
               "Apply verified company review" if args.results else "Checkpoint company review queue")
    repo.transact(build, message + " " + run.name, args.dry_run, head_guard=guard)
    if not args.dry_run:
        from trae_company_review import save
        save(args.queue, remaining_snapshot(snapshot, committed_state["value"]))


if __name__ == "__main__":
    main()
