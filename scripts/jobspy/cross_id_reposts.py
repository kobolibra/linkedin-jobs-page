"""Link replacements across LinkedIn IDs after resolving per-ID liveness."""
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from itertools import groupby

if __package__:
    from .company_identity import normalize_company
    from .linkedin_ids import linkedin_job_id
    from .posting_dates import posting_day
else:
    from company_identity import normalize_company
    from linkedin_ids import linkedin_job_id
    from posting_dates import posting_day


def linkedin_id(row):
    return linkedin_job_id(row.get("sourceJobId")) or linkedin_job_id(row.get("link"))


def superseded_ids(doc):
    return set(doc.get("supersededLinkedInIds", ())) if isinstance(doc, dict) else set()


def name(value):
    return " ".join(unicodedata.normalize("NFKC", str(value or "")).casefold().split())


def role_key(row):
    company = normalize_company(row.get("companyCanonical") or row.get("company"))
    title, region = (name(row.get(field)) for field in ("title", "location"))
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
    current_lineage = current.get("crossIdRepost", {})
    first = lineage.get("postDate") or posting_day(previous["firstSeen"]).isoformat()
    current["crossIdRepost"] = {
        "rootId": lineage.get("rootId", previous_id),
        "previousId": current_lineage.get("previousId", previous_id),
        "postDate": first,
        "pending": pending,
    }
    current["rolePostDate"] = first
    if pending:
        previous["rolePostDate"] = first


def arrival_order(group):
    group.sort(key=lambda listing: listing[:2])
    for _, listings in groupby(group, key=lambda listing: listing[0]):
        same_day = list(listings)
        times = [str(listing[3]["firstSeen"]).strip() for listing in same_day]
        if len(same_day) > 1 and all(len(value) > 10 for value in times):
            instants = [datetime.fromisoformat(value.replace("Z", "+00:00")) for value in times]
            instants = [value if value.tzinfo else value.replace(tzinfo=timezone.utc) for value in instants]
            yield from (listing for _, listing in sorted(zip(instants, same_day), key=lambda pair: pair[0]))
        else:
            yield from same_day


def closing_day(row, started):
    ended = posting_day(row.get("expiredAt"))
    if row.get("jobStatus") == "expired" and ended and ended.toordinal() >= started:
        return ended.toordinal()
    return None


def connect_surviving_cycles(group, removed):
    # Traverse the surviving recruitment cycles by their original start dates.
    # A latest ID may already represent a cycle that began several IDs earlier.
    positions = {job_id: position for position, (_, _, job_id, _) in enumerate(group)}
    cycles = []
    for started, number, job_id, row in group:
        if job_id in removed:
            continue
        lineage = row.get("crossIdRepost", {})
        cycle_start = posting_day(lineage["postDate"]).toordinal() if lineage else started
        root = int(lineage["rootId"]) if lineage else number
        cycles.append((cycle_start, root, started, job_id, row))
    cycles.sort(key=lambda cycle: cycle[:2])

    closed = defaultdict(list)
    for cycle_start, root, started, job_id, row in cycles:
        root_position = positions.get(str(root))

        def precedes_root(candidate):
            if root_position is not None:
                return positions[candidate[2]] < root_position
            return candidate[:2] < (cycle_start, root)

        # A retained cycle can inherit an older one in any of the three
        # allowed day positions. Compare to the newer cycle's original ID.
        for days in ((cycle_start, cycle_start + 1), (cycle_start - 1,)):
            eligible = ((positions[candidate[2]], day, candidate) for day in days
                        for candidate in closed[day] if precedes_root(candidate))
            choice = max(eligible, default=None)
            if choice is None:
                continue
            _, day, candidate = choice
            closed[day].remove(candidate)
            _, _, previous_id, previous = candidate
            link_repost(previous, previous_id, row)
            removed.add(previous_id)
            break

        if ended := closing_day(row, started):
            closed[ended].append((started, int(job_id), job_id, row))


def reconcile(doc, observed_at=None):
    """Link a closed predecessor within one local calendar day of a repost.

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
        # Sort same-day arrivals by their recorded times when available. The
        # LinkedIn ID supplies a stable tie-break for date-only observations.
        group = list(arrival_order([listing for listing in group if counts[listing[2]] == 1]))
        closed = defaultdict(list)
        for position, (started, _, job_id, row) in enumerate(group):
            if not row.get("crossIdRepost"):
                prior_close = max((day for day in (started, started + 1) if closed[day]),
                                  key=lambda day: closed[day][-1], default=None)
                if prior_close is not None:
                    previous_id, previous = group[closed[prior_close].pop()][2:]
                    link_repost(previous, previous_id, row)
                    removed.add(previous_id)
            if ended := closing_day(row, started):
                closed[ended].append(position)

        # Revisit retained cycles using their original dates, including the
        # case where the next ID appeared a day after a predecessor closed.
        connect_surviving_cycles(group, removed)

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
