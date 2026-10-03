#!/usr/bin/env python3
"""Correct n8n RSS CN rows only when the LinkedIn detail page proves Hong Kong."""
from __future__ import annotations
import argparse, json, re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup
from linkedin_ids import linkedin_job_id

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36"
HK_RE = re.compile(r"(?:hong\s*kong|hongkong|hksar|香港)", re.I)

def rows(doc):
    if isinstance(doc, dict) and isinstance(doc.get("jobs"), list):
        return doc["jobs"]
    return doc if isinstance(doc, list) else []

def job_key(row):
    return linkedin_job_id(str(row.get("sourceJobId") or row.get("link") or "")) or str(row.get("sourceJobId") or "")

def candidate(row):
    return (isinstance(row, dict) and row.get("source") == "n8n-rss"
            and str(row.get("location") or "").upper() == "CN"
            and not row.get("locationVerifiedAt") and bool(row.get("link")))

def extract_location(html):
    soup = BeautifulSoup(html or "", "html.parser")
    values=[]
    for selector in (".top-card-layout__second-subline span", ".topcard__flavor"):
        values=[x.get_text(" ", strip=True) for x in soup.select(selector)]
        if values:
            break
    # The second subline item is the detail page's primary location, not a similar-job card.
    location = values[1] if len(values) > 1 else ""
    return location

def fetch_location(row, timeout=20):
    try:
        r=requests.get(row["link"], headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"}, timeout=timeout)
        if r.status_code != 200:
            return None
        location=extract_location(r.text)
        return location if location and HK_RE.search(location) else None
    except requests.RequestException:
        return None

def normalize_document(doc, max_workers=4, timeout=20):
    out=dict(doc) if isinstance(doc, dict) else {"jobs": list(doc or [])}
    all_rows=out.get("jobs", [])
    candidates={job_key(row): row for row in all_rows if candidate(row) and job_key(row)}
    corrected=0
    if candidates:
        with ThreadPoolExecutor(max_workers=max(1, int(max_workers))) as pool:
            futures={pool.submit(fetch_location,row,timeout): key for key,row in candidates.items()}
            for future in as_completed(futures):
                key=futures[future]; location=future.result()
                row=candidates[key]
                if location:
                    row["location"]="HK"
                    row["locationRaw"]=location
                    row["city"]="HONG KONG SAR"
                    row["locationVerifiedAt"]=datetime.now(timezone.utc).isoformat()
                    row["locationVerificationSource"]="linkedin-detail"
                    corrected += 1
    out["jobs"]=all_rows
    out["count"]=len(all_rows)
    out["locationNormalization"]={"correctedCNtoHK": corrected, "candidates": len(candidates), "source":"linkedin-detail"}
    return out

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--jobs", required=True); ap.add_argument("--batch", required=False)
    ap.add_argument("--output", required=True); ap.add_argument("--max-workers", type=int, default=4)
    ap.add_argument("--timeout", type=float, default=20)
    args=ap.parse_args()
    doc=json.loads(Path(args.jobs).read_text(encoding="utf-8"))
    out=normalize_document(doc, args.max_workers, args.timeout)
    Path(args.output).write_text(json.dumps(out, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(json.dumps(out["locationNormalization"], ensure_ascii=False))

if __name__ == "__main__": main()
