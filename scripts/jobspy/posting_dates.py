"""One monotonic posting-date policy for search snapshots and liveness probes."""
import re
from datetime import date, datetime, timedelta, timezone
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


def linkedin_card_date(raw_datetime, relative_text, observed_at):
    """Resolve one LinkedIn search card to the CN/HK/SG calendar day.

    Zoned timestamps are exact. Date-only cards use a conservative rounded-age
    interval only when its full range proves one local day. No extra HTTP calls.
    The original date is retained if the available evidence is insufficient.
    """
    raw = str(raw_datetime or "").strip()
    relative = " ".join(str(relative_text or "").split()).casefold()
    original = None
    try:
        original = date.fromisoformat(raw[:10])
    except ValueError:
        pass
    if len(raw) > 10:
        try:
            stamp = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            if stamp.tzinfo is not None:
                return stamp.astimezone(LOCAL_TZ).date().isoformat(), "zoned-timestamp"
        except ValueError:
            pass
    match = re.fullmatch(r"(?:posted |reposted )?(\d+)\s+(minute|hour)s?\s+ago", relative)
    if match:
        try:
            observed = datetime.fromisoformat(str(observed_at).replace("Z", "+00:00"))
            if observed.tzinfo is not None:
                unit = 60 if match.group(2) == "minute" else 3600
                age = int(match.group(1))
                # Allow one whole displayed unit of uncertainty on BOTH sides.
                # If midnight falls anywhere in the interval, keep source date.
                earliest = (observed - timedelta(seconds=(age + 1) * unit)).astimezone(LOCAL_TZ).date()
                latest = (observed - timedelta(seconds=max(0, age - 1) * unit)).astimezone(LOCAL_TZ).date()
                if earliest == latest and (original is None or 0 <= (earliest - original).days <= 1):
                    return earliest.isoformat(), "relative-local-day"
        except (ValueError, OverflowError):
            pass
    return (original.isoformat(), "source-date-only") if original else ("", "unknown")


def raw_source_day(value):
    """The source calendar date, *not* the normalized Beijing posting day."""
    try:
        return date.fromisoformat(str(value or "").strip()[:10])
    except ValueError:
        return None


def _zoned_instant(value):
    try:
        stamp = datetime.fromisoformat(str(value or "").strip().replace("Z", "+00:00"))
        return stamp.astimezone(timezone.utc) if stamp.tzinfo else None
    except ValueError:
        return None


def source_date_unchanged(previous, raw_datetime):
    """Ignore timezone-only day changes, not an actual newer exact timestamp.

    Legacy rows have no linkedinPostedRaw; use their known source calendar
    dates before falling back to firstSeen. Never rewrite legacy posting days.
    """
    previous_raw = previous.get("linkedinPostedRaw")
    current_time, previous_time = _zoned_instant(raw_datetime), _zoned_instant(previous_raw)
    if current_time and previous_time:
        return current_time <= previous_time
    incoming = raw_source_day(raw_datetime)
    prior = (raw_source_day(previous_raw)
             or raw_source_day(previous.get("datePosted"))
             or raw_source_day(previous.get("jobspyLastPosted"))
             or raw_source_day(previous.get("postingLastDate"))
             or raw_source_day(previous.get("firstSeen")))
    return bool(incoming and prior and incoming <= prior)


def last_posted(row):
    # Dedicated source watermarks win over dates refreshed by an RSS batch.
    dates = [posting_day(row.get(k)) for k in ("postingLastDate", "jobspyLastPosted")]
    known = [d for d in dates if d]
    return max(known) if known else posting_day(row.get("datePosted")) or posting_day(row.get("firstSeen"))


def is_repost(row, value, observed_at, *, source_raw=None):
    if source_raw and source_date_unchanged(row, source_raw):
        return False
    posted, observed, previous = posting_day(value), posting_day(observed_at), last_posted(row)
    return bool(posted and observed and previous and previous < posted <= observed)


def apply_posting_date(row, value, observed_at, source, *, source_raw=None):
    if source_raw and source_date_unchanged(row, source_raw):
        return False
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
