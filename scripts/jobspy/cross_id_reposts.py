"""Link replacements across LinkedIn IDs after resolving per-ID liveness."""
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date

if __package__:
    from .linkedin_ids import linkedin_job_id
    from .posting_dates import posting_day
else:
    from linkedin_ids import linkedin_job_id
    from posting_dates import posting_day


def linkedin_id(row):
    return linkedin_job_id(row.get("sourceJobId")) or linkedin_job_id(row.get("link"))


def superseded_ids(doc):
    return set(doc.get("supersededLinkedInIds", ())) if isinstance(doc, dict) else set()


def name(value):
    return " ".join(unicodedata.normalize("NFKC", str(value or "")).casefold().split())


def role_key(row):
    company, title, region = (name(row.get(field)) for field in ("company", "title", "location"))
    if not company or not title:
        return None
    if region in {"hk", "sg"}:
        return company, title, region, region

    raw = name(row.get("locationRaw"))
    city = name(row.get("city")) or raw.split(",", 1)[0].strip()
    if (not city or city in {"n/a", "na", "unknown", "unspecified", "not specified", "china",
                            "mainland china", "中国", "中国大陆", "全国", "不限", "未注明", "remote"}
            or re.search(r"metropolitan|\bprovince\b|省|都市圈", city)):
        return None
    if region == "cn":
        return company, title, region, city
    if region == "other" and "," in raw:
        return company, title, region, (city, raw.rsplit(",", 1)[1].strip())
    return None


def link_repost(previous, previous_id, current, pending=False):
    lineage = previous.get("crossIdRepost", {})
    first = lineage.get("postDate") or posting_day(previous["firstSeen"]).isoformat()
    current["crossIdRepost"] = {
        "rootId": lineage.get("rootId", previous_id),
        "previousId": previous_id,
        "postDate": first,
        "pending": pending,
    }
    current["rolePostDate"] = first
    if pending:
        previous["rolePostDate"] = first


def reconcile(doc, observed_at=None):
    """Remove only a closed predecessor with a same-day or next-day closure.

    Keep a provisional link during the overlap window. Its independent dates
    remain available if the predecessor stays open past the following day.
    """
    rows = doc.get("jobs", [])
    removed = superseded_ids(doc)
    checked_day = doc.get("crossIdRepostCheckedDay")
    observed = [observed_at, checked_day, doc.get("jobStatusUpdatedAt"),
                (doc.get("n8nIncrementalMerge") or {}).get("mergedAt"),
                (doc.get("liveness") or {}).get("observedAt")]
    today = max((day.toordinal() for value in observed if (day := posting_day(value))), default=0)
    groups = defaultdict(list)
    for row in rows:
        if not isinstance(row, dict):
            continue
        prior = row.get("crossIdRepost")
        if prior and prior.get("pending"):
            row.pop("crossIdRepost")
            prior = None
        if prior:
            row["rolePostDate"] = prior["postDate"]
        else:
            row.pop("rolePostDate", None)
        key, job_id, started = role_key(row), linkedin_id(row), posting_day(row.get("firstSeen"))
        if key and job_id and job_id not in removed and started:
            groups[key].append((started.toordinal(), int(job_id), job_id, row))

    pending = False
    for group in groups.values():
        if len(group) < 2:
            continue
        counts = Counter(listing[2] for listing in group)
        group = [listing for listing in group if counts[listing[2]] == 1]
        # Calendar dates can tie. The ascending numeric LinkedIn ID supplies a
        # stable order for different IDs first seen on the same day.
        group.sort(key=lambda listing: listing[:2])
        closed = defaultdict(list)
        for position, (started, _, job_id, row) in enumerate(group):
            if not row.get("crossIdRepost"):
                prior_close = max((day for day in (started, started + 1) if closed[day]),
                                  key=lambda day: closed[day][-1], default=None)
                if prior_close is not None:
                    previous_id, previous = group[closed[prior_close].pop()][2:]
                    link_repost(previous, previous_id, row)
                    removed.add(previous_id)
            ended = posting_day(row.get("expiredAt"))
            if row.get("jobStatus") == "expired" and ended and ended.toordinal() >= started:
                closed[ended.toordinal()].append(position)

        previous_active = None
        for started, _, job_id, row in group:
            if job_id in removed or row.get("jobStatus") != "active":
                continue
            if previous_active and not row.get("crossIdRepost") and 0 <= today - started <= 1:
                link_repost(previous_active[1], previous_active[0], row, pending=True)
                previous_active = None
                pending = True
            else:
                previous_active = (job_id, row)

    if removed:
        retained = [row for row in rows if not isinstance(row, dict) or linkedin_id(row) not in removed]
        if len(retained) != len(rows):
            doc.update(jobs=retained, count=len(retained))
        doc["supersededLinkedInIds"] = sorted(removed)
    # A frozen RSS retry can carry an older processing date than the baseline.
    if today and (pending or checked_day):
        doc["crossIdRepostCheckedDay"] = date.fromordinal(today).isoformat()
