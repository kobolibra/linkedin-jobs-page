#!/usr/bin/env python3
"""Verify jobs missing from a successful search snapshot without fetching/storing JD.

LinkedIn's company search endpoint is a discovery source, not a guaranteed
complete truth set. For jobs that disappear from a snapshot, this lightweight
check uses the public detail page only to decide whether the job is still open.
"""
from __future__ import annotations

import argparse
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
from bs4 import BeautifulSoup


def rows(doc):
    return doc if isinstance(doc, list) else doc.get("jobs", []) if isinstance(doc, dict) else []


def jid(item):
    raw = str(item.get("sourceJobId") or item.get("link") or "").strip()
    match = re.search(r"(?:li-|ln:)?(\d{7,})", raw)
    return match.group(1) if match else raw


def company_key(item):
    return str(item.get("companyCanonical") or item.get("requestedCompany") or item.get("company") or "").strip().casefold()


def successful(snapshot):
    statuses = snapshot.get("statusSummary", {}) if isinstance(snapshot, dict) else {}
    return {str(k).casefold() for k, v in statuses.items() if str(v).startswith(("ok:", "empty"))}


def verify(item, timeout):
    key = jid(item)
    url = str(item.get("link") or "").strip()
    if not key or not url:
        return key, "unknown", "missing_url"
    try:
        response = requests.get(url, headers={"User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9"}, timeout=(10, timeout), allow_redirects=True)
        if response.status_code == 404:
            return key, "closed", "HTTP 404"
        if response.status_code != 200:
            return key, "unknown", f"HTTP {response.status_code}"
        text = BeautifulSoup(response.text, "html.parser").get_text(" ", strip=True).casefold()
        html = response.text.casefold()
        closed_markers = ("no longer accepting applications", "no longer available", "job is no longer", "this job has expired")
        if any(marker in text or marker in html for marker in closed_markers):
            return key, "closed", "closed_marker"
        title = str(BeautifulSoup(response.text, "html.parser").title or "").casefold()
        if "linkedin" in title and ("hiring" in title or "jobs" in title) and ("apply" in html or "apply" in text):
            return key, "active", "detail_page_open"
        return key, "unknown", "insufficient_open_marker"
    except requests.RequestException as exc:
        return key, "unknown", str(exc)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--existing", type=Path, required=True)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--timeout", type=int, default=15)
    args = parser.parse_args()
    existing_doc = json.loads(args.existing.read_text(encoding="utf-8"))
    snapshot = json.loads(args.snapshot.read_text(encoding="utf-8"))
    incoming = {jid(x) for x in rows(snapshot) if jid(x)}
    valid_companies = successful(snapshot)
    candidates = [x for x in rows(existing_doc) if jid(x) not in incoming and company_key(x) in valid_companies and int(x.get("missingSnapshotCount") or 0) >= 1]
    results = {"active": [], "closed": [], "unknown": [], "checked": 0}
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = [pool.submit(verify, item, args.timeout) for item in candidates]
        for future in as_completed(futures):
            key, state, reason = future.result()
            if key:
                results.setdefault(state, []).append({"sourceJobId": key, "reason": reason})
            results["checked"] += 1
    args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: len(v) if isinstance(v, list) else v for k, v in results.items()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
