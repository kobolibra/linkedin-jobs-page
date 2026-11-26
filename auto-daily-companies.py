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
from pathlib import Path
# Isolated Python (-I) deliberately excludes the script directory.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import reclassify as classification
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
OUTPUT_DIR = os.environ.get("NEXT_JOURNEY_OUTPUT_DIR", "/workspace")

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


def push_daily_report_to_github(jobs, today):
    repo = classification.Repo(GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH, urllib.request.build_opener())
    path = classification.daily_paths(today)[0]

    def build(read):
        blacklist, industries = classification.classifications(read)
        results = process_jobs(jobs, today, blacklist, industries)
        current = read(path)
        previous = json.loads(current) if current is not None else None
        merged = dict(results)
        if previous is not None:
            for key in ("target_companies", "excluded_companies"):
                merged[key] = previous[key] + results[key]
        report = classification.classify(merged, classification.protected_names(blacklist),
                                         classification.verified_industries(industries))
        return classification.daily_files(today, report)

    files = repo.transact(build, f"Publish daily company report for {today}")
    classification.mirror(files, today, OUTPUT_DIR)
    return json.loads(files[path])


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


def get_target_reason(cn, industries):
    """Determine the 备注 string for a target company.
    Shows verified industry from company_industries.json if available.
    Shows crypto tag for crypto companies.
    Shows 待查证 for companies not yet verified."""
    parts = []
    if is_crypto(cn):
        parts.append("crypto/blockchain (always included)")
    if classification.norm(cn) in industries:
        parts.append(industries[classification.norm(cn)])
    if not parts:
        return "待查证"
    return " | ".join(parts)


def process_jobs(jobs, today, blacklist, industries):
    blocked = classification.protected_names(classification.blacklist_records(blacklist))
    verified = classification.verified_industries(industries)
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
        if classification.norm(cn) in blocked:
            excluded.append({"company": cn, "category": "excluded",
                           "reason": "blacklist exact match (financial/headhunter)",
                           "pushTime": str(pt)})
        else:
            target.append({"company": cn, "category": "target",
                          "reason": get_target_reason(cn, verified),
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

    # Download jobs data via API (private repo)
    jobs_data = download_json_from_api(JOBS_API_URL)
    if not jobs_data:
        print("[ERROR] Failed to download jobs.json")
        sys.exit(1)

    results = push_daily_report_to_github(jobs_data, today)
    filepath = os.path.join(OUTPUT_DIR, f"today-companies-{today}.json")

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
