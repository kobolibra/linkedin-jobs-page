"""Record immutable first dates and monotonic last dates for all three regions."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from linkedin_ids import linkedin_job_id
from posting_dates import is_repost, posting_day, source_date_unchanged


def enrich_history(doc, history, observed_at):
    for item in doc.get("jobs", []):
        key = linkedin_job_id(item.get("sourceJobId") or item.get("link"))
        if not key:
            continue
        old = history.get(key, {})
        posted, previous = posting_day(item.get("datePosted")), posting_day(old.get("lastPosted"))
        observed = posting_day(observed_at)
        if posted and posted > observed:
            posted = None
        first = posting_day(old.get("firstSeen"))
        # The first recorded posting day is immutable. An older date-only
        # search card may simply be the UTC source date after its previous
        # relative-age evidence has aged out; it cannot rewrite history.
        if posted and first is None:
            first = posted
        raw = item.get("linkedinPostedRaw")
        # A legacy UTC/source-day becoming a Beijing day is NOT a repost.
        unchanged = bool(raw and source_date_unchanged({**old, "jobspyLastPosted": old.get("lastPosted")}, raw))
        item["jobspyRepost"] = False if unchanged else is_repost({"jobspyLastPosted": old.get("lastPosted")}, posted, observed_at)
        last = max(d for d in (posted if not unchanged else None, previous) if d) if (posted and not unchanged) or previous else None
        item["jobspyFirstSeen"] = first.isoformat() if first else None
        item["jobspyLastPosted"] = last.isoformat() if last else None
        record = {"firstSeen": item["jobspyFirstSeen"], "lastPosted": item["jobspyLastPosted"],
                  "lastObservedAt": observed_at, "observations": int(old.get("observations", 0)) + 1}
        if raw:
            record["linkedinPostedRaw"] = raw
        history[key] = record
    return doc, history


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", required=True); ap.add_argument("--history", required=True)
    args = ap.parse_args()
    path = Path(args.history)
    history = json.loads(path.read_text()) if path.exists() else {}
    doc, history = enrich_history(json.loads(Path(args.snapshot).read_text()), history, datetime.now(timezone.utc).isoformat())
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(history, ensure_ascii=False, indent=2) + "\n")
    Path(args.snapshot).write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
    print("history_entries", len(history))


if __name__ == "__main__":
    main()
