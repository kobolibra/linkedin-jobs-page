"""Finalize verified company reports locally and on GitHub.

Usage: python reclassify.py --date YYYY-MM-DD --finalize --blacklist COMPANY
       --industry '{"Verified company": "Industry"}'
"""
import argparse
import base64
import json
import os
import ssl
import tempfile
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

BEIJING = timezone(timedelta(hours=8))
REASON = "verified financial/headhunter (reclassified)"
TARGET = "reports/cumulative-target-companies.tsv"
EXCLUDED = "reports/cumulative-excluded-companies.tsv"
BLACKLIST = "financial_blacklist.json"
INDUSTRIES = "company_industries.json"
PENDING = "待查证"
EMPLOYER_TYPES = {"direct_employer", "recruitment_agency", "recruitment_platform", "mixed", "unknown"}


def norm(name):
    return " ".join(unicodedata.normalize("NFKC", name).casefold().split())


def field(value):
    if not isinstance(value, str) or not value.strip() or any(c in value for c in "\r\n\t"):
        raise ValueError(f"Invalid report field: {value!r}")
    return value.strip()


def json_text(value):
    return json.dumps(value, ensure_ascii=False, indent=2)


def daily_paths(day):
    date.fromisoformat(day)
    return tuple(f"reports/today-{kind}-{day}.{ext}" for kind, ext in
                 (("companies", "json"), ("target-companies", "tsv"), ("excluded-companies", "tsv")))


def tsv(rows):
    return "".join("\t".join(row) + "\n" for row in rows)


def daily_files(day, report):
    paths = daily_paths(day)
    result = {paths[0]: json_text(report)}
    for path, key, label in zip(paths[1:], ("target_companies", "excluded_companies"), ("备注", "排除原因")):
        rows = [["序号", "公司名", label]]
        rows.extend([str(i), field(row["company"]), field(row["reason"])] for i, row in enumerate(report[key], 1))
        result[path] = tsv(rows)
    return result


def blacklist_records(values, *, allow_legacy=True):
    """Read legacy names or typed records without changing original spellings."""
    if not isinstance(values, list):
        raise ValueError("Financial blacklist must be an array")
    if allow_legacy and all(isinstance(value, str) for value in values):
        values = [{"company": name, "employerType": "unknown"} for name in values]
    types_by_name = {}
    for record in values:
        if not isinstance(record, dict):
            raise ValueError("Financial blacklist must contain only company records")
        name = field(record.get("company"))
        kind = record.get("employerType")
        if not isinstance(kind, str) or kind not in EMPLOYER_TYPES:
            raise ValueError(f"Invalid employerType for {name}")
        evidence = record.get("evidence")
        if evidence is not None:
            if not isinstance(evidence, dict):
                raise ValueError(f"Invalid evidence for {name}")
            url = field(evidence.get("url"))
            link = urllib.parse.urlsplit(url)
            if link.scheme != "https" or not link.hostname:
                raise ValueError(f"Evidence must be an HTTPS source for {name}")
            date.fromisoformat(field(evidence.get("reviewedOn")))
            field(evidence.get("note"))
        elif kind != "unknown":
            raise ValueError(f"Missing evidence for {name}")
        review = record.get("review")
        if review is not None:
            if kind != "unknown" or not isinstance(review, dict):
                raise ValueError(f"Invalid inconclusive review for {name}")
            date.fromisoformat(field(review.get("reviewedOn")))
            field(review.get("query"))
            field(review.get("note"))
        if types_by_name.setdefault(norm(name), kind) != kind:
            raise ValueError(f"Conflicting employerType for {name}")
    return values


def validate_blacklist_transition(previous, proposed):
    """Fail closed on accidental loss or downgrade of protected classifications."""
    old = blacklist_records(previous, allow_legacy=False)
    new = blacklist_records(proposed, allow_legacy=False)
    names = {record["company"]: record for record in new}
    if not names or len(names) != len(new):
        raise ValueError("Empty blacklist or duplicate original names")
    missing = sorted(set(record["company"] for record in old) - names.keys())
    if missing:
        raise ValueError(f"Protected company records removed: {missing[:10]} ({len(missing)} total)")
    for record in old:
        updated = names[record["company"]]
        if record["employerType"] not in {"unknown", "mixed"} and updated["employerType"] in {"unknown", "mixed"}:
            raise ValueError(f"Confirmed employer classification downgraded: {record['company']}")
        if record.get("evidence") and not updated.get("evidence"):
            raise ValueError(f"Employer evidence removed: {record['company']}")
    return new


def blacklist_text(records):
    rows = ",\n".join(f"  {json.dumps(record, ensure_ascii=False)}" for record in records)
    return f"[\n{rows}\n]\n" if rows else "[]\n"


def protected_names(records):
    return {norm(record["company"]) for record in records}


