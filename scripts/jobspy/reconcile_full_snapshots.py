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
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo


BEIJING_TZ = ZoneInfo("Asia/Shanghai")


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


def location_key(item):
    value = str(item.get("location") or "").strip().casefold()
    if value in {"hk", "hong kong", "hong kong sar"}:
        return "HK"
    if value in {"sg", "singapore"}:
        return "SG"
    return "CN"


def company_location_key(company, location):
    return f"{str(company).strip().casefold()}::{str(location).strip().upper()}"


def now_iso(value=None):
    return value or datetime.now(timezone.utc).isoformat()


def timestamp(value):
    if not value:
        return None
    try:
        text = str(value).replace("Z", "+00:00")
        parsed = datetime.fromisoformat(text)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def status_ok(status):
    return str(status or "").startswith(("ok:", "empty"))


def within_repost_window(value, observed_at):
    """Return whether the JobSpy observation qualifies as a repost.

    The rule itself is the only repost test: observation must follow
    ``datePosted`` and be no later than 24 hours after it. A separate
    ``jobspyRepost`` flag is derived evidence, not an additional gate.
    """
    text = str(value or "").strip()
    if len(text) == 10:
        try:
            posted = datetime.fromisoformat(text).replace(tzinfo=BEIJING_TZ)
        except ValueError:
            posted = None
    else:
        posted = timestamp(value)
    observed = timestamp(observed_at)
    if not posted or not observed or observed < posted:
        return False
    return observed - posted <= timedelta(hours=24)


def reconcile(existing_doc, snapshot_doc, observed_at=None):
    existing = [dict(x) for x in rows(existing_doc) if isinstance(x, dict)]
    incoming = [dict(x) for x in rows(snapshot_doc)]
    observed_at = now_iso(observed_at)
    by_id = {jid(x): x for x in existing if jid(x)}
    reactivated = 0
    scope_locations = {
        str(x).strip().upper()
        for x in (snapshot_doc.get("scopeLocations", ["CN"]) if isinstance(snapshot_doc, dict) else ["CN"])
    }
    snapshot_ids = {jid(x) for x in incoming if jid(x) and location_key(x) in scope_locations}
    successful = {
        company_location_key(*str(k).rsplit("::", 1)) if "::" in str(k) else company_location_key(k, "CN"): v
        for k, v in (snapshot_doc.get("statusSummary", {}) if isinstance(snapshot_doc, dict) else {}).items()
        if status_ok(v)
    }
    # A company must be explicitly successful. Missing status is not safe enough
    # to expire anything (protects against partial artifact downloads).
    observed_companies = {
        company_location_key(*str(k).rsplit("::", 1)) if "::" in str(k) else company_location_key(k, "CN")
        for k in (snapshot_doc.get("companies", {}) if isinstance(snapshot_doc, dict) else {})
    }
    for item in incoming:
        key = jid(item)
        if not key or location_key(item) not in scope_locations:
            continue
        old = by_id.get(key, {})
        if old.get("jobStatus") == "expired":
            reactivated += 1
        merged = dict(old)
        # Listing fields are refreshed every run; detail fields are only present
        # for the incremental detail candidates and otherwise remain untouched.
        for field in ("title", "link", "company", "companyCanonical", "requestedCompany",
                      "location", "locationRaw", "datePosted", "source",
                      "sourceSite", "dataSources", "jobspyFetchedAt", "fetchedAt",
                      "jobspyFirstSeen", "jobspyLastPosted", "jobspyRepost"):
            if item.get(field) not in (None, ""):
                merged[field] = item[field]
        # JD and city enrichment remain a CN-only pipeline. Preserve any
        # existing HK/SG values and never let a lifecycle-only row add them.
        if location_key(item) == "CN":
            for field in ("city", "descriptionText", "descriptionHtml", "detailStatus",
                          "detailFetchedAt", "detailError"):
                if item.get(field) not in (None, ""):
                    merged[field] = item[field]
        # JobSpy is a lifecycle/status observer, not the feed that defines when
        # a job was pushed to the site.  Never let a snapshot row carrying an
        # incidental pushTime/firstSeen overwrite the canonical existing values.
        for field in ("pushTime", "firstSeen"):
            if old.get(field) not in (None, ""):
                merged[field] = old[field]
        merged["dataSources"] = list(dict.fromkeys(
            list(old.get("dataSources") or [])
            + list(item.get("dataSources") or [])
            + (["jobspy"] if item.get("source") == "jobspy-requests" else [])
        ))
        merged["sourceJobId"] = item.get("sourceJobId") or old.get("sourceJobId") or f"li-{key}"
        # JobSpy is the only source allowed to advance pushTime. The repost
        # decision is the 24-hour elapsed-time rule itself: observation must
        # follow datePosted and be no later than 24 hours after it. Do not
        # require a second jobspyRepost flag; that flag is derived evidence,
        # not an additional gate. Use JobSpy's datePosted as canonical
        # pushTime rather than the later workflow runtime.
        repost = bool(item.get("datePosted")) and within_repost_window(
            item.get("datePosted"), observed_at
        )
        if item.get("datePosted"):
            merged["jobspyRepost"] = repost
        if not old.get("pushTime"):
            merged["pushTime"] = observed_at
        elif repost:
            merged["pushTime"] = item.get("datePosted")
        if not old.get("firstSeen"):
            merged["firstSeen"] = item.get("jobspyFirstSeen") or item.get("datePosted") or observed_at
        elif timestamp(item.get("datePosted")) and timestamp(old.get("firstSeen")):
            if timestamp(item["datePosted"]) < timestamp(old["firstSeen"]):
                merged["firstSeen"] = item["datePosted"]
        merged["jobStatus"] = "active"
        merged["lastSeenAt"] = observed_at
        merged.pop("expiredAt", None)
        merged.pop("expiredReason", None)
        by_id[key] = merged

    expired = 0
    for key, item in by_id.items():
        location = location_key(item)
        company = company_key(item)
        company_location = company_location_key(company, location)
        if location not in scope_locations or company_location not in observed_companies or company_location not in successful:
            continue
        if key not in snapshot_ids:
            if item.get("jobStatus") != "expired":
                item["expiredAt"] = observed_at
                item["expiredReason"] = "missing_from_full_company_snapshot"
                expired += 1
            item["jobStatus"] = "expired"
        elif item.get("jobStatus") == "expired":
            item["jobStatus"] = "active"
            item.pop("expiredAt", None)
            item.pop("expiredReason", None)
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
        "scopeLocations": sorted(scope_locations),
        "expired": expired,
        "reactivated": reactivated,
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
