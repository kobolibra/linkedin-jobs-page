"""Read-only production verification: health checks must never add page views."""
from datetime import datetime
import json
import time
from urllib.request import urlopen

BASE = "https://linkedin.claudecowork.workers.dev"
error = None
for attempt in range(6):
    try:
        with urlopen(BASE + "/api/visits", timeout=15) as response:
            data = json.load(response)
            assert response.status == 200
            assert "no-store" in response.headers.get("cache-control", "")
        assert data["source"] == "first-party-live"
        assert type(data["site_pv"]) is int and data["site_pv"] >= 0
        datetime.fromisoformat(data["startedAt"].replace("Z", "+00:00"))
        with urlopen(BASE + "/", timeout=15) as response:
            html = response.read().decode()
            assert "visitor-count.js?v=first-party-live-1" in html
            assert "busuanzi.ibruce.info" not in html
        with urlopen(BASE + "/visitor-count.js?v=first-party-live-1", timeout=15) as response:
            script = response.read().decode()
            assert "first-party-live" in script and "pv.json" not in script
        print("Production live counter verified (GET only; no synthetic page views):", json.dumps(data))
        break
    except Exception as exc:
        error = exc
        if attempt < 5:
            time.sleep(5)
else:
    raise RuntimeError(f"Production live counter verification failed: {error}")
