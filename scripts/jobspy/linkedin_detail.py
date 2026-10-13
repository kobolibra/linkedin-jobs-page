"""Guest-first JD fetching with identity checks and the full page as fallback."""
from datetime import datetime, timezone
from urllib.parse import urlsplit

import requests
from bs4 import BeautifulSoup

from linkedin_http import RequestStopped, block_page, record_event
from linkedin_ids import linkedin_job_id
from logo_sources import source_hint, supported_names, key


def parse_detail(response, item, job_id, *, guest):
    if response.status_code != 200 or block_page(response.text, response.url):
        return None
    soup = BeautifulSoup(response.text, "html.parser")
    canonical = soup.select_one('link[rel="canonical"]')
    if canonical:
        canonical_host = (urlsplit(canonical.get("href", "")).hostname or "").lower()
        if ((canonical_host != "linkedin.com" and not canonical_host.endswith(".linkedin.com"))
                or linkedin_job_id(canonical.get("href")) != job_id):
            return None
    final = urlsplit(response.url)
    if final.hostname not in ("www.linkedin.com", "linkedin.com"):
        return None
    if guest:
        if final.path.rstrip("/") != "/jobs-guest/jobs/api/jobPosting/" + job_id:
            return None
    elif linkedin_job_id(response.url) != job_id or not canonical:
        return None
    title = soup.select_one('.top-card-layout__title, .topcard__title')
    org = soup.select_one('a.topcard__org-name-link')
    if not title or not org or key(org.get_text(" ", strip=True)) not in supported_names(item.get("company")):
        return None
    block = soup.select_one('.show-more-less-html__markup') or soup.select_one('.description__text')
    text = block.get_text("\n", strip=True) if block else ""
    if not text:
        return None
    result = {"descriptionHtml": str(block), "descriptionText": text}
    for loc in soup.select('.top-card-layout__card .topcard__flavor, .topcard__flavor--bullet'):
        raw = loc.get_text(" ", strip=True)
        if raw and key(raw) != key(item.get("company")) and ("," in raw or "china" in raw.casefold()):
            result["locationRaw"] = raw
            break
    observed = datetime.now(timezone.utc).isoformat()
    hint = source_hint(soup, item.get("company"), item["link"], observed)
    if hint:
        result["companyLogoSource"] = hint
    return result


def fetch_detail(session, item, timeout=(10, 20)):
    out = dict(item)
    job_id = linkedin_job_id(out.get("link"))
    source_id = linkedin_job_id(out.get("sourceJobId"))
    host = urlsplit(str(out.get("link", ""))).hostname
    if not job_id or (source_id and source_id != job_id) or host not in ("linkedin.com", "www.linkedin.com"):
        out.update(detailStatus="failed", detailError="invalid or mismatched LinkedIn job identity")
        return out
    out["link"] = f"https://www.linkedin.com/jobs/view/{job_id}"
    attempts = []
    for endpoint, url in (("guest", f"https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{job_id}"),
                          ("view", out["link"])):
        try:
            with session.get(url, timeout=timeout, allow_redirects=False) as response:
                parsed = parse_detail(response, out, job_id, guest=endpoint == "guest")
                attempts.append({"endpoint": endpoint, "status": response.status_code, "parsed": bool(parsed)})
                if parsed:
                    out.update(parsed, detailStatus="ok", detailError=None, detailEndpoint=endpoint)
                    record_event(stage="details", outcome="parsed", endpoint=endpoint)
                    break
        except RequestStopped as exc:
            out.update(detailStatus="blocked", detailError=str(exc))
            attempts.append({"endpoint": endpoint, "outcome": "blocked"})
            break
        except requests.RequestException as exc:
            attempts.append({"endpoint": endpoint, "outcome": "failed", "error": type(exc).__name__})
    else:
        gone = len(attempts) == 2 and all(x.get("status") in (404, 410) for x in attempts)
        out.update(detailStatus="gone" if gone else "failed", detailError="both detail endpoints unavailable or identity/markup incomplete")
    out.update(detailAttempts=attempts, detailFetchedAt=datetime.now(timezone.utc).isoformat())
    return out
