"""Validate State Street search coverage and CN-only JD publication rules."""
import argparse
import json
from pathlib import Path

def validate(doc, details=False):
    statuses = doc.get("statusSummary", {})
    for region in ("CN", "HK", "SG"):
        status = str(statuses.get("State Street::" + region, ""))
        # Resumed tail is historically complete, but cannot expire missing
        # canonical rows because its prefix was observed at a different time.
        if not (status.startswith("ok:") or status.startswith("partial@resumed-end:")):
            raise ValueError("Incomplete State Street " + region + ": " + status)
    rows = doc.get("jobs", [])
    if not rows:
        raise ValueError("No historical jobs; refusing an empty baseline")
    if details:
        missing = [j.get("link") for j in rows if j.get("location") == "CN" and (j.get("detailStatus") != "ok" or not (j.get("descriptionHtml") or j.get("descriptionText")))]
        if missing:
            raise ValueError("Missing CN JD for " + str(len(missing)) + " jobs; see retained artifact")
        unexpected = [j.get("link") for j in rows if j.get("location") in ("HK", "SG") and (j.get("descriptionHtml") or j.get("descriptionText"))]
        if unexpected:
            raise ValueError("HK/SG must be listing-only; found " + str(len(unexpected)) + " unexpected JDs")
    print(json.dumps({"jobs": len(rows), "regions": {r: sum(j.get("location") == r for j in rows) for r in ("CN","HK","SG")}, "details": details}))
    return rows

if __name__ == "__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--input", required=True)
    p.add_argument("--details", action="store_true")
    args=p.parse_args()
    validate(json.loads(Path(args.input).read_text()), args.details)
