#!/usr/bin/env python3
"""Rules for probing non-target CN LinkedIn jobs without side effects."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
import re

from fetch_linkedin_requests import COMPANIES
from reconcile_full_snapshots import jid, location_key, company_key

LIVENESS_EXPIRED_REASONS = {
    "linkedin_closed", "linkedin_not_accepting", "linkedin_removed",
}
COVERED = {str(spec.get("canonical", "")).strip().casefold() for spec in COMPANIES.values()}
_APPLY_CONTROL = re.compile(r'data-tracking-control-name\s*=\s*["\']public_jobs_apply-link-(?:offsite|onsite)', re.I)
_CANONICAL = re.compile(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)', re.I)

def parse_time(value):
    if not value:
        return None
    try:
        text = str(value).replace("Z", "+00:00")
        result = datetime.fromisoformat(text)
        return result if result.tzinfo else result.replace(tzinfo=timezone.utc)
    except ValueError:
        return None

def iso(value=None):
    if value:
        return str(value)
    return datetime.now(timezone.utc).isoformat()

def in_scope(row, location="CN"):
    if location_key(row) != str(location).upper():
        return False
    if company_key(row) in COVERED:
        return False
    status = row.get("jobStatus")
    reason = row.get("expiredReason")
    return status != "expired" or reason in LIVENESS_EXPIRED_REASONS

def _page_matches(html, job_id):
    text = str(html or "")
    canonical = _CANONICAL.search(text)
    canonical_ok = bool(canonical and str(job_id) in canonical.group(1))
    title_ok = bool(re.search(r'class=["\'][^"\']*top-card-layout__title[^"\']*["\']', text, re.I))
    body_ok = bool(re.search(r'class=["\'][^"\']*show-more-less-html__markup[^"\']*["\']', text, re.I))
    return canonical_ok and title_ok and body_ok

def classify(status_code, html, job_id):
    """Classify only a structurally verified LinkedIn guest detail page."""
    status = int(status_code or 0)
    if status == 404:
        return "gone"
    if status != 200 or not _page_matches(html, job_id):
        return "unknown"
    text = str(html or "")
    if re.search(r'class=["\'][^"\']*closed-job[^"\']*["\']', text, re.I) and re.search(r"No longer accepting applications", text, re.I):
        return "closed"
    if _APPLY_CONTROL.search(text):
        return "open"
    return "not_accepting"

def _last(row):
    return parse_time(row.get("liveCheckedAt"))

def select_candidates(rows, now=None, max_probes=150, min_interval_hours=20, gone_confirm_hours=12, recheck_expired_hours=72, recheck_expired_days=30, location="CN"):
    now = parse_time(now) or datetime.now(timezone.utc)
    priorities = []
    for row in rows:
        if not isinstance(row, dict) or not in_scope(row, location):
            continue
        last = _last(row)
        age_hours = (now - last).total_seconds() / 3600 if last else None
        first_miss = parse_time(row.get("liveFirstMissAt"))
        status = row.get("jobStatus")
        # Expired jobs have their own clock, including legacy rows with a
        # leftover first-miss marker. They must not enter active-job branches.
        if status == "expired":
            expired_at = parse_time(row.get("expiredAt")) or last
            checked_at = last or expired_at
            if expired_at is None or checked_at is None:
                continue
            expired_age = (now - expired_at).total_seconds() / 3600
            check_age = (now - checked_at).total_seconds() / 3600
            if not (0 <= expired_age <= recheck_expired_days * 24 and check_age >= recheck_expired_hours):
                continue
            rank = 3
        elif first_miss and age_hours is not None and (now - first_miss).total_seconds() >= gone_confirm_hours * 3600:
            rank = 0
        elif last is None:
            rank = 1
        elif age_hours >= min_interval_hours:
            rank = 2
        else:
            continue
        priorities.append((rank, last or datetime.min.replace(tzinfo=timezone.utc), parse_time(row.get("firstSeen")) or datetime.min.replace(tzinfo=timezone.utc), row))
    priorities.sort(key=lambda item: (item[0], item[1], -item[2].timestamp()))
    return [item[3] for item in priorities[:max(0, int(max_probes))]]

def apply_observation(row, result, observed_at=None, gone_confirm_hours=12):
    """Mutate and return one row; stale observations are ignored."""
    observed_at = iso(observed_at)
    when = parse_time(observed_at)
    checked = parse_time(row.get("liveCheckedAt"))
    if checked and when and when <= checked:
        return row
    result = str(result or "unknown")
    row["liveCheckedAt"] = observed_at
    if result == "unknown":
        return row
    if result == "open":
        was_liveness_expired = row.get("expiredReason") in LIVENESS_EXPIRED_REASONS
        row["liveStatus"] = "open"
        row["liveVerifiedAt"] = observed_at
        row["liveMissCount"] = 0
        row.pop("liveFirstMissAt", None)
        if was_liveness_expired:
            row["jobStatus"] = "active"
            row.pop("expiredAt", None)
            row.pop("expiredReason", None)
        return row
    if result == "closed":
        row["liveStatus"] = "closed"
        row["liveMissCount"] = int(row.get("liveMissCount") or 0) + 1
        row["jobStatus"] = "expired"
        row.pop("liveFirstMissAt", None)
        if row.get("expiredReason") != "linkedin_closed" or not row.get("expiredAt"):
            row["expiredAt"] = observed_at
            row["expiredReason"] = "linkedin_closed"
        return row
    reason = "linkedin_removed" if result == "gone" else "linkedin_not_accepting"
    if row.get("jobStatus") == "expired" and row.get("expiredReason") in LIVENESS_EXPIRED_REASONS:
        # A repeat negative result is a recheck, not a new pending confirmation.
        row["liveStatus"] = result
        row["liveMissCount"] = int(row.get("liveMissCount") or 0) + 1
        row.pop("liveFirstMissAt", None)
        return row
    first = parse_time(row.get("liveFirstMissAt"))
    if not first:
        row["liveFirstMissAt"] = observed_at
        row["liveMissCount"] = 1
        row["liveStatus"] = result
        return row
    row["liveMissCount"] = int(row.get("liveMissCount") or 0) + 1
    row["liveStatus"] = result
    if when and (when - first).total_seconds() >= gone_confirm_hours * 3600:
        row["jobStatus"] = "expired"
        row.pop("liveFirstMissAt", None)
        if row.get("expiredReason") != reason or not row.get("expiredAt"):
            row["expiredAt"] = observed_at
            row["expiredReason"] = reason
    return row

__all__ = ["COVERED", "LIVENESS_EXPIRED_REASONS", "apply_observation", "classify", "in_scope", "select_candidates", "jid"]