def classifications(read):
    records = blacklist_records(json.loads(read(BLACKLIST)))
    industries = json.loads(read(INDUSTRIES))
    if not isinstance(industries, dict):
        raise ValueError("Invalid company industries file")
    for name, reason in industries.items():
        field(name)
        field(reason)
    return records, industries


def classify(report, blacklist, industries):
    """Resolve known financial firms first. Keep unresolved candidates in the daily report."""
    excluded = {}
    targets = {}
    for row in report["excluded_companies"]:
        excluded[norm(field(row["company"]))] = row
    for row in report["target_companies"]:
        key = norm(field(row["company"]))
        if key in blacklist:
            excluded.setdefault(key, dict(row, category="excluded", reason=REASON))
        elif key in excluded:
            raise ValueError(f"Conflicting target/excluded classifications for {row['company']}")
        else:
            reason = industries.get(key) or row.get("reason") or PENDING
            if reason == PENDING and key in targets:
                reason = targets[key]["reason"]
            targets[key] = dict(row, reason=reason)
    return dict(report, target_companies=list(targets.values()), excluded_companies=list(excluded.values()),
                total_target=len(targets), total_excluded=len(excluded))


def read_ledger(text, label):
    rows = {}
    header = ["公司名", label, "首次出现", "最近出现"]
    if text is None:
        return rows
    lines = text.splitlines()
    if not lines or lines[0].split("\t") != header:
        raise ValueError(f"Invalid {label} ledger header")
    for line in lines[1:]:
        name, reason, first, last = line.split("\t")
        key = norm(field(name))
        if key in rows or date.fromisoformat(first) > date.fromisoformat(last):
            raise ValueError(f"Invalid history for {name}")
        rows[key] = [name, reason, first, last]
    return rows


def upsert(rows, name, reason, first, last):
    key = norm(field(name))
    old = rows.get(key)
    rows[key] = [old[0] if old else name, field(reason),
                 min(old[2], first) if old else first, max(old[3], last) if old else last]


def verified_industries(industries):
    return {norm(k): v.strip() for k, v in industries.items() if v.strip() != PENDING}


def plan(read, day, additions=(), industries=None, finalize=False, require_daily=False, *,
         typed_additions=()):
    records, known = classifications(read)
    blocked = protected_names(records)
    changes = {}
    added = False
    candidates = blacklist_records(list(typed_additions), allow_legacy=False)
    candidates += blacklist_records(list(additions))
    for record in candidates:
        key = norm(record["company"])
        if key not in blocked:
            records.append(record)
            blocked.add(key)
            added = True
        elif record["employerType"] != "unknown" and any(
            norm(old["company"]) == key and old["employerType"] != record["employerType"] for old in records
        ):
            raise ValueError(f"Use a reviewed data change to update {record['company']}")
    if added:
        changes[BLACKLIST] = blacklist_text(sorted(records, key=lambda record: record["company"]))
    spelling = {norm(k): k for k in known}
    for name, reason in (industries or {}).items():
        key = norm(field(name))
        reason = field(reason)
        if reason == PENDING:
            raise ValueError("A verified industry cannot be 待查证")
        original = spelling.setdefault(key, name)
        if known.get(original) != reason:
            known[original] = reason
            changes[INDUSTRIES] = json_text(known)
    verified = verified_industries(known)
    targets = read_ledger(read(TARGET), "备注")
    excluded = read_ledger(read(EXCLUDED), "排除原因")
    for key, (name, reason, first, last) in list(targets.items()):
        if key in blocked:
            upsert(excluded, name, REASON, first, last)
            del targets[key]
        elif key in excluded:
            raise ValueError(f"Conflicting cumulative classifications for {name}")
        elif key in verified:
            targets[key][1] = verified[key]
        elif not reason.strip() or reason.strip() == PENDING or reason.startswith("crypto/blockchain (always included)"):
            del targets[key]

    path = daily_paths(day)[0]
    body = read(path)
    if body is None and require_daily:
        raise FileNotFoundError(path)
    if body is not None:
        report = classify(json.loads(body), blocked, verified)
        changes.update(daily_files(day, report))
        if finalize:
            for row in report["target_companies"]:
                name = row["company"]
                key = norm(name)
                if key in excluded:
                    raise ValueError(f"Target already excluded: {name}")
                if key in verified:
                    upsert(targets, name, verified[key], day, day)
                else:
                    print(f"Pending verification: {name}")
            for row in report["excluded_companies"]:
                name = row["company"]
                if norm(name) in targets:
                    raise ValueError(f"Excluded company already targeted: {name}")
                upsert(excluded, name, row["reason"], day, day)
    for path, label, ledger in ((TARGET, "备注", targets), (EXCLUDED, "排除原因", excluded)):
        changes[path] = tsv([["公司名", label, "首次出现", "最近出现"], *ledger.values()])
    return changes


