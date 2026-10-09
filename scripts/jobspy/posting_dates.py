"""One monotonic posting-date policy for search snapshots and liveness probes."""
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

LOCAL_TZ = ZoneInfo("Asia/Shanghai")  # CN, HK and SG share UTC+08:00.


def posting_day(value):
    try:
        text = str(value or "").strip()
        if len(text) == 10:
            return date.fromisoformat(text)
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).astimezone(LOCAL_TZ).date()
    except (ValueError, TypeError):
        return None


def last_posted(row):
    # Dedicated source watermarks win over dates refreshed by an RSS batch.
    dates = [posting_day(row.get(k)) for k in ("postingLastDate", "jobspyLastPosted")]
    known = [d for d in dates if d]
    return max(known) if known else posting_day(row.get("datePosted")) or posting_day(row.get("firstSeen"))


def is_repost(row, value, observed_at):
    posted, observed, previous = posting_day(value), posting_day(observed_at), last_posted(row)
    return bool(posted and observed and previous and previous < posted <= observed)


def apply_posting_date(row, value, observed_at, source):
    posted, observed, previous = posting_day(value), posting_day(observed_at), last_posted(row)
    if not posted or not observed or posted > observed:
        return False
    changed = bool(previous and posted > previous)
    # Never regress either the source watermark or the site's discovery date.
    if previous is None or posted >= previous:
        row["postingLastDate"] = posted.isoformat()
        row["postingDateSource"] = source
        row["postingDateObservedAt"] = observed_at
    pushed = posting_day(row.get("pushTime"))
    if changed and (pushed is None or posted > pushed):
        row["pushTime"] = posted.isoformat()
        row["lastRepostedAt"] = posted.isoformat()
        return True
    return False
