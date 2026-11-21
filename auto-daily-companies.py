#!/usr/bin/env python3
"""
Auto Daily Companies Filter v2
------------------------------
Downloads latest jobs.json and financial_blacklist.json from GitHub,
filters by Beijing time today, excludes financial/headhunter companies
using the blacklist (exact match, loaded from GitHub for persistence).
Also loads company_industries.json to show verified industry info in 备注 column.
Saves results to /workspace/today-companies-YYYY-MM-DD.json.

Blacklist is stored on GitHub at:
  https://github.com/kobolibra/linkedin-jobs-page/blob/main/financial_blacklist.json
Company industries stored at:
  https://github.com/kobolibra/linkedin-jobs-page/blob/main/company_industries.json
"""

import os
import json
import sys
import base64
import urllib.request
import urllib.error
import ssl
from datetime import datetime, timezone, timedelta

# ============================================================
# CONFIGURATION
# ============================================================

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPO = "kobolibra/linkedin-jobs-page"
GITHUB_BRANCH = "main"
# Use GitHub API (NOT raw.githubusercontent.com) for private repo access
JOBS_API_URL = f"https://api.github.com/repos/{GITHUB_REPO}/contents/jobs.json"
BLACKLIST_API_URL = f"https://api.github.com/repos/{GITHUB_REPO}/contents/financial_blacklist.json"
INDUSTRIES_API_URL = f"https://api.github.com/repos/{GITHUB_REPO}/contents/company_industries.json"

BEIJING_TZ = timezone(timedelta(hours=8))
OUTPUT_DIR = "/workspace"

# Built-in fallback blacklist (used if GitHub download fails)
BUILTIN_BLACKLIST = {
    "HSBC", "JPMorgan", "Morgan Stanley", "Goldman Sachs", "UBS", "Barclays",
    "BNP Paribas", "Societe Generale", "MUFG", "Nomura", "Deutsche Bank",
    "BlackRock", "Fidelity", "Vanguard", "PIMCO", "State Street", "Invesco",
    "Michael Page", "Robert Walters", "Robert Half", "Hays", "Adecco",
    "Manpower", "Randstad", "Kelly Services", "Bloomberg", "FactSet",
    "Citi", "Standard Chartered", "Credit Suisse", "Macquarie",
}

# Loaded from GitHub at runtime
FINANCIAL_BLACKLIST = set()
COMPANY_INDUSTRIES = {}  # {company_name: industry_string}


# ============================================================
# GITHUB FUNCTIONS
# ============================================================

def _make_request(url, headers=None, method="GET", data=None, timeout=60):
    """Make an HTTP request with auth headers."""
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", f"Bearer {GITHUB_TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "auto-daily-companies/2.0")
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    ctx = ssl.create_default_context()
    if data:
        req.data = data.encode("utf-8") if isinstance(data, str) else data
    return urllib.request.urlopen(req, context=ctx, timeout=timeout)


