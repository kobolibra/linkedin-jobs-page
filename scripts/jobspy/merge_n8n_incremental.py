#!/usr/bin/env python3
"""Merge n8n RSS and WIP staging data into the canonical lifecycle document."""
import argparse
import json
import re
from pathlib import Path

COMPANY_ALIASES = {
    "socgen": "societe generale",
    "法国兴业银行(中国)有限公司": "societe generale",
    "渣打环球商业服务有限公司": "standard chartered",
    "摩根大通亚洲咨询(北京)有限公司": "jpmorgan chase",
}
TARGET_COMPANIES = {
    "ubs", "state street", "jpmorgan chase", "dbs", "morgan stanley", "anz",
    "standard chartered", "hsbc", "citi", "deutsche bank", "societe generale", "bank of america",
}
TITLE_TOKEN_ALIASES = {
    "sr": ["senior"], "snr": ["senior"], "mgr": ["manager"],
    "rep": ["representative"], "asst": ["assistant"], "assoc": ["associate"],
    "vp": ["vice", "president"], "avp": ["assistant", "vice", "president"],
    "svp": ["senior", "vice", "president"], "specialists": ["specialist"],
    "representatives": ["representative"],
}


def job_key(job):
    raw = str(job.get("sourceJobId") or job.get("link") or "").strip()
    match = re.search(r"(?:li-|ln:)?(\d{7,})", raw)
    return match.group(1) if match else raw


def nonempty(value):
    return value is not None and value != "" and value != [] and value != {}


def norm(value):
    return str(value or "").strip().casefold()


def normalize_company(value):
    company = re.sub(r"\s+", " ", norm(value))
    return COMPANY_ALIASES.get(company, company)


def normalize_title(value, company=""):
    title = str(value or "")
    title = re.sub(r"^\s*(?:[a-z]{1,5}[-_]?)?\d{6,}\b[\s:|–—-]*", " ", title, flags=re.I)
    title = re.sub(r"\bID\s*\d{6}\b", " ", title, flags=re.I)
    title = re.sub(r"[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]", " ", title)
    tokens = re.sub(r"[^a-z0-9]+", " ", title, flags=re.I).strip().casefold().split()
    expanded = []
    for token in tokens:
        expanded.extend(TITLE_TOKEN_ALIASES.get(token, [token]))
    result = " ".join(expanded)
    if normalize_company(company) == "hsbc":
        result = re.sub(r"\s+sub branch$", "", result).strip()
    return result


def merge_sources(current, incoming):
    return list(dict.fromkeys(
        list(current.get("dataSources") or [])
        + list(incoming.get("dataSources") or [])
        + ["n8n-rss"]
    ))


def batch_rows(doc):
    if isinstance(doc, list):
        return doc
    if isinstance(doc, dict) and isinstance(doc.get("jobs"), list):
        return doc["jobs"]
    raise ValueError("n8n RSS snapshot must be an array or an object with jobs[]")


def apply_salary_snapshot(rows, batch_doc):
    salary_rows = batch_doc.get("salaryRows") if isinstance(batch_doc, dict) else None
    if not isinstance(salary_rows, list) or not salary_rows:
        return 0
    salary_by_key = {}
    for row in salary_rows:
        company = normalize_company(row.get("Company"))
        title = normalize_title(row.get("Title"), company)
        salary = str(row.get("Location") or "").strip()
        if company in TARGET_COMPANIES and title and salary:
            salary_by_key[f"{company}|{title}"] = salary
    matches = 0
    for job in rows:
        job.pop("salary", None)
        company = normalize_company(job.get("company"))
        if str(job.get("location") or "").upper() != "CN" or company not in TARGET_COMPANIES:
            continue
        salary = salary_by_key.get(f"{company}|{normalize_title(job.get('title'), company)}")
        if salary:
            job["salary"] = salary
            matches += 1
    return matches


def merge_documents(baseline, batch_doc):
    if not isinstance(baseline, dict) or not isinstance(baseline.get("jobs"), list):
        raise ValueError("baseline must be the lifecycle snapshot object")
    batch = batch_rows(batch_doc)
    observed_at = batch_doc.get("generatedAt") if isinstance(batch_doc, dict) else None
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
            for field, value in incoming.items():
                if field in {"firstSeen", "source"} or not nonempty(value):
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
            merged.setdefault("firstSeen", merged.get("pushTime") or observed_at)
            merged["dataSources"] = merge_sources({}, merged)
            merged["jobStatus"] = "active"
            merged["missingSnapshotCount"] = 0
            rows.append(merged)
            by_key[key] = len(rows) - 1
            added += 1
    salary_matches = apply_salary_snapshot(rows, batch_doc)
    result = dict(baseline)
    result["jobs"] = rows
    result["count"] = len(rows)
    result["n8nIncrementalMerge"] = {
        "mergedAt": observed_at, "batchJobs": len(batch), "mergedJobs": len(rows),
        "added": added, "updated": updated, "reactivated": reactivated,
        "salaryMatches": salary_matches, "source": "n8n RSS staging snapshot",
        "firstSeenPolicy": "immutable-for-existing-id", "pushTimePolicy": "RSS-repost-may-advance",
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
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
