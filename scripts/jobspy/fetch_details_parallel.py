#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, random, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from urllib.parse import urlsplit, urlunsplit
import requests
from bs4 import BeautifulSoup

def www(url: str) -> str:
    p = urlsplit(url.strip())
    host = "www.linkedin.com" if p.netloc.casefold().endswith("linkedin.com") else p.netloc
    return urlunsplit(("https", host, p.path.rstrip("/"), p.query, ""))

def one(item: dict, timeout: int, attempts: int, delay_min: float, delay_max: float) -> dict:
    out = dict(item); out["link"] = www(out.get("link", "")); last = ""
    s = requests.Session(); s.headers.update({"User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36","Accept-Language":"en-US,en;q=0.9"})
    time.sleep(random.uniform(delay_min, delay_max))
    for attempt in range(1, attempts + 1):
        try:
            r = s.get(out["link"], timeout=(10, timeout))
            if r.status_code == 429 or r.status_code >= 500:
                last = f"HTTP {r.status_code}"
                if attempt < attempts:
                    time.sleep(min(60, 5 * attempt + random.uniform(1, 5))); continue
            r.raise_for_status()
            soup = BeautifulSoup(r.text, "html.parser")
            block = soup.select_one("div.show-more-less-html__markup") or soup.select_one("div.description__text")
            if block:
                out["descriptionHtml"] = str(block)
                out["descriptionText"] = block.get_text("\n", strip=True)
            locs = soup.select("div.top-card-layout__card span.topcard__flavor")
            for loc in locs:
                raw = loc.get_text(" ", strip=True)
                company = str(out.get("company") or "").strip()
                if raw and company and raw.casefold() == company.casefold():
                    continue
                if raw and ("," in raw or "china" in raw.casefold()):
                    out["locationRaw"] = raw; break
            out["detailStatus"] = "ok" if (out.get("descriptionText") or "").strip() else "empty"
            out["detailFetchedAt"] = datetime.now(timezone.utc).isoformat(); out["detailError"] = None
            return out
        except requests.RequestException as exc:
            last = str(exc)
            if attempt < attempts: time.sleep(min(60, 5 * attempt + random.uniform(1, 5)))
    out["detailStatus"] = "failed"; out["detailError"] = last; out["detailFetchedAt"] = datetime.now(timezone.utc).isoformat(); return out

def main() -> int:
    ap = argparse.ArgumentParser(); ap.add_argument("--input", type=Path, required=True); ap.add_argument("--output", type=Path, required=True); ap.add_argument("--workers", type=int, default=3); ap.add_argument("--timeout", type=int, default=15); ap.add_argument("--attempts", type=int, default=3); ap.add_argument("--delay-min", type=float, default=1); ap.add_argument("--delay-max", type=float, default=3); a = ap.parse_args()
    doc = json.loads(a.input.read_text(encoding="utf-8")); rows = doc if isinstance(doc, list) else doc.get("jobs", [])
    rows = [dict(x) for x in rows]; lock = Lock(); done = 0
    def save():
        result = rows if isinstance(doc, list) else {**doc, "jobs": rows, "count": len(rows), "detailsFetchedAt": datetime.now(timezone.utc).isoformat()}
        a.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    todo = [i for i,x in enumerate(rows) if not (x.get("descriptionHtml") or "").strip()]
    print(f"total={len(rows)} todo_details={len(todo)} workers={a.workers}", flush=True)
    with ThreadPoolExecutor(max_workers=max(1, a.workers)) as pool:
        fs = {pool.submit(one, rows[i], a.timeout, a.attempts, a.delay_min, a.delay_max): i for i in todo}
        for f in as_completed(fs):
            i = fs[f]; rows[i] = f.result(); done += 1
            with lock: save()
            print(f"detail {done}/{len(todo)} {rows[i].get('sourceJobId')} {rows[i].get('detailStatus')}", flush=True)
    ok = sum(x.get("detailStatus") == "ok" for x in rows); failed = sum(x.get("detailStatus") == "failed" for x in rows); empty = sum(x.get("detailStatus") == "empty" for x in rows)
    print(json.dumps({"total":len(rows),"ok":ok,"empty":empty,"failed":failed}, ensure_ascii=False)); return 0
if __name__ == "__main__": raise SystemExit(main())
