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

from linkedin_ids import linkedin_job_id
from posting_dates import apply_posting_date, is_repost, posting_day, last_posted, source_date_unchanged


BEIJING_TZ = ZoneInfo("Asia/Shanghai")


def rows(doc):
    if isinstance(doc, list):
        return doc
    return doc.get("jobs", []) if isinstance(doc, dict) else []


def jid(item):
    raw = str(item.get("sourceJobId") or item.get("link") or "").strip()
    return linkedin_job_id(raw) or raw


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


def query_observation_times(snapshot, incoming, completed):
    """Absence is only evidence as of this company/region query's start.

    Old immutable snapshots have row timestamps but no query metadata. Their
    earliest row observation is a conservative compatibility boundary. Explicit
    but invalid/missing metadata is never replaced by the later run completion.
    """
    result = {}
    for item in incoming:
        key = company_location_key(company_key(item), location_key(item))
        when = timestamp(item.get('jobspyFetchedAt') or item.get('fetchedAt'))
        if when and when <= completed:
            result[key] = min(result.get(key, when), when)
    row_times = dict(result)
    if isinstance(snapshot,dict) and 'queryStartedAt' in snapshot:
        starts = snapshot['queryStartedAt']
        keys = set(snapshot.get('statusSummary', {})) | set(snapshot.get('companies', {}))
        explicit = {}
        for raw in keys:
            key = company_location_key(*str(raw).rsplit('::',1)) if '::' in str(raw) else company_location_key(raw,'CN')
            when = timestamp(starts.get(raw)) if isinstance(starts,dict) else None
            # A claimed start later than one of its rows is contradictory too.
            boundary = when if when and when <= row_times.get(key,completed) else None
            if key in explicit and explicit[key] != boundary:
                boundary = None
            explicit[key] = boundary
        result.update(explicit)
    return result



