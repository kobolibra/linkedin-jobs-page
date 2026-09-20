#!/usr/bin/env python3
"""Build lightweight browser payloads from canonical jobs.json."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def job_id(link: object) -> str:
    if not link:
        return ""
    text = str(link)
    path = text.split("?", 1)[0].split("#", 1)[0]
    match = re.search(r"(\d{5,})/?$", path) or re.search(r"[?&]currentJobId=(\d+)", text)
    return f"ln:{match.group(1)}" if match else path.rstrip("/")


def build(source: Path, index_out: Path, details_out: Path) -> tuple[int, int]:
    doc = json.loads(source.read_text(encoding="utf-8"))
    rows = doc if isinstance(doc, list) else doc.get("jobs", [])
    index_rows = []
    details = {}
    index_fields = (
        "title", "company", "link", "location", "locationRaw", "city",
        "jobStatus", "pushTime", "firstSeen", "expiredAt", "salary",
    )
    for job in rows:
        if not isinstance(job, dict):
            continue
        item = {key: job.get(key) for key in index_fields if key in job}
        key = job_id(job.get("link"))
        html = str(job.get("descriptionHtml") or "").strip()
        text = str(job.get("descriptionText") or job.get("description") or "").strip()
        item["hasJd"] = bool(html or text)
        if item["hasJd"] and key:
            details[key] = {"descriptionHtml": html, "descriptionText": text}
        index_rows.append(item)

    index_doc = {"schemaVersion": "1.0", "source": "jobs.json", "jobs": index_rows}
    details_doc = {"schemaVersion": "1.0", "source": "jobs.json", "details": details}
    index_out.write_text(json.dumps(index_doc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    details_out.write_text(json.dumps(details_doc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return len(index_rows), len(details)


def self_test() -> None:
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        source = root / "jobs.json"
        source.write_text(json.dumps({"jobs": [
            {"link": "https://x/jobs/view/123456/", "title": "A", "descriptionHtml": "<p>JD</p>", "salary": "10k"},
            {"link": "https://x/jobs/view/123457/", "title": "B"},
        ]}), encoding="utf-8")
        index, details = root / "jobs-index.json", root / "jobs-details.json"
        assert build(source, index, details) == (2, 1)
        index_doc = json.loads(index.read_text(encoding="utf-8"))
        detail_doc = json.loads(details.read_text(encoding="utf-8"))
        assert index_doc["jobs"][0]["hasJd"] is True
        assert "descriptionHtml" not in index_doc["jobs"][0]
        assert detail_doc["details"]["ln:123456"]["descriptionHtml"] == "<p>JD</p>"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=Path("jobs.json"))
    parser.add_argument("--index", type=Path, default=Path("jobs-index.json"))
    parser.add_argument("--details", type=Path, default=Path("jobs-details.json"))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        print("frontend_payload_test_ok")
        return
    count, detail_count = build(args.source, args.index, args.details)
    print("frontend_index_jobs", count, "frontend_details", detail_count,
          "index_bytes", args.index.stat().st_size, "details_bytes", args.details.stat().st_size)


if __name__ == "__main__":
    main()

__all__ = ["build", "job_id", "self_test"]
