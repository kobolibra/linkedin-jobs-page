"""Extract this job's publication date, never dates from recommended jobs."""
import json
import re
from datetime import datetime, timedelta, timezone
from bs4 import BeautifulSoup
from urllib.parse import urlsplit
from linkedin_ids import linkedin_job_id
from posting_dates import LOCAL_TZ, posting_day


def markup(html):
    return html if isinstance(html, BeautifulSoup) else BeautifulSoup(html or "", "html.parser")


def matches_job(soup, job_id):
    canonical = soup.select_one('link[rel="canonical"]')
    if not canonical:
        return False
    url = canonical.get("href", "")
    host = (urlsplit(url).hostname or "").lower()
    return (host == "linkedin.com" or host.endswith(".linkedin.com")) and linkedin_job_id(url) == str(job_id)


def relative_posting_bounds(html, job_id, checked_at):
    """Day bounds for a rounded age; never an invented exact date."""
    soup = markup(html)
    if not matches_job(soup, job_id):
        return None
    header = soup.select_one(".posted-time-ago__text")
    if not header:
        return None
    match = re.fullmatch(r"(?:reposted\s+)?(\d+)\s+(minute|hour|day|week)s?\s+ago", header.get_text(" ", strip=True).casefold())
    if not match:
        return None
    span = {"minute": 60, "hour": 3600, "day": 86400, "week": 604800}[match[2]]
    try:
        now = datetime.fromisoformat(str(checked_at).replace("Z", "+00:00"))
        if not now.tzinfo:
            now = now.replace(tzinfo=timezone.utc)
        # Include a full unit on either side: a rounded label is not proof
        # that the platform always floors the age. This protects midnight.
        recent = (now - timedelta(seconds=max(0, int(match[1]) - 1) * span)).astimezone(LOCAL_TZ).date()
        early = (now - timedelta(seconds=(int(match[1]) + 1) * span)).astimezone(LOCAL_TZ).date()
        return early, recent
    except (ValueError, OverflowError):
        return None


def search_posting_dates(html):
    soup = markup(html)
    found = {}
    for card in soup.select(".base-search-card, .main-job-card, .aside-job-card"):
        link = card.select_one('a[href*="/jobs/view/"]')
        if not link:
            continue
        host = (urlsplit(link.get("href", "")).hostname or "").lower()
        if host and host != "linkedin.com" and not host.endswith(".linkedin.com"):
            continue
        job_id = linkedin_job_id(link.get("href"))
        time = card.select_one("time[datetime]")
        day = posting_day(time.get("datetime")) if time else None
        if job_id and day:
            found.setdefault(job_id, set()).add(day.isoformat())
    return {job_id: next(iter(days)) for job_id, days in found.items() if len(days) == 1}


def search_posting_date(html, job_id):
    return search_posting_dates(html).get(str(job_id))


def detail_posting_raw(html, job_id, source):
    """Raw date evidence for this exact LinkedIn job, never a suggested role.

    Reads the already fetched liveness page; makes no further HTTP requests.
    Relative text and cached cards have no independently verified raw stamp.
    """
    soup = markup(html)
    if not matches_job(soup, job_id):
        return None
    if source == "linkedin-detail-datetime":
        header = soup.select_one(".posted-time-ago__text")
        own_time = header if header and header.name == "time" else header.select_one("time[datetime]") if header else None
        return str(own_time.get("datetime") or "").strip() or None if own_time else None
    if source == "linkedin-detail-matching-card":
        stamps = set()
        for card in soup.select(".base-search-card, .main-job-card, .aside-job-card"):
            link = card.select_one('a[href*="/jobs/view/"]')
            if not link:
                continue
            raw_url = link.get("href", "")
            host = (urlsplit(raw_url).hostname or "").lower()
            if host and host != "linkedin.com" and not host.endswith(".linkedin.com"):
                continue
            if linkedin_job_id(raw_url) != str(job_id):
                continue
            time = card.select_one("time[datetime]")
            if time and time.get("datetime"):
                stamps.add(str(time.get("datetime")).strip())
        return next(iter(stamps)) if len(stamps) == 1 else None
    if source == "linkedin-detail-structured":
        stamps = set()
        def visit(node):
            if isinstance(node, list):
                for entry in node:
                    visit(entry)
            elif isinstance(node, dict):
                types = node.get("@type", [])
                types = [types] if isinstance(types, str) else types
                ident = node.get("identifier", {})
                ident = ident.get("value") if isinstance(ident, dict) else ident
                matches = linkedin_job_id(node.get("url")) == str(job_id) or str(ident) == str(job_id)
                if "JobPosting" in types and matches and node.get("datePosted"):
                    stamps.add(str(node["datePosted"]).strip())
                if "@graph" in node:
                    visit(node["@graph"])
        for script in soup.select('script[type="application/ld+json"]'):
            try:
                visit(json.loads(script.string or script.get_text()))
            except (ValueError, TypeError):
                pass
        return next(iter(stamps)) if len(stamps) == 1 else None
    return None


def detail_posting_date(html, job_id, checked_at):
    soup = markup(html)
    if not matches_job(soup, job_id):
        return None, None
    header = soup.select_one(".posted-time-ago__text")
    if header:
        own_time = header if header.name == "time" else header.select_one("time[datetime]")
        exact = posting_day((own_time or header).get("datetime"))
        if exact:
            return exact.isoformat(), "linkedin-detail-datetime"
        # LinkedIn rounds relative ages. Only accept a day when the entire
        # rounding interval lies within it; never invent an exact timestamp.
        bounds = relative_posting_bounds(soup, job_id, checked_at)
        if bounds and bounds[0] == bounds[1]:
            return bounds[0].isoformat(), "linkedin-detail-relative-day"
    exact = search_posting_date(soup, job_id)
    if exact:
        return exact, "linkedin-detail-matching-card"
    # Structured data is accepted only for a JobPosting belonging to this ID.
    dates = set()
    def visit(node):
        if isinstance(node, list):
            for value in node: visit(value)
        elif isinstance(node, dict):
            types = node.get("@type", [])
            types = [types] if isinstance(types, str) else types
            identifier = node.get("identifier", {})
            identifier = identifier.get("value") if isinstance(identifier, dict) else identifier
            matches = linkedin_job_id(node.get("url")) == str(job_id) or str(identifier) == str(job_id)
            day = posting_day(node.get("datePosted"))
            if "JobPosting" in types and matches and day:
                dates.add(day.isoformat())
            if "@graph" in node: visit(node["@graph"])
    for script in soup.select('script[type="application/ld+json"]'):
        try: visit(json.loads(script.string or script.get_text()))
        except (ValueError, TypeError): pass
    return (next(iter(dates)), "linkedin-detail-structured") if len(dates) == 1 else (None, None)
