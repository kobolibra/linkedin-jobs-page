from __future__ import annotations

import argparse
import json
import logging
import random
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import requests
from bs4 import BeautifulSoup

LOG = logging.getLogger("linkedin-requests")
BASE = "https://www.linkedin.com"
SEARCH_URL = f"{BASE}/jobs-guest/jobs/api/seeMoreJobPostings/search"
COMPANIES = {
    "HSBC": {"canonical": "hsbc", "variants": ["hsbc", "the hongkong and shanghai banking corporation"]},
    "Standard Chartered": {"canonical": "standard chartered", "variants": ["standard chartered", "渣打环球商业服务有限公司"]},
    "Citi": {"canonical": "citi", "variants": ["citi", "citibank", "citigroup"]},
    "JPMorgan Chase": {"canonical": "jpmorgan chase", "variants": ["jpmorgan chase", "jpmorganchase", "摩根大通亚洲咨询(北京)有限公司"]},
}


def clean(value: object) -> str:
    return str(value).strip() if value not in (None, "") else ""


def canonical(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", clean(value).casefold()).strip()


def normalize_url(url: str) -> str:
    parsed = urlsplit(url)
    query = [(k, v) for k, v in parse_qsl(parsed.query) if k.lower() not in {"trk", "trackingid", "refid"}]
    host = "www.linkedin.com" if parsed.netloc.casefold().endswith("linkedin.com") else parsed.netloc
    return urlunsplit(("https", host, parsed.path.rstrip("/"), urlencode(query), ""))


def extract_id(url: str) -> str:
    # LinkedIn guest results use /jobs/view/<slug>-<numeric-id>.
    match = re.search(r"/jobs/view/[^/?#]*?(\d{7,})(?:[/?#]|$)", url)
    return match.group(1) if match else ""


def city_from_location(raw: str) -> str:
    parts = [part.strip() for part in clean(raw).split(",") if part.strip()]
    while parts and parts[-1].casefold() in {"china", "cn", "mainland china"}:
        parts.pop()
    if not parts:
        return ""
    return parts[0]


def date_only(value: str) -> str:
    value = clean(value)
    match = re.search(r"\d{4}-\d{2}-\d{2}", value)
    return match.group(0) if match else ""


def company_match(company: str, requested: str) -> bool:
    actual = canonical(company)
    if actual == canonical(requested):
        return True
    return any(canonical(v) in actual or actual in canonical(v) for v in COMPANIES[requested]["variants"])


def parse_search(html: str, requested: str, fetched_at: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    jobs = []
    for card in soup.select("div.base-search-card"):
        link = card.select_one("a.base-card__full-link")
        if not link or not link.get("href"):
            continue
        url = normalize_url(link["href"].split("?")[0])
        job_id = extract_id(url)
        if not job_id:
            continue
        company_tag = card.select_one("h4.base-search-card__subtitle a")
        company = company_tag.get_text(" ", strip=True) if company_tag else ""
        if not company_match(company, requested):
            continue
        title_tag = card.select_one("h3.base-search-card__title")
        location_tag = card.select_one("span.job-search-card__location")
        time_tag = card.select_one("time.job-search-card__listdate, time.job-search-card__listdate--new")
        jobs.append({
            "source": "jobspy-requests",
            "sourceSite": "linkedin",
            "sourceJobId": f"li-{job_id}",
            "requestedCompany": requested,
            "company": company,
            "companyCanonical": COMPANIES[requested]["canonical"],
            "title": title_tag.get_text(" ", strip=True) if title_tag else "",
            "link": url,
            "location": "CN",
            "locationRaw": location_tag.get_text(" ", strip=True) if location_tag else "",
            "city": city_from_location(location_tag.get_text(" ", strip=True) if location_tag else ""),
            "datePosted": date_only(time_tag.get("datetime", "") if time_tag else ""),
            "descriptionText": "",
            "descriptionHtml": "",
            "fetchedAt": fetched_at,
            "jobspyFetchedAt": fetched_at,
            "dataSources": ["jobspy"],
        })
    return jobs


def enrich_detail(session: requests.Session, job: dict, timeout: tuple[int, int], retries: int = 3) -> bool:
    job["link"] = normalize_url(job.get("link", ""))
    last_error = ""
    for attempt in range(1, retries + 1):
        try:
            response = session.get(job["link"], timeout=timeout)
            if response.status_code == 429 or response.status_code >= 500:
                last_error = f"HTTP {response.status_code}"
                if attempt < retries:
                    time.sleep(min(30, 2 ** attempt + random.random()))
                    continue
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")
            block = soup.select_one("div.show-more-less-html__markup") or soup.select_one("div.description__text")
            if block:
                job["descriptionHtml"] = str(block)
                job["descriptionText"] = block.get_text("\n", strip=True)
            location_candidates = soup.select("div.top-card-layout__card span.topcard__flavor")
            for location in location_candidates:
                raw = location.get_text(" ", strip=True)
                if raw and ("," in raw or "china" in raw.casefold() or raw.casefold() in {"beijing", "shanghai", "shenzhen", "guangzhou", "xi'an"}):
                    job["locationRaw"] = raw
                    job["city"] = city_from_location(raw)
                    break
            return bool((job.get("descriptionText") or "").strip())
        except requests.RequestException as exc:
            last_error = str(exc)
            if attempt < retries:
                time.sleep(min(30, 2 ** attempt + random.random()))
    LOG.warning("detail failed %s: %s", job.get("sourceJobId"), last_error)
    return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--company", action="append", choices=list(COMPANIES), help="Repeat for selected companies; default all")
    parser.add_argument("--location", default="China")
    parser.add_argument("--company-id", default=None, help="Optional LinkedIn Company ID, e.g. JPMorgan Chase=1068")
    parser.add_argument("--results-per-company", type=int, default=1000)
    parser.add_argument("--hours-old", type=int, default=None)
    parser.add_argument("--fetch-description", action="store_true")
    parser.add_argument("--output", type=Path, default=Path("linkedin_requests_jobs.json"))
    parser.add_argument("--page-timeout", type=int, default=20)
    parser.add_argument("--detail-timeout", type=int, default=15)
    parser.add_argument("--delay-min", type=float, default=3)
    parser.add_argument("--delay-max", type=float, default=7)
    args = parser.parse_args()
    if args.results_per_company < 1:
        raise SystemExit("--results-per-company must be >= 1")

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36", "Accept-Language": "en-US,en;q=0.9"})
    all_jobs = []
    for company in args.company or list(COMPANIES):
        fetched_at = datetime.now(timezone.utc).isoformat()
        jobs_by_id = {}
        start = 0
        while len(jobs_by_id) < args.results_per_company and start < 1000:
            params = {"keywords": company, "location": args.location, "distance": 50, "pageNum": 0, "start": start}
            if args.company_id:
                params["f_C"] = args.company_id
            if args.hours_old is not None:
                params["f_TPR"] = f"r{args.hours_old * 3600}"
            LOG.info("%s search start=%s", company, start)
            response = None
            last_error = ""
            for page_attempt in range(1, 5):
                try:
                    response = session.get(SEARCH_URL, params=params, timeout=(10, args.page_timeout))
                    if response.status_code == 429 or response.status_code >= 500:
                        last_error = f"HTTP {response.status_code}"
                        if page_attempt < 4:
                            wait = min(90, 8 * page_attempt + random.uniform(1, 4))
                            LOG.warning("%s page rate-limited at start=%s; retry %s/4 in %.1fs", company, start, page_attempt + 1, wait)
                            time.sleep(wait)
                            continue
                    response.raise_for_status()
                    break
                except requests.RequestException as exc:
                    last_error = str(exc)
                    if page_attempt < 4:
                        wait = min(90, 8 * page_attempt + random.uniform(1, 4))
                        LOG.warning("%s page failed at start=%s; retry %s/4 in %.1fs: %s", company, start, page_attempt + 1, wait, exc)
                        time.sleep(wait)
                    else:
                        response = None
            if response is None:
                LOG.error("%s search failed at start=%s after retries: %s", company, start, last_error)
                break
            page_jobs = parse_search(response.text, company, fetched_at)
            if not page_jobs:
                break
            for job in page_jobs:
                jobs_by_id.setdefault(job["sourceJobId"], job)
            LOG.info("%s start=%s cards=%s accepted_total=%s", company, start, len(page_jobs), len(jobs_by_id))
            start += 10
            if len(jobs_by_id) < args.results_per_company:
                time.sleep(random.uniform(args.delay_min, args.delay_max))
        company_jobs = list(jobs_by_id.values())[: args.results_per_company]
        if args.fetch_description:
            for index, job in enumerate(company_jobs, 1):
                LOG.info("%s detail %s/%s %s", company, index, len(company_jobs), job["sourceJobId"])
                enrich_detail(session, job, (10, args.detail_timeout))
                if index < len(company_jobs):
                    time.sleep(random.uniform(args.delay_min, args.delay_max))
        all_jobs.extend(company_jobs)
        LOG.info("%s finished: %s jobs", company, len(company_jobs))
        if company != (args.company or list(COMPANIES))[-1]:
            time.sleep(random.uniform(args.delay_min, args.delay_max))

    unique = {job["sourceJobId"]: job for job in all_jobs}
    output = {"schemaVersion": "1.1", "generatedAt": datetime.now(timezone.utc).isoformat(), "country": "China", "descriptionFetchEnabled": args.fetch_description, "count": len(unique), "jobs": list(unique.values())}
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    LOG.info("Wrote %s unique jobs to %s", len(unique), args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
