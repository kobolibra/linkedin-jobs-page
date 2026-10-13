"""Company snapshots for non-target liveness; no target-company configuration.

The public listing transport matches JobSpy's f_C search, but keeps explicit
completion evidence instead of treating every returned partial list as complete.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from urllib.parse import urlsplit

from bs4 import BeautifulSoup
import requests

from fetch_linkedin_requests import is_empty_search_page, listing_region
from linkedin_http import RequestStopped, block_page
from linkedin_ids import linkedin_job_id
from logo_sources import key as employer_key, source_hint
from posting_dates import posting_day
from job_liveness import jid

SEARCH_URL = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
LOCATIONS = {"CN": "China", "HK": "Hong Kong", "SG": "Singapore"}


def company_url(value):
    parsed = urlsplit(str(value or ""))
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not (host == "linkedin.com" or host.endswith(".linkedin.com")):
        return ""
    if not re.fullmatch(r"/(company|school|showcase)/[^/]+/?", parsed.path):
        return ""
    return "https://www.linkedin.com" + parsed.path.rstrip("/").lower()


def employer_url(row):
    hint = row.get("companyLogoSource")
    hint = hint if isinstance(hint, dict) else {}
    return company_url(row.get("companyUrl") or hint.get("companyUrl"))


def identity_key(row):
    # URL plus name prevents a different employer with the same display name
    # from borrowing an identity. Names alone are never a strict search filter.
    return employer_url(row) + "|" + employer_key(row.get("company"))


def verified_identity(html, row, checked_at):
    soup = html if isinstance(html, BeautifulSoup) else BeautifulSoup(html or "", "html.parser")
    canonical = soup.select_one('link[rel="canonical"][href]')
    parsed = urlsplit(canonical.get('href','')) if canonical else urlsplit('')
    host = (parsed.hostname or '').lower()
    if (not (host == 'linkedin.com' or host.endswith('.linkedin.com'))
            or linkedin_job_id(parsed.path) != jid(row)
            or not soup.select_one('.top-card-layout__title')
            or not soup.select_one('.show-more-less-html__markup')):
        return None
    org = soup.select_one("a.topcard__org-name-link")
    meta = soup.select_one('meta[name="companyId"]')
    value = str(meta.get("content", "")) if meta else ""
    url = company_url(org.get("href")) if org else ""
    if not org or not value.isdigit() or not url or employer_key(org.get_text(" ", strip=True)) != employer_key(row.get("company")):
        return None
    if employer_url(row) and employer_url(row) != url:
        return None
    return {"companyId": value, "companyUrl": url, "employerName": org.get_text(" ", strip=True),
            "sourceJobId": jid(row), "verifiedAt": checked_at, "regions": {}}


def cached_identity(row, cache):
    record = cache.get(identity_key(row))
    if not isinstance(record, dict) or not str(record.get("companyId", "")).isdigit():
        return None
    if not str(record.get("sourceJobId", "")).isdigit() or not posting_day(record.get("verifiedAt")):
        return None
    if employer_key(record.get("employerName")) != employer_key(row.get("company")):
        return None
    url = company_url(record.get("companyUrl"))
    if not url or employer_url(row) and url != employer_url(row):
        return None
    return record


def prefer_snapshot(group, record, region):
    """Use measured complete-query cost when available, otherwise shared jobs."""
    previous = record.get("regions", {}).get(region, {}) if record else {}
    cost = previous.get("requests") if previous.get("complete") or previous.get('reason')=='linkedin-pagination-boundary' else None
    if isinstance(cost, int) and cost > 0:
        # A detail normally needs one view plus one exact-date search.
        return cost <= 2 * len(group)
    return len(group) > 1


def parse_listing(html, record, region, observed_at):
    """Return exact-ID cards and whether all returned markup was trustworthy."""
    soup = BeautifulSoup(html or "", "html.parser")
    cards = soup.select("div.base-search-card")
    if not cards:
        return {}, is_empty_search_page(html), 0
    jobs = {}
    for card in cards:
        link = card.select_one("a.base-card__full-link[href]")
        title = card.select_one("h3.base-search-card__title")
        org = card.select_one("h4.base-search-card__subtitle a[href]")
        loc = card.select_one("span.job-search-card__location")
        if not link or not title or not title.get_text(strip=True) or not org or not loc:
            return jobs, False, len(cards)
        parsed = urlsplit(link.get("href", ""))
        host = (parsed.hostname or "").lower()
        key = linkedin_job_id(link.get("href", ""))
        urn = str(card.get("data-entity-urn", "")).rsplit(":", 1)[-1]
        if not key or not (host == "linkedin.com" or host.endswith(".linkedin.com")) or urn and urn != key:
            return jobs, False, len(cards)
        if company_url(org.get("href")) != company_url(record["companyUrl"]):
            return jobs, False, len(cards)
        if employer_key(org.get_text(" ", strip=True)) != employer_key(record["employerName"]):
            return jobs, False, len(cards)
        observed_region = listing_region(loc.get_text(" ", strip=True))
        if observed_region != region:
            # Unknown geography is insufficient evidence for a complete
            # regional snapshot, even when the server returned HTTP 200.
            return jobs, False, len(cards)
        date = card.select_one("time[datetime]")
        day = posting_day(date.get("datetime")) if date else None
        if day and day > posting_day(observed_at):
            day = None
        if key in jobs and jobs[key].get("datePosted") != (day.isoformat() if day else None):
            return {}, False, len(cards)
        item = {"jobId": key}
        if day:
            item["datePosted"] = day.isoformat()
        hint = source_hint(card, record["employerName"], link.get("href"), observed_at)
        if hint:
            item["companyLogoSource"] = hint
        jobs[key] = item
    return jobs, True, len(cards)


def fetch_snapshot(session, record, region, selected_ids, timeout, progress=None):
    """Stop once all selected IDs are found; otherwise require a verified end.

    No time deadline. The 1000 offset is LinkedIn's pagination boundary, not a
    collection deadline. Reaching it yields a partial snapshot, never absence.
    """
    snapshot = {"companyId": record["companyId"], "companyUrl": record["companyUrl"],
                "employerName": record["employerName"], "region": region,
                "complete": False, "requests": 0, "jobs": {}, "reason": "partial"}
    empty = 0
    original = session.context
    try:
        for start in range(0, 1000, 10):
            session.context = {"stage": "liveness", "endpoint": "company-list", "company": record["employerName"],
                               "region": region, "pageStart": start}
            snapshot["requests"] += 1
            response = session.get(SEARCH_URL, params={"f_C": record["companyId"],
                "location": LOCATIONS[region], "start": start}, timeout=(10, timeout), allow_redirects=False)
            snapshot["checkedAt"] = datetime.now(timezone.utc).isoformat()
            if response.status_code != 200 or block_page(response.text):
                snapshot["reason"] = "http-" + str(response.status_code)
                snapshot["blocked"] = response.status_code in {401, 403, 429, 999} or block_page(response.text)
                break
            jobs, trusted, count = parse_listing(response.text, record, region, snapshot["checkedAt"])
            if not trusted:
                snapshot["reason"] = "untrusted-markup-or-employer"
                break
            # Conflicting dates in overlapping pages cannot update reposts.
            for key, item in jobs.items():
                old = snapshot["jobs"].get(key)
                if old and old.get("datePosted") != item.get("datePosted"):
                    old.pop("datePosted", None)
                    snapshot.setdefault("conflictingDates", []).append(key)
                elif key not in snapshot.get("conflictingDates", []):
                    snapshot["jobs"][key] = item
            if count:
                empty = 0
                if selected_ids <= snapshot["jobs"].keys():
                    snapshot["reason"] = "all-selected-found"
                    break
            else:
                empty += 1
                if empty >= 2:
                    # The endpoint's empty sentinel is also used under
                    # throttling. A wholly empty query is not a verified end.
                    snapshot["complete"] = bool(snapshot["jobs"])
                    snapshot["reason"] = "complete" if snapshot["complete"] else "empty-untrusted"
                    break
            if progress:
                progress(snapshot)
        else:
            snapshot["reason"] = "linkedin-pagination-boundary"
    except RequestStopped as exc:
        snapshot.update(reason=str(exc), blocked=True)
    except requests.RequestException as exc:
        snapshot["reason"] = type(exc).__name__
    finally:
        session.context = original
    if progress:
        progress(snapshot)
    return snapshot


def absence_matches(row, observation, queries):
    """Validate negative evidence again against the latest canonical row."""
    query = queries.get(observation.get("companyQuery"), {})
    return (query.get("complete") is True and query.get("region") == observation.get("location")
            and query.get('checkedAt') == observation.get('checkedAt')
            and query.get("employerName") and employer_key(query["employerName"]) == employer_key(row.get("company"))
            and employer_url(row) and company_url(query.get("companyUrl")) == employer_url(row)
            and str(query.get("companyId", "")).isdigit()
            and str(observation.get("jobId")) not in query.get("foundJobIds", []))
