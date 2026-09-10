#!/usr/bin/env python3
"""Reconcile successful JobSpy company snapshots with the canonical jobs file.

Search/list discovery is deliberately full-snapshot based. Detail fields are not
re-fetched here: incoming rows only update listing metadata, while existing JD
fields remain untouched unless the detail pipeline supplied them beforehand.
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path


def rows(doc):
    if isinstance(doc, list):
        return doc
    return doc.get("jobs", []) if isinstance(doc, dict) else []


def jid(item):
    raw = str(item.get("sourceJobId") or item.get("link") or "").strip()
    match = re.search(r"(?:li-|ln:)?(\d{7,})", raw)
    return match.group(1) if match else raw


def company_key(item):
    return str(item.get("companyCanonical") or item.get("requestedCompany") or item.get("company") or "").strip().casefold()


def now_iso(value=None):
    return value or datetime.now(timezone.utc).isoformat()


def status_ok(status):
    return str(status or "").startswith(("ok:", "empty"))


def parse_time(value):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed
    except ValueError:
        return None


def reconcile(existing_doc, snapshot_doc, observed_at=None):
    existing = [dict(x) for x in rows(existing_doc) if isinstance(x, dict)]
    incoming = [dict(x) for x in rows(snapshot_doc)]
    observed_at = now_iso(observed_at)
    by_id = {jid(x): x for x in existing if jid(x)}
    reactivated = 0
    snapshot_ids = {jid(x) for x in incoming if jid(x)}
    successful = {
        str(k).casefold(): v
        for k, v in (snapshot_doc.get("statusSummary", {}) if isinstance(snapshot_doc, dict) else {}).items()
        if status_ok(v)
    }
    # A company must be explicitly successful. Missing status is not safe enough
    # to expire anything (protects against partial artifact downloads).
    observed_companies = {
        str(k).casefold()
        for k in (snapshot_doc.get("companies", {}) if isinstance(snapshot_doc, dict) else {})
    }
    for item in incoming:
        key = jid(item)
        if not key:
            continue
        old = by_id.get(key, {})
        if old.get("jobStatus") == "expired":
            reactivated += 1
        merged = dict(old)
        # Listing fields are refreshed every run; detail fields are only present
        # for the incremental detail candidates and otherwise remain untouched.
        for field in ("title", "link", "company", "companyCanonical", "requestedCompany",
                      "location", "locationRaw", "city", "datePosted", "source",
                      "sourceSite", "dataSources", "jobspyFetchedAt", "fetchedAt",
                      "descriptionText", "descriptionHtml", "detailStatus",
                      "detailFetchedAt", "detailError"):
            if item.get(field) not in (None, ""):
                merged[field] = item[field]
        merged["sourceJobId"] = item.get("sourceJobId") or old.get("sourceJobId") or f"li-{key}"
        merged["jobStatus"] = "active"
        merged["lastSeenAt"] = observed_at
        merged.pop("expiredAt", None)
        merged.pop("expiredReason", None)
        by_id[key] = merged

    expired = 0
    grace_recovered = 0
    for key, item in by_id.items():
        company = company_key(item)
        if company not in observed_companies or company not in successful:
            continue
        if key not in snapshot_ids:
            first_seen = parse_time(item.get("firstSeen") or item.get("pushTime"))
            age_hours = ((parse_time(observed_at) or datetime.now(timezone.utc)) - first_seen).total_seconds() / 3600 if first_seen else None
            # LinkedIn's guest search can omit a listing intermittently. A newly
            # discovered job is especially vulnerable because it may be outside
            # the current ranking window; never kill it during its first 24h.
            if age_hours is not None and age_hours < 24:
                item["jobStatus"] = "active"
                item["missingSnapshotCount"] = 0
                item.pop("expiredAt", None)
                item.pop("expiredReason", None)
                grace_recovered += 1
                continue
            missing = int(item.get("missingSnapshotCount") or 0) + 1
            item["missingSnapshotCount"] = missing
            if missing < 2:
                item["jobStatus"] = "active"
                item["expiredReason"] = "missing_from_full_company_snapshot_pending_confirmation"
                continue
            if item.get("jobStatus") != "expired":
                item["expiredAt"] = observed_at
                item["expiredReason"] = "missing_from_full_company_snapshot"
                expired += 1
            item["jobStatus"] = "expired"
        elif item.get("jobStatus") == "expired":
            item["jobStatus"] = "active"
            item.pop("expiredAt", None)
            item.pop("expiredReason", None)
            item["missingSnapshotCount"] = 0
        elif item.get("missingSnapshotCount"):
            item["missingSnapshotCount"] = 0
        item.setdefault("lastSeenAt", observed_at if key in snapshot_ids else None)

    result = existing_doc if isinstance(existing_doc, dict) else None
    if result is None:
        result = {"schemaVersion": "2.0", "jobs": list(by_id.values())}
    else:
        result = dict(result)
        result["jobs"] = list(by_id.values())
    result["count"] = len(result["jobs"])
    result["jobStatusUpdatedAt"] = observed_at
    result["jobspySnapshot"] = {
        "mode": "full-company-snapshot",
        "observedAt": observed_at,
        "successfulCompanies": sorted(successful),
        "incoming": len(snapshot_ids),
        "expired": expired,
        "reactivated": reactivated,
        "graceRecovered": grace_recovered,
    }
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--existing", type=Path, required=True)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--observed-at")
    args = parser.parse_args()
    existing = json.loads(args.existing.read_text(encoding="utf-8"))
    snapshot = json.loads(args.snapshot.read_text(encoding="utf-8"))
    result = reconcile(existing, snapshot, args.observed_at)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result["jobspySnapshot"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
