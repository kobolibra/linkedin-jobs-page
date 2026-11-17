from __future__ import annotations

import argparse
import json
import logging
import random
import re
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import requests
from bs4 import BeautifulSoup
from logo_sources import source_hint
from linkedin_http import LinkedInSession, RequestStopped, block_page
from linkedin_detail import fetch_detail
from linkedin_ids import linkedin_job_id
from posting_dates import linkedin_card_date

LOG = logging.getLogger("linkedin-requests")
BASE = "https://www.linkedin.com"
SEARCH_URL = f"{BASE}/jobs-guest/jobs/api/seeMoreJobPostings/search"
USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
]
COMPANIES = {
    "HSBC": {"canonical": "hsbc", "company_id": "1241", "variants": ["hsbc", "the hongkong and shanghai banking corporation"]},
    "Standard Chartered": {"canonical": "standard chartered", "company_id": "2235", "variants": ["standard chartered", "\u6e23\u6253\u73af\u7403\u5546\u4e1a\u670d\u52a1\u6709\u9650\u516c\u53f8"]},
    "Citi": {"canonical": "citi", "company_id": "11448", "variants": ["citi", "citibank", "citigroup"]},
    "JPMorgan Chase": {"canonical": "jpmorgan chase", "company_id": "1068", "variants": ["jpmorgan chase", "jpmorganchase", "\u6469\u6839\u5927\u901a\u4e9a\u6d32\u54a8\u8be2(\u5317\u4eac)\u6709\u9650\u516c\u53f8"]},
    "BNP Paribas": {"canonical": "bnp paribas", "company_id": "166278,963211,256009,11092068,30590982,10070,18735883,98774,15245937,3683364,3880216,3625182,3627928,1519,281207,2642837,251838,1508", "variants": ["bnp", "bnp paribas"]},
    "Societe Generale": {"canonical": "societe generale", "company_id": "1691", "variants": ["societe generale", "société générale"]},
    "DBS Bank": {"canonical": "dbs bank", "company_id": "163379", "variants": ["dbs", "dbs bank"]},
    "Deutsche Bank": {"canonical": "deutsche bank", "company_id": "1262", "variants": ["deutsche bank"]},
    "Goldman Sachs": {"canonical": "goldman sachs", "company_id": "1382", "variants": ["goldman sachs"]},
    "BlackRock": {"canonical": "blackrock", "company_id": "4764", "variants": ["blackrock", "black rock"]},
    "Bank of America": {"canonical": "bank of america", "company_id": "1123", "variants": ["bank of america", "bank of america corporation", "bofa", "bofa securities", "bank of america merrill lynch"]},
    "Fidelity International": {"canonical": "fidelity international", "company_id": "1313", "variants": ["fidelity international", "fil investment management", "fidelity investment managers"]},
    "Morgan Stanley": {"canonical": "morgan stanley", "company_id": "497017", "variants": ["morgan stanley"]},
    "BBVA": {"canonical": "bbva", "company_id": "4860,35712,582186,163937,3837790,11115790,2539533,311274,18473960,70646,1320205,23514,3101077", "variants": ["bbva"]},
    "Natixis": {"canonical": "natixis", "company_id": "79376776,11369861", "variants": ["natixis", "natixis corporate & investment banking"]},
    "UBS": {"canonical": "ubs", "company_id": "1214", "variants": ["ubs", "ubs group"]},
    "Schroders": {"canonical": "schroders", "company_id": "5494", "variants": ["schroders", "schroder investment management"]},
    "Invesco": {"canonical": "invesco", "company_id": "3582438", "variants": ["invesco", "invesco ltd"]},
}


def clean(value: object) -> str:
    return str(value).strip() if value not in (None, "") else ""


def canonical(value: str) -> str:
    folded = unicodedata.normalize("NFKD", clean(value).casefold())
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9\u3400-\u9fff]+", " ", folded).strip()


def normalize_url(url: str) -> str:
    parsed = urlsplit(url)
    query = [(k, v) for k, v in parse_qsl(parsed.query) if k.lower() not in {"trk", "trackingid", "refid"}]
    host = "www.linkedin.com" if (parsed.hostname == "linkedin.com" or str(parsed.hostname).endswith(".linkedin.com")) else parsed.netloc
    return urlunsplit(("https", host, parsed.path.rstrip("/"), urlencode(query), ""))


def extract_id(url: str) -> str:
    return linkedin_job_id(url)


def city_from_location(raw: str) -> str:
    parts = [part.strip() for part in clean(raw).split(",") if part.strip()]
    while parts and parts[-1].casefold() in {"china", "cn", "mainland china"}:
        parts.pop()
    if not parts:
        return ""
    return parts[0]


