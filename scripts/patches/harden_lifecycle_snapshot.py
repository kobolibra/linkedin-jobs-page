#!/usr/bin/env python3
from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise SystemExit(f"expected exactly one match in {path}, found {text.count(old)}")
    p.write_text(text.replace(old, new), encoding="utf-8")


# Restore the original uncapped equal-axis Top 30 scale.
replace_once(
    "app.js",
    '''  const scaleValues=[...means,...medians].sort((a,b)=>a-b);
  const p95=scaleValues.length?scaleValues[Math.min(scaleValues.length-1,Math.floor((scaleValues.length-1)*.95))]:40;
  const domainMax=Math.max(40,Math.ceil(p95/5)*5);
  const project=v=>Math.max(0,Math.min(domainMax,Number(v)||0));
  const x=v=>left+(plotRight-left)*(project(v)/domainMax);
  const y=v=>plotBottom-(plotBottom-plotTop)*(project(v)/domainMax);''',
    '''  const maxValue=Math.max(0,...means,...medians);
  const domainMax=Math.max(50,Math.ceil(maxValue/10)*10);
  const x=v=>left+(plotRight-left)*((Number(v)||0)/domainMax);
  const y=v=>plotBottom-(plotBottom-plotTop)*((Number(v)||0)/domainMax);'''
)

# Restore the original company-column flex behavior. The expiry badge remains
# independently absolutely positioned relative to .job.
replace_once(
    "styles-list.css",
    ".job-sub { font-size:12.5px;color:var(--ink-soft);margin-top:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }",
    ".job-sub { flex:1 1 auto;min-width:0;font-size:12.5px;color:var(--ink-soft);margin-top:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }"
)

# Make compacting non-destructive: retain lifecycle and audit metadata.
Path("scripts/jobspy/compact_published_jobs.py").write_text('''#!/usr/bin/env python3
"""Minify the browser payload without deleting lifecycle/audit metadata."""
import json
from pathlib import Path

path = Path("jobs.json")
doc = json.loads(path.read_text(encoding="utf-8"))
removed = 0
for job in doc.get("jobs", []):
    # descriptionText duplicates a richer descriptionHtml and can be derived by
    # the browser. All lifecycle, provenance and diagnostic fields are retained.
    if job.get("descriptionHtml") and job.pop("descriptionText", None) is not None:
        removed += 1
path.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\\n", encoding="utf-8")
print("compacted_jobs", len(doc.get("jobs", [])), "removed_duplicate_descriptionText", removed, "bytes", path.stat().st_size)
''', encoding="utf-8")

# Harden the existing single-pass crawler without introducing a new architecture.
replace_once(
    "scripts/jobspy/fetch_linkedin_requests.py",
    '''def rotate_user_agent(session: requests.Session, attempt: int) -> None:
    session.headers.update({"User-Agent": USER_AGENTS[attempt % len(USER_AGENTS)]})


def parse_search''',
    '''def rotate_user_agent(session: requests.Session, attempt: int) -> None:
    session.headers.update({"User-Agent": USER_AGENTS[attempt % len(USER_AGENTS)]})


def looks_like_block_page(html: str) -> bool:
    soup = BeautifulSoup(html, "html.parser")
    if soup.select_one(".authwall, #challenge, form.login__form, input[name=session_key]"):
        return True
    text = soup.get_text(" ", strip=True).casefold()
    return "captcha" in text or "security verification" in text


def parse_search'''
)
replace_once(
    "scripts/jobspy/fetch_linkedin_requests.py",
    '''        start = 0
        blocked = False
        while len(jobs_by_id) < args.results_per_company and start < 1000:''',
    '''        start = 0
        blocked = False
        empty_pages = 0
        ended_cleanly = False
        while len(jobs_by_id) < args.results_per_company and start < 1000:'''
)
replace_once(
    "scripts/jobspy/fetch_linkedin_requests.py",
    '''            page_jobs = parse_search(response.text, company, fetched_at)
            if not page_jobs:
                break
            for job in page_jobs:
                jobs_by_id.setdefault(job["sourceJobId"], job)
            LOG.info("%s start=%s cards=%s accepted_total=%s", company, start, len(page_jobs), len(jobs_by_id))
            start += 10
            if len(jobs_by_id) < args.results_per_company:
                time.sleep(random.uniform(args.delay_min, args.delay_max))
        company_jobs = list(jobs_by_id.values())[: args.results_per_company]
        status_summary.setdefault(company, f"ok: {len(company_jobs)} jobs" if company_jobs else "empty")''',
    '''            if looks_like_block_page(response.text):
                status_summary[company] = f"failed@start={start}: HTTP 200 block/login page"
                blocked = True
                break
            page_jobs = parse_search(response.text, company, fetched_at)
            if not page_jobs:
                empty_pages += 1
                LOG.info("%s start=%s empty_page=%s/2", company, start, empty_pages)
                start += 10
                if empty_pages >= 2:
                    ended_cleanly = True
                    break
                time.sleep(random.uniform(args.delay_min, args.delay_max))
                continue
            empty_pages = 0
            for job in page_jobs:
                jobs_by_id.setdefault(job["sourceJobId"], job)
            LOG.info("%s start=%s cards=%s accepted_total=%s", company, start, len(page_jobs), len(jobs_by_id))
            start += 10
            if len(jobs_by_id) < args.results_per_company:
                time.sleep(random.uniform(args.delay_min, args.delay_max))
        company_jobs = list(jobs_by_id.values())[: args.results_per_company]
        if company not in status_summary:
            if ended_cleanly and company_jobs:
                status_summary[company] = f"ok: {len(company_jobs)} jobs"
            elif ended_cleanly:
                status_summary[company] = "no-results-untrusted"
            elif len(jobs_by_id) >= args.results_per_company or start >= 1000:
                status_summary[company] = f"partial@cap: {len(company_jobs)} jobs"
            else:
                status_summary[company] = f"partial: {len(company_jobs)} jobs"'''
)
print("Applied lifecycle hardening patch")
