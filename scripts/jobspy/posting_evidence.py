"""Extract this job's publication date, never dates from recommended jobs."""
import json
import re
from datetime import datetime, timedelta, timezone
from bs4 import BeautifulSoup
from linkedin_ids import linkedin_job_id
from posting_dates import LOCAL_TZ, posting_day


def search_posting_date(html, job_id):
    soup = BeautifulSoup(html or "", "html.parser")
    found = set()
    for card in soup.select(".base-search-card, .main-job-card, .aside-job-card"):
        link = card.select_one('a[href*="/jobs/view/"]')
        if not link or linkedin_job_id(link.get("href")) != str(job_id):
            continue
        time = card.select_one("time[datetime]")
        day = posting_day(time.get("datetime")) if time else None
        if day:
            found.add(day.isoformat())
    return next(iter(found)) if len(found) == 1 else None


def detail_posting_date(html, job_id, checked_at):
    soup = BeautifulSoup(html or "", "html.parser")
    canonical = soup.select_one('link[rel="canonical"]')
    if not canonical or linkedin_job_id(canonical.get("href")) != str(job_id):
        return None, None
    header = soup.select_one(".posted-time-ago__text")
    if header:
        own_time = header if header.name == "time" else header.select_one("time[datetime]")
        exact = posting_day((own_time or header).get("datetime"))
        if exact:
            return exact.isoformat(), "linkedin-detail-datetime"
        # LinkedIn rounds relative ages. Only accept a day when the entire
        # rounding interval lies within it; never invent an exact timestamp.
        label = header.get_text(" ", strip=True).casefold()
        match = re.fullmatch(r"(?:reposted\s+)?(\d+)\s+(minute|hour|day|week)s?\s+ago", label)
        if match:
            units = {"minute": 60, "hour": 3600, "day": 86400, "week": 604800}
            span = units[match[2]]; age = int(match[1]) * span
            now = datetime.fromisoformat(str(checked_at).replace("Z", "+00:00"))
            if not now.tzinfo:
                now = now.replace(tzinfo=timezone.utc)
            recent = (now - timedelta(seconds=age)).astimezone(LOCAL_TZ).date()
            early = (now - timedelta(seconds=age + span)).astimezone(LOCAL_TZ).date()
            if recent == early:
                return recent.isoformat(), "linkedin-detail-relative-day"
    exact = search_posting_date(html, job_id)
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
