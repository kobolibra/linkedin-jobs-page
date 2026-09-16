#!/usr/bin/env python3
"""Fetch Busuanzi server-side so the browser never executes third-party JSONP."""
import json
import re
import sys
from pathlib import Path
from urllib.request import Request, urlopen

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "pv.json")
url = "https://busuanzi.ibruce.info/busuanzi?jsonpCallback=BusuanziCallback_Publish"
request = Request(url, headers={"Referer": "https://linkedin.claudecowork.workers.dev/", "User-Agent": "github-actions-pv-publisher"})
try:
    body = urlopen(request, timeout=20).read().decode("utf-8", "replace")
    match = re.search(r"BusuanziCallback_Publish\((\{.*?\})\)", body)
    if not match:
        raise ValueError("Busuanzi response did not contain JSONP payload")
    payload = json.loads(match.group(1))
    result = {
        "site_pv": int(payload.get("site_pv", 0)),
        "site_uv": int(payload.get("site_uv", 0)),
        "fetchedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "source": "busuanzi-server-side",
    }
except Exception as exc:
    print(f"warning: unable to refresh visitor counter: {exc}", file=sys.stderr)
    if OUT.exists():
        print("keeping existing pv.json")
        raise SystemExit(0)
    result = {"site_pv": None, "site_uv": None, "fetchedAt": None, "source": "unavailable"}
OUT.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
print("published", result)