def reconcile(existing_doc, snapshot_doc, observed_at=None):
    existing = [dict(x) for x in rows(existing_doc) if isinstance(x, dict)]
    incoming = [dict(x) for x in rows(snapshot_doc)]
    observed_at = now_iso(observed_at)
    observed_time = timestamp(observed_at)
    if observed_time is None:
        raise ValueError("snapshot observed_at must be a valid timestamp")
    # The existing executor marker is rounded down to whole seconds. A row
    # fetched within that final second is not a future observation.
    completed_through = observed_time if re.search(r'[T ]\d{2}:\d{2}:\d{2}[.,]\d+',str(observed_at)) else observed_time + timedelta(microseconds=999999)
    previous_snapshot = existing_doc.get("jobspySnapshot", {}) if isinstance(existing_doc, dict) else {}
    previous_time = timestamp(previous_snapshot.get("observedAt"))
    # RSS merges can run several times against one immutable JobSpy snapshot.
    # Replaying it must not undo discoveries or status changes made afterwards.
    if previous_time and observed_time <= previous_time:
        return {**existing_doc, "jobs": existing}
    by_id = {jid(x): x for x in existing if jid(x)}
    query_times = query_observation_times(snapshot_doc, incoming, completed_through)
    reactivated = 0
    protected_ids = set()
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
        query_key = company_location_key(company_key(item),location_key(item))
        raw_time = item.get('jobspyFetchedAt') or item.get('fetchedAt')
        item_time = timestamp(raw_time) if raw_time else query_times.get(query_key,observed_time)
        # Run completion follows detail/liveness work; it is not a listing
        # observation. Never let an older row undo newer RSS/probe evidence.
        if item_time is None or item_time > completed_through or any((when := timestamp(old.get(field))) and when > item_time
               for field in ("lastSeenAt", "rssObservedAt", "liveVerifiedAt", "expiredAt")):
            protected_ids.add(key)
            continue
        if old.get("jobStatus") == "expired":
            reactivated += 1
        merged = dict(old)
        # Listing fields are refreshed every run; detail fields are only present
        # for the incremental detail candidates and otherwise remain untouched.
        for field in ("title", "link", "company", "companyCanonical", "requestedCompany",
                      "location", "locationRaw", "source",
                      "sourceSite", "dataSources", "jobspyFetchedAt", "fetchedAt",
                      "jobspyFirstSeen", "companyLogoSource"):
            if item.get(field) not in (None, ""):
                merged[field] = item[field]
        # Other employers remain lifecycle-only outside CN. State Street has
        # explicitly collected HK/SG JD, which must reach canonical jobs.
        detail_allowed = (location_key(item) == "CN" or
                          (company_key(item) == "state street" and location_key(item) in ("HK", "SG")
                           and item.get("detailStatus") == "ok"))
        if detail_allowed:
            for field in ("city", "descriptionText", "descriptionHtml", "detailStatus",
                          "detailFetchedAt", "detailError", "jdChangeStatus", "jdCheckedAt",
                          "jdChangedAt", "jdDiffHtml", "jdDiffPreviousText", "jdDiffCurrentText"):
                if item.get(field) not in (None, ""):
                    merged[field] = item[field]
        if detail_allowed and item.get("detailStatus") == "ok":
            merged.pop("detailError", None)
        if detail_allowed and item.get("jdChangeStatus") == "unchanged":
            for field in ("jdChangedAt", "jdDiffHtml", "jdDiffPreviousText", "jdDiffCurrentText"):
                merged.pop(field, None)
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
        # CN/HK/SG share the same source-date advancement test. A delayed
        # observation still proves a repost; repeated dates do not reset time.
        raw_posted = item.get("linkedinPostedRaw")
        # Never treat a date-only UTC/source calendar reinterpreted as local as a repost.
        source_unchanged = bool(old and raw_posted and source_date_unchanged(old, raw_posted))
        repost = bool(old) and not source_unchanged and is_repost(old, item.get("datePosted"), observed_at)
        if not old.get("pushTime"):
            merged["pushTime"] = observed_at
        previous = last_posted(old)
        if previous:
            merged["postingLastDate"] = previous.isoformat()
        elif old:
            merged.pop("datePosted", None)
        if not source_unchanged:
            apply_posting_date(merged, item.get("datePosted"), observed_at, "linkedin-search")
        if not source_unchanged and posting_day(item.get("datePosted")) and posting_day(item["datePosted"]) <= posting_day(observed_at):
            merged["datePosted"] = item["datePosted"]
        # Persist evidence only for newly seen rows or genuine source-date advances.
        # Never rewrite a legacy canonical posting day during the transition.
        if not old or not source_unchanged:
            for field in ("linkedinPostedRaw", "linkedinPostedRelative", "linkedinPostedDateSource"):
                if item.get(field) not in (None, ""):
                    merged[field] = item[field]
        elif raw_posted and not old.get("linkedinPostedRaw"):
            merged["linkedinPostedRaw"] = raw_posted
        if item.get("datePosted"):
            merged["jobspyRepost"] = repost
        watermark = last_posted(merged)
        if watermark:
            merged["jobspyLastPosted"] = watermark.isoformat()
        if not old.get("firstSeen"):
            merged["firstSeen"] = item.get("jobspyFirstSeen") or item.get("datePosted") or observed_at

        merged["jobStatus"] = "active"
        merged["lastSeenAt"] = item_time.isoformat()
        merged.pop("expiredAt", None)
        merged.pop("expiredReason", None)
        by_id[key] = merged

    expired = 0
    for key, item in by_id.items():
        if key in protected_ids:
            continue
        location = location_key(item)
        company = company_key(item)
        company_location = company_location_key(company, location)
        if location not in scope_locations or company_location not in observed_companies or company_location not in successful:
            continue
        if key not in snapshot_ids:
            cutoff = query_times.get(company_location,observed_time)
            if cutoff is None:
                continue
            # RSS observation time is separate from firstSeen/datePosted, which
            # may be backfilled. Retain legacy timestamps for older records.
            presence_times = [timestamp(item.get(field)) for field in (
                "rssObservedAt", "observedAt", "lastSeenAt", "liveVerifiedAt", "firstSeen",
            )]
            if any(when is not None and when >= cutoff for when in presence_times):
                continue
            if item.get("jobStatus") != "expired":
                item["expiredAt"] = observed_at
                item["expiredReason"] = "missing_from_full_company_snapshot"
                expired += 1
            item["jobStatus"] = "expired"
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
        "queryStartedAt": {key: when.isoformat() if when else None for key,when in sorted(query_times.items())},
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