def download_json_from_api(api_url, timeout=120):
    """Download JSON from GitHub API (private repo support via base64 decode or download_url for large files)."""
    print(f"[INFO] Downloading via API: {api_url}")
    try:
        with _make_request(api_url, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if "content" in data and data.get("encoding") == "base64":
                return json.loads(base64.b64decode(data["content"]).decode("utf-8"))
            # Large files: encoding is None, use download_url with temp token
            if "download_url" in data and data["download_url"]:
                print(f"[INFO] Large file ({data.get('size',0)/1024/1024:.1f}MB), downloading via download_url...")
                dl_req = urllib.request.Request(data["download_url"])
                dl_req.add_header("Authorization", f"Bearer {GITHUB_TOKEN}")
                dl_req.add_header("Accept", "application/vnd.github.v3.raw+json")
                dl_req.add_header("User-Agent", "auto-daily-companies/2.0")
                ctx = ssl.create_default_context()
                with urllib.request.urlopen(dl_req, context=ctx, timeout=timeout) as dl_resp:
                    return json.loads(dl_resp.read().decode("utf-8"))
            return data
    except urllib.error.HTTPError as e:
        print(f"[ERROR] HTTP {e.code}: {e.reason} for {api_url}")
        return None
    except Exception as e:
        print(f"[ERROR] {e} for {api_url}")
        return None


def load_blacklist_from_github():
    """Load financial blacklist from GitHub API. Falls back to builtin if fails."""
    global FINANCIAL_BLACKLIST
    data = download_json_from_api(BLACKLIST_API_URL)
    if data and isinstance(data, list):
        FINANCIAL_BLACKLIST = set(data)
        print(f"[INFO] Loaded {len(FINANCIAL_BLACKLIST)} blacklist entries from GitHub")
    else:
        print("[WARN] Failed to load blacklist from GitHub, using builtin fallback")
        FINANCIAL_BLACKLIST = set(BUILTIN_BLACKLIST)
        print(f"[INFO] Using {len(FINANCIAL_BLACKLIST)} builtin blacklist entries")


def load_industries_from_github():
    """Load company industries from GitHub API. Falls back to empty if not found."""
    global COMPANY_INDUSTRIES
    try:
        data = download_json_from_api(INDUSTRIES_API_URL)
        if data and isinstance(data, dict):
            COMPANY_INDUSTRIES = data
            print(f"[INFO] Loaded {len(COMPANY_INDUSTRIES)} company industry entries from GitHub")
        elif data is not None:
            print(f"[WARN] company_industries.json is not a dict, ignoring")
        else:
            print("[INFO] company_industries.json not found on GitHub (first run)")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print("[INFO] company_industries.json not found on GitHub yet (first run)")
        else:
            print(f"[WARN] Could not load company_industries.json: HTTP {e.code}")
    except Exception as e:
        print(f"[WARN] Could not load company_industries.json: {e}")


def update_blacklist_on_github(new_companies):
    """Add new companies to the blacklist JSON file on GitHub."""
    if not new_companies:
        return
    # Merge with existing
    updated = sorted(FINANCIAL_BLACKLIST | set(new_companies))
    content = json.dumps(updated, ensure_ascii=False, indent=2)
    content_b64 = base64.b64encode(content.encode("utf-8")).decode("ascii")

    # Get current file sha (needed for update)
    sha = None
    try:
        with _make_request(BLACKLIST_API_URL) as resp:
            info = json.loads(resp.read())
            sha = info.get("sha")
    except urllib.error.HTTPError as e:
        if e.code != 404:
            print(f"[WARN] Could not get blacklist sha: {e.code}")

    payload = json.dumps({
        "message": f"Update financial blacklist: +{len(new_companies)} companies ({datetime.now(BEIJING_TZ).strftime('%Y-%m-%d')})",
        "content": content_b64,
        "branch": GITHUB_BRANCH,
        **({"sha": sha} if sha else {})
    })
    try:
        req = urllib.request.Request(BLACKLIST_API_URL, data=payload.encode("utf-8"), method="PUT")
        req.add_header("Authorization", f"Bearer {GITHUB_TOKEN}")
        req.add_header("Accept", "application/vnd.github+json")
        req.add_header("Content-Type", "application/json")
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            result = json.loads(resp.read())
            print(f"[INFO] Blacklist updated on GitHub: +{len(new_companies)} companies (total: {len(updated)})")
            print(f"[INFO] Commit: {result['commit']['sha'][:12]}")
            FINANCIAL_BLACKLIST.update(new_companies)
    except Exception as e:
        print(f"[WARN] Failed to update blacklist on GitHub: {e}")
        print(f"[INFO] New companies to add manually: {new_companies}")


def push_file_to_github(repo_path, text_content, commit_message):
    """Create or update a single file on GitHub via Contents API.

    repo_path: path inside repo, e.g. 'reports/today-companies-2026-11-21.json'
    text_content: the file body as a string (will be base64-encoded)
    commit_message: commit message
    Returns True on success, False on failure.
    """
    api_url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{repo_path}"
    content_b64 = base64.b64encode(text_content.encode("utf-8")).decode("ascii")

    # Get existing file sha (needed when updating an existing file)
    sha = None
    try:
        with _make_request(api_url) as resp:
            info = json.loads(resp.read())
            sha = info.get("sha")
    except urllib.error.HTTPError as e:
        if e.code != 404:
            print(f"[WARN] Could not get sha for {repo_path}: HTTP {e.code}")
    except Exception as e:
        print(f"[WARN] Could not get sha for {repo_path}: {e}")

    payload = json.dumps({
        "message": commit_message,
        "content": content_b64,
        "branch": GITHUB_BRANCH,
        **({"sha": sha} if sha else {})
    })
    try:
        req = urllib.request.Request(api_url, data=payload.encode("utf-8"), method="PUT")
        req.add_header("Authorization", f"Bearer {GITHUB_TOKEN}")
        req.add_header("Accept", "application/vnd.github+json")
        req.add_header("Content-Type", "application/json")
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
            result = json.loads(resp.read())
            print(f"[INFO] Pushed to GitHub: {repo_path} (commit {result['commit']['sha'][:12]})")
            return True
    except Exception as e:
        print(f"[WARN] Failed to push {repo_path} to GitHub: {e}")
        return False


def download_file_from_github(repo_path):
    """Download a file's text content from GitHub.

    Returns None only when the file genuinely does not exist. Any other read
    failure is raised so callers never overwrite an existing cumulative report
    with an incomplete list after a transient network/API error.
    """
    api_url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{repo_path}"
    try:
        with _make_request(api_url) as resp:
            data = json.loads(resp.read())
            if "content" in data and data.get("encoding") == "base64":
                return base64.b64decode(data["content"]).decode("utf-8")
            raise RuntimeError(f"Unexpected GitHub contents response for {repo_path}")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def merge_company_lists(existing_list, new_list):
    """Merge two company lists, deduplicating by company name (accumulate).

    - Companies already in existing_list keep their position.
    - New companies (not seen before) are appended at the end.
    - If a company appears in both, update reason only when the new reason is
      more informative (i.e. old reason was '待查证' and new one is verified).
    Returns the merged list.
    """
    merged = list(existing_list)
    name_to_idx = {c.get("company"): i for i, c in enumerate(merged)}
    for c in new_list:
        name = c.get("company")
        if name in name_to_idx:
            idx = name_to_idx[name]
            old_reason = merged[idx].get("reason", "")
            new_reason = c.get("reason", "")
            # Prefer verified industry over 待查证; never overwrite a verified
            # reason back to 待查证.
            if old_reason == "待查证" and new_reason and new_reason != "待查证":
                merged[idx]["reason"] = new_reason
            elif not old_reason and new_reason:
                merged[idx]["reason"] = new_reason
        else:
            merged.append(c)
            name_to_idx[name] = len(merged) - 1
    return merged


def push_daily_report_to_github(results, today):
    """Push the daily report to GitHub with ACCUMULATION (never overwrite).

    Behavior:
    - Local files / stdout: only THIS run's new companies (unchanged behavior).
    - GitHub daily files (reports/today-*-YYYY-MM-DD.*): accumulate WITHIN the
      same day, so running the script multiple times on one day appends new
      companies instead of overwriting earlier ones.
    - GitHub cumulative files (reports/cumulative-*.tsv): accumulate ACROSS all
      days, keeping first_seen / last_seen dates per company.
    """
    print(f"\n=== Step: Push daily report to GitHub (reports/, cumulative) ===")
    stamp = datetime.now(BEIJING_TZ).strftime("%Y-%m-%d %H:%M")

    # ---- 1. Daily JSON report: merge with any existing report for today ----
    daily_json_path = f"reports/today-companies-{today}.json"
    merged = dict(results)  # shallow copy; we replace the two lists below
    existing_json = download_file_from_github(daily_json_path)
    if existing_json:
        try:
            prev = json.loads(existing_json)
            prev_t = len(prev.get("target_companies", []))
            prev_e = len(prev.get("excluded_companies", []))
            merged["target_companies"] = merge_company_lists(
                prev.get("target_companies", []), results["target_companies"])
            merged["excluded_companies"] = merge_company_lists(
                prev.get("excluded_companies", []), results["excluded_companies"])
            merged["total_target"] = len(merged["target_companies"])
            merged["total_excluded"] = len(merged["excluded_companies"])
            print(f"[INFO] Merged daily report: target {prev_t} + {len(results['target_companies'])} new -> {merged['total_target']}, "
                  f"excluded {prev_e} + {len(results['excluded_companies'])} new -> {merged['total_excluded']}")
        except Exception as e:
            print(f"[WARN] Could not parse existing daily JSON, will overwrite: {e}")

    push_file_to_github(
        daily_json_path,
        json.dumps(merged, ensure_ascii=False, indent=2),
        f"Daily report {today}: {merged['total_target']} target / {merged['total_excluded']} excluded (cumulative)",
    )

    # ---- 2. Daily target TSV (from merged list) ----
    target_lines = ["序号\t公司名\t备注"]
    for i, c in enumerate(merged["target_companies"], 1):
        target_lines.append(f"{i}\t{c['company']}\t{c.get('reason', '')}")
    push_file_to_github(
        f"reports/today-target-companies-{today}.tsv",
        "\n".join(target_lines) + "\n",
        f"Daily target companies {today} ({merged['total_target']} cumulative)",
    )

    # ---- 3. Daily excluded TSV (from merged list) ----
    excl_lines = ["序号\t公司名\t排除原因"]
    for i, c in enumerate(merged["excluded_companies"], 1):
        excl_lines.append(f"{i}\t{c['company']}\t{c.get('reason', '')}")
    push_file_to_github(
        f"reports/today-excluded-companies-{today}.tsv",
        "\n".join(excl_lines) + "\n",
        f"Daily excluded companies {today} ({merged['total_excluded']} cumulative)",
    )

    # ---- 4. Cumulative all-time target TSV (across days) ----
    _push_cumulative_tsv(
        "reports/cumulative-target-companies.tsv",
        "公司名\t备注\t首次出现\t最近出现",
        results["target_companies"],
        today,
        "Cumulative target companies",
    )

    # ---- 5. Cumulative all-time excluded TSV (across days) ----
    _push_cumulative_tsv(
        "reports/cumulative-excluded-companies.tsv",
        "公司名\t排除原因\t首次出现\t最近出现",
        results["excluded_companies"],
        today,
        "Cumulative excluded companies",
    )

    print(f"[INFO] Daily report pushed to GitHub at {stamp} (Beijing)")


def _push_cumulative_tsv(repo_path, header, new_companies, today, label):
    """Merge new_companies into an existing cumulative TSV on GitHub and push.

    TSV columns: 公司名 / 备注(or 排除原因) / 首次出现 / 最近出现
    Deduplicates by company name; appends new companies; updates last_seen and
    upgrades reason from 待查证 to a verified industry when available.
    """
    existing_text = download_file_from_github(repo_path)
    entries = []  # list of dicts
    if existing_text:
        for line in existing_text.strip().split("\n")[1:]:  # skip header
            if not line.strip():
                continue
            parts = line.split("\t")
            if len(parts) >= 4:
                entries.append({
                    "company": parts[0],
                    "reason": parts[1],
                    "first_seen": parts[2],
                    "last_seen": parts[3],
                })

    by_name = {e["company"]: e for e in entries}
    added = 0
    for c in new_companies:
        name = c.get("company")
        new_reason = c.get("reason", "")
        if name in by_name:
            e = by_name[name]
            e["last_seen"] = today
            if e.get("reason") == "待查证" and new_reason and new_reason != "待查证":
                e["reason"] = new_reason
            elif not e.get("reason") and new_reason:
                e["reason"] = new_reason
        else:
            e = {"company": name, "reason": new_reason,
                 "first_seen": today, "last_seen": today}
            entries.append(e)
            by_name[name] = e
            added += 1

    lines = [header]
    for e in entries:
        lines.append(f"{e['company']}\t{e['reason']}\t{e['first_seen']}\t{e['last_seen']}")
    push_file_to_github(
        repo_path,
        "\n".join(lines) + "\n",
        f"{label}: +{added} new (total {len(entries)}) as of {today}",
    )
    print(f"[INFO] {label}: +{added} new companies (total {len(entries)})")


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def get_beijing_today():
    return datetime.now(BEIJING_TZ).strftime("%Y-%m-%d")


def parse_push_time_dt(s):
    """Parse pushTime string and return a timezone-aware datetime in Beijing time.
    Returns None if parsing fails."""
    if not s:
        return None
    for fmt in ["%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S.%f%z",
                "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S.%fZ",
                "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%d %H:%M:%S%z", "%Y/%m/%d %H:%M:%S", "%Y-%m-%d"]:
        try:
            dt = datetime.strptime(s, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(BEIJING_TZ)
        except ValueError:
            continue
    return None


def extract_company_name(job):
    for f in ["company", "companyName", "company_name", "employer",
              "employerName", "employer_name", "organization", "org", "name", "title"]:
        v = job.get(f)
        if v and isinstance(v, str) and v.strip():
            return v.strip()
    co = job.get("company")
    if isinstance(co, dict):
        for f in ["name", "displayName", "display_name", "title"]:
            v = co.get(f)
            if v and isinstance(v, str) and v.strip():
                return v.strip()
    return None


def is_crypto(name):
    kw = ["crypto", "blockchain", "bitcoin", "ethereum", "token", "defi",
          "nft", "web3", "dao", "metamask", "coinbase", "binance", "okx",
          "huobi", "bybit", "kucoin", "gate", "bitfinex", "kraken", "gemini",
          "uniswap", "aave", "compound", "makerdao", "chainlink", "polygon",
          "solana", "avalanche", "polkadot", "cosmos", "near", "aptos",
          "sui", "arbitrum", "optimism", "zksync", "starknet",
          "加密货币", "区块链", "数字货币", "比特币", "以太坊", "币安", "火币", "欧易"]
    nl = name.lower()
    return any(k in nl for k in kw)


def get_target_reason(cn):
    """Determine the 备注 string for a target company.
    Shows verified industry from company_industries.json if available.
    Shows crypto tag for crypto companies.
    Shows 待查证 for companies not yet verified."""
    parts = []
    if is_crypto(cn):
        parts.append("crypto/blockchain (always included)")
    if cn in COMPANY_INDUSTRIES:
        parts.append(COMPANY_INDUSTRIES[cn])
    if not parts:
        return "待查证"
    return " | ".join(parts)


def process_jobs(jobs, today):
    if not isinstance(jobs, list):
        if isinstance(jobs, dict):
            for key in ["jobs", "data", "results", "items", "list"]:
                if key in jobs and isinstance(jobs[key], list):
                    jobs = jobs[key]
                    break
            else:
                print("[ERROR] No jobs list found")
                sys.exit(1)

    # Filter: past 24 hours in Beijing time
    now_bj = datetime.now(BEIJING_TZ)
    cutoff = now_bj - timedelta(hours=24)
    print(f"[INFO] Filtering pushTime from {cutoff.strftime('%Y-%m-%d %H:%M')} to {now_bj.strftime('%Y-%m-%d %H:%M')} (Beijing time, past 24h)")

    target, excluded, seen, today_jobs = [], [], set(), []
    for job in jobs:
        if not isinstance(job, dict):
            continue
        cn = extract_company_name(job)
        if not cn:
            continue
        pt = job.get("pushTime") or job.get("push_time") or job.get("date")
        pt_dt = parse_push_time_dt(str(pt)) if pt else None
        if not pt_dt or pt_dt < cutoff or pt_dt > now_bj:
            continue
        today_jobs.append(job)
        if cn in seen:
            continue
        seen.add(cn)
        if cn in FINANCIAL_BLACKLIST:
            excluded.append({"company": cn, "category": "excluded",
                           "reason": "blacklist exact match (financial/headhunter)",
                           "pushTime": str(pt)})
        else:
            target.append({"company": cn, "category": "target",
                          "reason": get_target_reason(cn),
                          "pushTime": str(pt)})

    print(f"\n[INFO] Total jobs: {len(jobs)}, Past 24h: {len(today_jobs)}")
    print(f"[INFO] Target: {len(target)}, Excluded: {len(excluded)}")
    return {
        "date": today,
        "filter_window": f"{cutoff.strftime('%Y-%m-%d %H:%M')} ~ {now_bj.strftime('%Y-%m-%d %H:%M')} (Beijing)",
        "target_companies": target,
        "excluded_companies": excluded,
        "total_target": len(target),
        "total_excluded": len(excluded),
        "total_today_jobs": len(today_jobs),
        "total_all_jobs": len(jobs),
    }


# ============================================================
# MAIN
# ============================================================

def main():
    print("=" * 70)
    print("  AUTO DAILY COMPANIES FILTER v2")
    print("=" * 70)

    if not GITHUB_TOKEN:
        print("[ERROR] GITHUB_TOKEN environment variable is not set")
        sys.exit(1)

    today = get_beijing_today()
    print(f"[INFO] Today (Beijing): {today}")

    # Load blacklist from GitHub (persistent storage)
    load_blacklist_from_github()

    # Load company industries from GitHub (persistent storage)
    load_industries_from_github()

    # Download jobs data via API (private repo)
    jobs_data = download_json_from_api(JOBS_API_URL)
    if not jobs_data:
        print("[ERROR] Failed to download jobs.json")
        sys.exit(1)

    # Process jobs
    results = process_jobs(jobs_data, today)

    # Save results as JSON
    filepath = os.path.join(OUTPUT_DIR, f"today-companies-{today}.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n[INFO] Results saved to: {filepath}")

    # Save target companies as TSV (tab-separated) for easy copy-paste into Excel
    tsv_path = os.path.join(OUTPUT_DIR, f"today-target-companies-{today}.tsv")
    with open(tsv_path, "w", encoding="utf-8-sig") as f:
        # UTF-8 BOM so Excel opens Chinese correctly
        f.write("序号\t公司名\t备注\n")
        for i, c in enumerate(results["target_companies"], 1):
            f.write(f"{i}\t{c['company']}\t{c.get('reason', '')}\n")
    print(f"[INFO] TSV table saved to: {tsv_path}")

    # Save excluded companies as TSV too
    excl_tsv_path = os.path.join(OUTPUT_DIR, f"today-excluded-companies-{today}.tsv")
    with open(excl_tsv_path, "w", encoding="utf-8-sig") as f:
        f.write("序号\t公司名\t排除原因\n")
        for i, c in enumerate(results["excluded_companies"], 1):
            f.write(f"{i}\t{c['company']}\t{c.get('reason', '')}\n")
    print(f"[INFO] Excluded TSV table saved to: {excl_tsv_path}")

    # Push daily report (JSON + target TSV + excluded TSV) to GitHub so the
    # target company list is persisted on GitHub every run, not only locally.
    try:
        push_daily_report_to_github(results, today)
    except Exception as e:
        print(f"[WARN] push_daily_report_to_github failed: {e}")

    # Print summary
    print("\n" + "=" * 70)
    print(f"  DAILY COMPANIES REPORT - {today} (Beijing Time)")
    print("=" * 70)
    print(f"  Total jobs: {results['total_all_jobs']}")
    print(f"  Today's jobs (past 24h): {results['total_today_jobs']}")
    print(f"  Target companies: {results['total_target']}")
    print(f"  Excluded companies: {results['total_excluded']}")
    print("=" * 70)

    # TARGET COMPANIES — TSV inside fenced code block to preserve Tab chars in Trae
    # Copy the code block content (including header) and paste into Excel/WPS/Google Sheets
    if results["target_companies"]:
        print("\n[TARGET COMPANIES] — copy the code block below into Excel:")
        print("```tsv")
        print("序号\t公司名\t备注")
        for i, c in enumerate(results["target_companies"], 1):
            print(f"{i}\t{c['company']}\t{c.get('reason', '')}")
        print("```")

    # EXCLUDED COMPANIES — TSV inside fenced code block
    if results["excluded_companies"]:
        print("\n[EXCLUDED COMPANIES] — copy the code block below into Excel:")
        print("```tsv")
        print("序号\t公司名\t排除原因")
        for i, c in enumerate(results["excluded_companies"], 1):
            print(f"{i}\t{c['company']}\t{c.get('reason', '')}")
        print("```")
    print("\n" + "=" * 70)

    return results, filepath


if __name__ == "__main__":
    main()
