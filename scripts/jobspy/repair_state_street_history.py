"""One-time authoritative State Street replacement; regular JobSpy is untouched."""
import argparse
import json
from datetime import date, datetime, timezone
from pathlib import Path
from linkedin_ids import linkedin_job_id

EXPECTED = {"CN": 116, "HK": 9, "SG": 17}
JD_KEYS = {
    "description", "descriptionText", "descriptionHtml", "hasJd",
    "detailStatus", "detailError", "detailRetryable", "detailRetryAt",
    "detailFetchedAt", "detailAttempts", "detailEndpoint", "jdCheckedAt",
    "jdChangeStatus", "jdChangedAt", "jdDiffHtml", "jdDiffPreviousText",
    "jdDiffCurrentText",
}


def is_state(row):
    return any("state street" in str(row.get(k) or "").casefold()
               for k in ("company", "companyCanonical", "requestedCompany"))


def job_id(row):
    return linkedin_job_id(row.get("sourceJobId") or row.get("link"))


def authoritative_rows(checkpoint, expected=EXPECTED):
    incoming = checkpoint.get("jobs")
    if not isinstance(incoming, list):
        raise ValueError("Missing State Street checkpoint jobs")
    counts = {region: 0 for region in expected}
    seen, result = set(), []
    for source in incoming:
        region = str(source.get("location") or "").upper()
        key = job_id(source)
        if (region not in counts or source.get("requestedCompany") != "State Street"
                or not is_state(source) or not key or key in seen):
            raise ValueError("Wrong company, region, or duplicate historical ID")
        seen.add(key)
        posted = str(source.get("datePosted") or "")
        if len(posted) != 10 or date.fromisoformat(posted).isoformat() != posted:
            raise ValueError("Missing verified datePosted for " + key)
        if region == "CN" and (source.get("detailStatus") != "ok"
                              or not (source.get("descriptionHtml") or source.get("descriptionText"))):
            raise ValueError("Missing verified CN JD for " + key)
        row = dict(source)
        if region != "CN":
            for field in list(row):
                if field in JD_KEYS or field.startswith(("detail", "jdDiff", "jdChange")):
                    row.pop(field, None)
            row["city"] = ""
        row["sourceJobId"] = "li-" + key
        row["jobStatus"] = "active"
        row["firstSeen"] = posted
        row["pushTime"] = posted
        row["postingLastDate"] = posted
        row["postingDateSource"] = "state-street-historical-linkedin"
        row["dataSources"] = list(dict.fromkeys(list(row.get("dataSources") or []) + ["jobspy"]))
        result.append(row)
        counts[region] += 1
    if counts != expected:
        raise ValueError("Wrong State Street region counts: " + str(counts))
    return result


def replace(doc, rows):
    if not isinstance(doc, dict) or not isinstance(doc.get("jobs"), list):
        raise ValueError("Invalid target jobs document")
    old = [r for r in doc["jobs"] if is_state(r)]
    untouched = [r for r in doc["jobs"] if not is_state(r)]
    if {job_id(r) for r in rows} & {job_id(r) for r in untouched}:
        raise ValueError("State Street job ID conflicts with another employer")
    before = {job_id(r) for r in old}
    now = {job_id(r) for r in rows}
    result = {**doc, "jobs": untouched + [dict(r) for r in rows]}
    result["count"] = len(result["jobs"])
    return result, {
        "oldStateStreet": len(old), "authoritativeStateStreet": len(rows),
        "removedObsoleteStateStreet": len(before - now),
        "replacedExistingStateStreet": len(before & now),
        "newStateStreet": len(now - before),
        "untouchedOtherEmployers": len(untouched),
    }


def save(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", default="data/jobspy/backfill/state-street-live-jd-checkpoint.json")
    parser.add_argument("--jobs", default="jobs.json")
    parser.add_argument("--baseline", default="data/jobspy/jobspy_baseline_final_unified.json")
    args = parser.parse_args()
    checkpoint = json.loads(Path(args.checkpoint).read_text(encoding="utf-8"))
    canonical = json.loads(Path(args.jobs).read_text(encoding="utf-8"))
    baseline = json.loads(Path(args.baseline).read_text(encoding="utf-8"))
    rows = authoritative_rows(checkpoint)
    canonical, summary = replace(canonical, rows)
    baseline, _ = replace(baseline, rows)
    if sum(is_state(row) for row in canonical["jobs"]) != 142:
        raise ValueError("Unexpected canonical State Street total")
    now = datetime.now(timezone.utc).isoformat()
    summary.update(regions=EXPECTED, cnJds=116, hkSgJds=0,
                   datePolicy="pushTime = datePosted for all 142 historical rows", updatedAt=now)
    init = {"status": "complete", "publishedAt": now, "jobs": 142, "regions": EXPECTED,
            "cnJdVerified": True, "jdPolicy": "CN-only; HK and SG listing/lifecycle only",
            "source": "state-street-historical-backfill"}
    progress = {
        "status": "COMPLETE; published canonical jobs", "updatedAt": now,
        "company": "State Street", "companyIds": ["1767", "1089754"],
        "regions": EXPECTED, "jobs": 142, "jdOk": 116, "jdTotal": 116,
        "jdNotApplicable": 26, "jdPolicy": init["jdPolicy"],
        "searchCheckpoint": "data/jobspy/backfill/state-street-live-search-checkpoint.json",
        "jdCheckpoint": args.checkpoint,
    }
    save(args.jobs, canonical)
    save(args.baseline, baseline)
    save("data/jobspy/state_street_f_c_1767_final.json", {
        "schemaVersion": "1.2", "mode": "historical-backfill", "country": "Multi-region",
        "company": "State Street", "companyId": "1767,1089754", "count": 142, "jobs": rows})
    save(args.checkpoint, {**checkpoint, "jobs": rows, "count": 142})
    save("data/jobspy/backfill/state-street-initialized.json", init)
    save("docs/state-street-backfill-progress.json", progress)
    save("docs/state-street-cn-only-repair.json", summary)
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
