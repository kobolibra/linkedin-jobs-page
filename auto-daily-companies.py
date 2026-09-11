#!/usr/bin/env python3
"""
Auto Daily Companies Filter v2
------------------------------
Downloads latest jobs.json and financial_blacklist.json from GitHub,
filters by Beijing time today, excludes financial/headhunter companies
using the blacklist (exact match, loaded from GitHub for persistence).
Saves results to /workspace/today-companies-YYYY-MM-DD.json.

Blacklist is stored on GitHub at:
  https://github.com/kobolibra/linkedin-jobs-page/blob/main/financial_blacklist.json
This ensures the blacklist persists across sessions.
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

GITHUB_TOKEN = "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"
GITHUB_REPO = "kobolibra/linkedin-jobs-page"
GITHUB_BRANCH = "main"
# Use GitHub API (NOT raw.githubusercontent.com) for private repo access
JOBS_API_URL = f"https://api.github.com/repos/{GITHUB_REPO}/contents/jobs.json"
BLACKLIST_API_URL = f"https://api.github.com/repos/{GITHUB_REPO}/contents/financial_blacklist.json"

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


def download_json_from_api(api_url, timeout=60):
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
        if is_crypto(cn):
            target.append({"company": cn, "category": "target",
                          "reason": "crypto/blockchain (always included)",
                          "pushTime": str(pt)})
            continue
        if cn in FINANCIAL_BLACKLIST:
            excluded.append({"company": cn, "category": "excluded",
                           "reason": "blacklist exact match (financial/headhunter)",
                           "pushTime": str(pt)})
        else:
            target.append({"company": cn, "category": "target",
                          "reason": "not in blacklist",
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

    today = get_beijing_today()
    print(f"[INFO] Today (Beijing): {today}")

    # Load blacklist from GitHub (persistent storage)
    load_blacklist_from_github()

    # Download jobs data via API (private repo)
    jobs_data = download_json_from_api(JOBS_API_URL)
    if not jobs_data:
        print("[ERROR] Failed to download jobs.json")
        sys.exit(1)

    # Process jobs
    results = process_jobs(jobs_data, today)

    # Save results
    filepath = os.path.join(OUTPUT_DIR, f"today-companies-{today}.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n[INFO] Results saved to: {filepath}")

    # Print summary
    print("\n" + "=" * 70)
    print(f"  DAILY COMPANIES REPORT - {today} (Beijing Time)")
    print("=" * 70)
    print(f"  Total jobs: {results['total_all_jobs']}")
    print(f"  Today's jobs (past 24h): {results['total_today_jobs']}")
    print(f"  Target companies: {results['total_target']}")
    print(f"  Excluded companies: {results['total_excluded']}")
    print("-" * 70)
    if results["target_companies"]:
        print("\n  [TARGET COMPANIES]")
        for i, c in enumerate(results["target_companies"], 1):
            print(f"  {i:3d}. {c['company']}")
    if results["excluded_companies"]:
        print("\n  [EXCLUDED COMPANIES]")
        for i, c in enumerate(results["excluded_companies"], 1):
            print(f"  {i:3d}. {c['company']} - {c['reason']}")
    print("=" * 70)

    return results, filepath


if __name__ == "__main__":
    main()