def location_code(value: str) -> str:
    normalized = canonical(value)
    if normalized in {"hong kong", "hong kong sar", "hk"}:
        return "HK"
    if normalized in {"singapore", "sg"}:
        return "SG"
    return "CN"


def date_only(value: str) -> str:
    value = clean(value)
    match = re.search(r"\d{4}-\d{2}-\d{2}", value)
    return match.group(0) if match else ""


def company_match(company: str, requested: str) -> bool:
    actual = canonical(company)
    if not actual:
        return False
    if actual == canonical(requested):
        return True
    return any(re.search(r"(?:^| )" + re.escape(canonical(v)) + r"(?: |$)", actual)
               for v in COMPANIES[requested]["variants"] if canonical(v))


def rotate_user_agent(session: requests.Session, attempt: int) -> None:
    session.headers.update({"User-Agent": USER_AGENTS[attempt % len(USER_AGENTS)]})


def looks_like_block_page(html: str) -> bool:
    return block_page(html)


def is_empty_search_page(html: str) -> bool:
    # LinkedIn's guest pagination endpoint returns this 26-byte document after
    # the last result. Only this verified marker (or a truly empty body) is an
    # empty page; other card-free HTML remains untrusted.
    return not html.strip() or bool(re.fullmatch(r"<!doctype html>\s*<!---->", html.strip(), re.I))


def listing_region(raw):
    value = str(raw or "").casefold()
    if re.search(r"hong ?kong|香港", value):
        return "HK"
    if re.search(r"singapore|新加坡", value):
        return "SG"
    if re.search(r"(?:^|[, ])china(?:$|[, ])|中国|mainland china", value):
        return "CN"
    return None


def parse_search(html: str, requested: str, fetched_at: str, region: str = "CN") -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    jobs = []
    for card in soup.select("div.base-search-card"):
        link = card.select_one("a.base-card__full-link")
        if not link or not link.get("href"):
            continue
        url = normalize_url(link["href"].split("?")[0])
        job_id = extract_id(url)
        parsed_url = urlsplit(url)
        if not job_id or not (parsed_url.hostname == "linkedin.com" or str(parsed_url.hostname).endswith(".linkedin.com")):
            continue
        company_tag = card.select_one("h4.base-search-card__subtitle a")
        company = company_tag.get_text(" ", strip=True) if company_tag else ""
        if not company_match(company, requested):
            continue
        title_tag = card.select_one("h3.base-search-card__title")
        location_tag = card.select_one("span.job-search-card__location")
        observed_region = listing_region(location_tag.get_text(" ", strip=True) if location_tag else "")
        if observed_region and observed_region != region:
            continue
        time_tag = card.select_one("time.job-search-card__listdate, time.job-search-card__listdate--new")
        if not title_tag or not title_tag.get_text(" ", strip=True):
            continue
        raw_posted = clean(time_tag.get("datetime", "")) if time_tag else ""
        relative_posted = time_tag.get_text(" ", strip=True) if time_tag else ""
        local_posted, date_source = linkedin_card_date(raw_posted, relative_posted, fetched_at)
        jobs.append({
            "source": "jobspy-requests",
            "sourceSite": "linkedin",
            "sourceJobId": f"li-{job_id}",
            "requestedCompany": requested,
            "company": company,
            "companyCanonical": COMPANIES[requested]["canonical"],
            "title": title_tag.get_text(" ", strip=True) if title_tag else "",
            "link": url,
            "location": region,
            "locationRaw": location_tag.get_text(" ", strip=True) if location_tag else "",
            # HK/SG rows are lifecycle observations only; JD and city remain CN-only.
            "city": city_from_location(location_tag.get_text(" ", strip=True) if location_tag else "") if region == "CN" else "",
            "datePosted": local_posted,
            "linkedinPostedRaw": raw_posted,
            "linkedinPostedRelative": relative_posted,
            "linkedinPostedDateSource": date_source,
            "descriptionText": "",
            "descriptionHtml": "",
            "fetchedAt": fetched_at,
            "jobspyFetchedAt": fetched_at,
            "dataSources": ["jobspy"],
        })
        hint=source_hint(card,company,url,fetched_at)
        if hint: jobs[-1]["companyLogoSource"]=hint
    return jobs


