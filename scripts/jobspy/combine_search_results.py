"""Publish verified observations while preserving incomplete query statuses."""
import argparse
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

from linkedin_ids import linkedin_job_id


def combine(directory, scope):
    rows, statuses, per_company = {}, {}, {}
    query_started_at = {}
    for path in sorted(Path(directory).glob("*.json")):
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(doc, dict):
                raise ValueError("not a search report")
            items = doc.get("jobs", [])
            if not isinstance(items, list) or not isinstance(doc.get("statusSummary", {}), dict):
                raise ValueError("invalid search report")
            verified = []
            for item in items:
                if not isinstance(item, dict):
                    raise ValueError("invalid listing")
                key = linkedin_job_id(item.get("link"))
                host = urlsplit(str(item.get("link") or "")).hostname or ""
                source_id = linkedin_job_id(item.get("sourceJobId"))
                if not key or not (host == "linkedin.com" or host.endswith(".linkedin.com")) or (source_id and source_id != key) or not item.get("title") or not item.get("company"):
                    raise ValueError("unverified listing")
                verified.append((key, item))
            statuses.update(doc.get("statusSummary", {}))
            if 'queryStartedAt' in doc:
                starts = doc['queryStartedAt']
                query_started_at.update({key: starts.get(key) if isinstance(starts,dict) else None for key in doc.get('statusSummary', {})})
            per_company[path.name] = len(items)
            rows.update(verified)
        except (OSError, ValueError, TypeError, AttributeError):
            per_company[path.name] = "unreadable"
            statuses[path.stem] = "unreadable"
    doc = {"schemaVersion": "2.0", "mode": "full-company-snapshot", "scope": scope,
           "scopeLocations": ["CN", "HK", "SG"] if scope == "expanded" else ["CN"],
           "jobs": list(rows.values()), "statusSummary": statuses, "companies": dict(statuses)}
    if query_started_at:
        doc['queryStartedAt'] = query_started_at
    publishable = bool(rows) or any(str(value).startswith(("ok:", "empty")) for value in statuses.values())
    return doc, publishable, per_company


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--search-dir", required=True, type=Path)
    parser.add_argument("--scope", choices=("cn", "expanded"), required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    doc, publishable, counts = combine(args.search_dir, args.scope)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("per_company", json.dumps(counts, ensure_ascii=False))
    print("search_jobs", len(doc["jobs"]))
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as handle:
            handle.write(f"has_jobs={'true' if publishable else 'false'}\nsearch_jobs={len(doc['jobs'])}\n")


if __name__ == "__main__":
    main()