class Repo:
    """Read a single commit. Publish one fast-forward, recomputing on concurrent writes."""
    def __init__(self, token, repo, branch, opener):
        self.token = token
        self.url = f"https://api.github.com/repos/{repo}"
        self.branch = urllib.parse.quote(branch, safe="/")
        self.opener = opener

    def api(self, path, body=None, method=None):
        req = urllib.request.Request(self.url + path, method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={"Authorization": f"Bearer {self.token}", "Accept": "application/vnd.github+json",
                     "Content-Type": "application/json"})
        with self.opener.open(req, timeout=60) as response:
            return json.load(response)

    def transact(self, build, message, dry=False):
        for attempt in range(5):
            head = self.api(f"/git/ref/heads/{self.branch}")["object"]["sha"]
            cache = {}
            def read(path):
                if path not in cache:
                    try:
                        entry = self.api(f"/contents/{urllib.parse.quote(path)}?ref={head}")
                    except urllib.error.HTTPError as error:
                        if error.code != 404:
                            raise
                        cache[path] = None
                    else:
                        if entry.get("encoding") != "base64":
                            raise ValueError(f"Unexpected contents response for {path}")
                        cache[path] = base64.b64decode(entry["content"]).decode()
                return cache[path]
            files = build(read)
            if BLACKLIST in files:
                before = json.loads(read(BLACKLIST))
                after = json.loads(files[BLACKLIST])
                # Keep historical migration fixtures readable; never downgrade an existing typed source.
                if any(isinstance(record, dict) for record in before):
                    validate_blacklist_transition(before, after)
            changed = [p for p, content in files.items() if content != read(p)]
            if dry or not changed:
                print(f"{'Dry run' if dry else 'No changes'}: {changed}")
                return files
            tree = self.api(f"/git/commits/{head}")["tree"]["sha"]
            new_tree = self.api("/git/trees", {"base_tree": tree, "tree": [
                {"path": p, "type": "blob", "mode": "100644", "content": files[p]} for p in changed]})
            commit = self.api("/git/commits", {"message": message, "parents": [head], "tree": new_tree["sha"]})
            try:
                self.api(f"/git/refs/heads/{self.branch}", {"force": False, "sha": commit["sha"]}, "PATCH")
            except urllib.error.HTTPError as error:
                if error.code not in (409, 422) or attempt == 4:
                    raise
                if self.api(f"/git/ref/heads/{self.branch}")["object"]["sha"] == head:
                    raise
                time.sleep(attempt + 1)
                continue
            print(f"Published {len(changed)} files at {commit['sha']}")
            return files


def mirror(files, day, root):
    for path in daily_paths(day):
        if path not in files:
            continue
        dest = Path(root) / Path(path).name
        body = files[path]
        if dest.exists() and dest.read_text(encoding="utf-8-sig") == body:
            continue
        encoding = "utf-8-sig" if dest.suffix == ".tsv" else "utf-8"
        with tempfile.NamedTemporaryFile(mode="w", encoding=encoding, dir=dest.parent, delete=False) as tmp:
            tmp.write(body)
        os.replace(tmp.name, dest)


def main():
    ap = argparse.ArgumentParser(allow_abbrev=False)
    ap.add_argument("--blacklist", nargs="*", default=[])
    ap.add_argument("--blacklist-records", default="[]", help="JSON array of typed company records")
    ap.add_argument("--industry", default="{}")
    ap.add_argument("--date", default=datetime.now(BEIJING).date().isoformat())
    ap.add_argument("--local-root", default=os.environ.get("NEXT_JOURNEY_OUTPUT_DIR", "/workspace"))
    ap.add_argument("--finalize", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    industries = json.loads(args.industry)
    typed_additions = blacklist_records(json.loads(args.blacklist_records), allow_legacy=False)
    if not (args.blacklist or typed_additions or industries or args.finalize):
        return
    config_path = Path(os.environ.get("NEXT_JOURNEY_CONFIG", "/workspace/config.json"))
    try:
        cfg = json.loads(config_path.read_text())
    except FileNotFoundError:
        cfg = {"repo": "kobolibra/linkedin-jobs-page", "branch": "main"}
    cfg["github_token"] = cfg.get("github_token") or os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not cfg["github_token"]:
        raise ValueError("Missing GitHub credential")
    handlers = [urllib.request.HTTPSHandler(context=ssl.create_default_context())]
    if cfg.get("proxy"):
        handlers.append(urllib.request.ProxyHandler(dict.fromkeys(("http", "https"), cfg["proxy"])))
    repo = Repo(cfg["github_token"], cfg["repo"], cfg["branch"], urllib.request.build_opener(*handlers))
    files = repo.transact(lambda read: plan(read, args.date, args.blacklist, industries, args.finalize,
                                          require_daily=args.finalize, typed_additions=typed_additions),
                          f"Verify company classifications for {args.date}", args.dry_run)
    if not args.dry_run:
        mirror(files, args.date, args.local_root)


if __name__ == "__main__":
    main()