def enrich_detail(session: requests.Session, job: dict, timeout: tuple[int, int], retries: int = 3) -> bool:
    old_context = getattr(session, "context", {})
    session.context = {**old_context, "stage": "details"}
    try:
        result = fetch_detail(session, job, timeout)
    finally:
        session.context = old_context
    job.update(result)
    if result.get("locationRaw"):
        job["city"] = city_from_location(result["locationRaw"])
    return result.get("detailStatus") == "ok"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--company", action="append", choices=list(COMPANIES), help="Repeat for selected companies; default all")
    parser.add_argument("--location", action="append", default=None,
                        help="Search location; repeat for multiple regions (default: China)")
    parser.add_argument("--company-id", default=None, help="Override Company ID for a single-company test; otherwise the configured strict ID is used")
    parser.add_argument("--results-per-company", type=int, default=1000)
    parser.add_argument("--hours-old", type=int, default=None)
    parser.add_argument("--fetch-description", action="store_true")
    parser.add_argument("--output", type=Path, default=Path("linkedin_requests_jobs.json"))
    parser.add_argument("--resume", action="store_true", help="Resume recoverable 429 pages from this company's previous output")
    parser.add_argument("--page-timeout", type=int, default=20)
    parser.add_argument("--detail-timeout", type=int, default=15)
    parser.add_argument("--delay-min", type=float, default=3)
    parser.add_argument("--delay-max", type=float, default=7)
    parser.add_argument("--page-attempts", type=int, default=3, help="Maximum inline attempts for transient errors; 429 defers the query for checkpoint recovery")
    args = parser.parse_args()
    if args.results_per_company < 1:
        raise SystemExit("--results-per-company must be >= 1")
    page_attempts = max(1, args.page_attempts)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    # Keep linear backoff for transient server errors. The shared transport
    # handles 429 separately and always honors an explicit Retry-After.
    session = LinkedInSession(attempts=page_attempts, user_agents=USER_AGENTS,
                              linear_backoff=True)
    session.headers.update({
        "User-Agent": USER_AGENTS[0],
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": f"{BASE}/jobs/search",
    })
    all_jobs = []
    status_summary = {}
    query_started_at = {}
    paused_companies = set()
    retry_times = []
    locations = args.location or ["China"]
    companies = args.company or list(COMPANIES)
    previous = {}
    if args.resume:
        previous = json.loads(args.output.read_text(encoding="utf-8"))
        if not isinstance(previous, dict) or not isinstance(previous.get("jobs"), list) or not isinstance(previous.get("statusSummary"), dict):
            raise ValueError("invalid company resume checkpoint")
    for location in locations:
        region = location_code(location)
        for company in companies:
            fetched_at = datetime.now(timezone.utc).isoformat()
            jobs_by_id = {}
            start = 0
            blocked = False
            empty_pages = 0
            ended_cleanly = False
            status_key = f"{company}::{region}"
            query_started_at[status_key] = fetched_at
            if company in paused_companies:
                # Yield the whole employer after a 429; its other regions
                # must not consume another request before other employers run.
                retained = [dict(item) for item in previous.get('jobs', []) if item.get('requestedCompany') == company and item.get('location') == region]
                all_jobs.extend(retained)
                status_summary[status_key] = previous.get('statusSummary', {}).get(status_key, 'failed@start=0: HTTP 429 company deferred')
                starts = previous.get('queryStartedAt', {})
                query_started_at[status_key] = starts.get(status_key) if isinstance(starts,dict) else None
                continue
            resumed_tail = False
            if args.resume:
                retained = [dict(item) for item in previous['jobs'] if item.get('requestedCompany') == company and item.get('location') == region]
                # A completed region is not observed again during recovery.
                # Keep its original boundary, including legacy row timestamps.
                starts = previous.get('queryStartedAt', {})
                old_times = [str(item.get('jobspyFetchedAt') or item.get('fetchedAt')) for item in retained if item.get('jobspyFetchedAt') or item.get('fetchedAt')]
                query_started_at[status_key] = starts.get(status_key) if isinstance(starts,dict) and status_key in starts else min(old_times,default=None)
                old_status = str(previous['statusSummary'].get(status_key, 'unreadable resume checkpoint'))
                failed_page = re.match(r'^failed@start=(\d+):.*HTTP 429', old_status)
                if not failed_page:
                    # Completed regions and other failures are not queried again.
                    all_jobs.extend(retained); status_summary[status_key] = old_status
                    continue
                jobs_by_id = {item['sourceJobId']: item for item in retained}
                start = int(failed_page[1])
                resumed_tail = bool(start or retained)
                if not resumed_tail: query_started_at[status_key] = fetched_at
                LOG.info("%s [%s] resume start=%s retained=%s", company, region, start, len(jobs_by_id))
            while len(jobs_by_id) < args.results_per_company and start < 1000:
                # Request newest-first discovery on every page. Server ordering
                # is never treated as proof that a partial query is complete.
                params = {"keywords": company, "location": location, "distance": 50, "pageNum": 0, "start": start, "sortBy": "DD"}
                strict_company_id = args.company_id or COMPANIES[company]["company_id"]
                if strict_company_id:
                    params["f_C"] = strict_company_id
                if args.hours_old is not None:
                    params["f_TPR"] = f"r{args.hours_old * 3600}"
                LOG.info("%s [%s] search start=%s", company, region, start)
                response = None
                last_error = ""
                session.context = {"stage": "search", "retryRound": int(args.resume), "company": company, "region": region,
                                   "pageStart": start}
                try:
                    rotate_user_agent(session, 0)
                    page_started_at = datetime.now(timezone.utc).isoformat()
                    response = session.get(SEARCH_URL, params=params, timeout=(10, args.page_timeout))
                    LOG.info("%s [%s] start=%s http=%s bytes=%s", company, region, start, response.status_code, len(response.content))
                    response.raise_for_status()
                except requests.RequestException as exc:
                    last_error = str(exc)
                    if isinstance(exc,RequestStopped) and exc.response is not None and exc.response.status_code == 429:
                        paused_companies.add(company)
                        retry_times.append(exc.retry_at or 0)
                    response = None
                if response is None:
                    LOG.error("%s [%s] search failed at start=%s (maximum inline attempts=%s; deferred 429 resumes later): %s", company, region, start, page_attempts, last_error)
                    blocked = start == 0
                    status_summary[status_key] = f"failed@start={start}: {last_error}"
                    break
                if looks_like_block_page(response.text):
                    status_summary[status_key] = f"failed@start={start}: HTTP 200 block/login page"
                    blocked = True
                    break
                page_jobs = parse_search(response.text, company, page_started_at, region)
                markup = BeautifulSoup(response.text, "html.parser")
                cards = markup.select("div.base-search-card")
                if ((not cards and not is_empty_search_page(response.text)) or
                    any(not card.select_one("a.base-card__full-link[href]") or
                        not card.select_one("h3.base-search-card__title") or
                        not card.select_one("h4.base-search-card__subtitle a") for card in cards)):
                    status_summary[status_key] = f"failed@start={start}: unrecognised or incomplete search markup"
                    break
                # Cards rejected by employer/identity checks are not an empty page.
                if cards and not page_jobs:
                    status_summary[status_key] = f"partial@start={start}: no verified matching employer cards"
                    break
                if not page_jobs:
                    empty_pages += 1
                    LOG.info("%s [%s] start=%s empty_page=%s/2", company, region, start, empty_pages)
                    start += 10
                    if empty_pages >= 2:
                        ended_cleanly = True
                        break
                    # LinkedInSession coordinates the next request across all workers.
                    continue
                empty_pages = 0
                for job in page_jobs:
                    jobs_by_id.setdefault(job["sourceJobId"], job)
                LOG.info("%s [%s] start=%s cards=%s accepted_total=%s", company, region, start, len(page_jobs), len(jobs_by_id))
                start += 10
            company_jobs = list(jobs_by_id.values())[: args.results_per_company]
            if status_key not in status_summary:
                if ended_cleanly and company_jobs:
                    # A resumed tail and its earlier prefix were observed at
                    # different times. Publish their jobs, but never use absence
                    # in that stitched result to expire canonical records.
                    status_summary[status_key] = f"partial@resumed-end: {len(company_jobs)} jobs" if resumed_tail else f"ok: {len(company_jobs)} jobs"
                elif ended_cleanly:
                    status_summary[status_key] = "no-results-untrusted"
                elif len(jobs_by_id) >= args.results_per_company or start >= 1000:
                    status_summary[status_key] = f"partial@cap: {len(company_jobs)} jobs"
                else:
                    status_summary[status_key] = f"partial: {len(company_jobs)} jobs"
            if blocked and not company_jobs:
                LOG.error("%s [%s] produced no jobs because the first search page was blocked", company, region)
            if args.fetch_description and region == "CN":
                for index, job in enumerate(company_jobs, 1):
                    LOG.info("%s [%s] detail %s/%s %s", company, region, index, len(company_jobs), job["sourceJobId"])
                    enrich_detail(session, job, (10, args.detail_timeout))
            all_jobs.extend(company_jobs)
            LOG.info("%s [%s] finished: %s jobs", company, region, len(company_jobs))

    unique = {job["sourceJobId"]: job for job in all_jobs}
    output = {"schemaVersion": "1.2", "generatedAt": datetime.now(timezone.utc).isoformat(), "queryStartedAt": query_started_at, "retryAt": max(retry_times,default=0), "country": "Multi-region", "scopeLocations": sorted({location_code(x) for x in locations}), "descriptionFetchEnabled": args.fetch_description, "count": len(unique), "statusSummary": status_summary, "jobs": list(unique.values())}
    temporary = args.output.with_suffix(args.output.suffix + '.tmp')
    temporary.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)
    LOG.info("Wrote %s unique jobs to %s", len(unique), args.output)
    LOG.info("status summary: %s", json.dumps(status_summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
