#!/usr/bin/env python3
"""Build lightweight browser payloads from canonical jobs.json."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from linkedin_ids import linkedin_job_id
from jev_preprocess import build_boilerplate_table, preprocess
from logo_sources import key as logo_key


def job_id(link: object) -> str:
    value = linkedin_job_id(link)
    return f"ln:{value}" if value else ""


def build(source: Path, index_out: Path, details_out: Path, boilerplate_out: Path | None = None) -> tuple[int, int]:
    doc = json.loads(source.read_text(encoding="utf-8"))
    rows = doc if isinstance(doc, list) else doc.get("jobs", [])
    index_rows = []
    details = {}
    source_pairs = [(str(job.get("company") or "Unknown"), str(job.get("descriptionText") or job.get("description") or job.get("descriptionHtml") or "")) for job in rows if isinstance(job, dict)]
    boilerplate = build_boilerplate_table(source_pairs)
    if boilerplate_out:
        boilerplate_out.parent.mkdir(parents=True, exist_ok=True)
        boilerplate_out.write_text(json.dumps({"schemaVersion": "1.0", "source": "jobs.json", "jevSchema": "jev-input-v4", "employers": boilerplate}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    index_fields = (
        "title", "company", "link", "location", "locationRaw", "city",
        "jobStatus", "pushTime", "firstSeen", "expiredAt", "expiredReason", "salary",
    )
    for job in rows:
        if not isinstance(job, dict):
            continue
        item = {key: job.get(key) for key in index_fields if key in job}
        key = job_id(job.get("link"))
        html = str(job.get("descriptionHtml") or "").strip()
        # JobSpy/n8n records frequently retain the JD in HTML while
        # descriptionText is empty. JEV must preprocess the actual JD rather
        # than classifying an empty string as insufficient evidence.
        stored_text = str(job.get("descriptionText") or job.get("description") or "").strip()
        text = stored_text or html
        item["hasJd"] = bool(html or stored_text)
        if item["hasJd"] and key:
            details[key] = {
                "descriptionHtml": html,
                # Keep the browser payload compact: descriptionHtml is already
                # the display source. HTML fallback is used for preprocessing
                # but is not duplicated into descriptionText.
                "descriptionText": stored_text,
                "jevInput": preprocess(
                    str(job.get("title") or ""),
                    str(job.get("company") or ""),
                    text,
                    {k: job.get(k) for k in ("business", "jobFamily", "entity", "group") if job.get(k)},
                    boilerplate=boilerplate,
                ),
            }
            if str(job.get("jdDiffHtml") or "").strip():
                details[key].update({
                    "jdDiffHtml": str(job["jdDiffHtml"]),
                    "jdChangeStatus": job.get("jdChangeStatus") or "changed",
                    "jdChangedAt": job.get("jdChangedAt") or "",
                    "jdDiffPreviousText": job.get("jdDiffPreviousText") or "",
                    "jdDiffCurrentText": job.get("jdDiffCurrentText") or "",
                })
        index_rows.append(item)

    logo_path=source.parent/'company-logos.json'
    logos={};fallback=''
    if logo_path.is_file():
        catalog=json.loads(logo_path.read_text(encoding='utf-8'))
        companies={logo_key(row.get('company')) for row in rows if isinstance(row,dict)}
        if isinstance(catalog,dict):
            logos={name:path for name,path in catalog.items() if name in companies and isinstance(path,str) and re.fullmatch(r'assets/company-logos/[a-f0-9]{24}\.(webp|svg)',path)}
        state_path=source.parent/'data/company-logos/state.json'
        if state_path.is_file():
            state=json.loads(state_path.read_text(encoding='utf-8'))
            if isinstance(state,dict):
                fallback=next((logos[name] for name,entry in state.items() if name in logos and entry.get('status')=='ready' and entry.get('imageKind')=='placeholder'),'')
    index_doc = {"schemaVersion": "1.1", "source": "jobs.json", "jobs": index_rows,"companyLogos":logos,"companyLogoFallback":fallback}
    details_doc = {"schemaVersion": "1.1", "source": "jobs.json", "details": details}
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
            {"link": "https://x/jobs/view/123457/", "title": "B", "firstSeen": "2026-09-01", "expiredAt": "2026-09-11", "expiredReason": "linkedin_closed", "jobStatus": "expired"},
        ]}), encoding="utf-8")
        index, details = root / "jobs-index.json", root / "jobs-details.json"
        assert build(source, index, details) == (2, 1)
        index_doc = json.loads(index.read_text(encoding="utf-8"))
        detail_doc = json.loads(details.read_text(encoding="utf-8"))
        assert index_doc["jobs"][0]["hasJd"] is True
        for key in ("firstSeen", "expiredAt", "expiredReason", "jobStatus"):
            assert index_doc["jobs"][1][key] == json.loads(source.read_text())["jobs"][1][key]
        assert "descriptionHtml" not in index_doc["jobs"][0]
        assert detail_doc["details"]["ln:123456"]["descriptionHtml"] == "<p>JD</p>"
        assert detail_doc["details"]["ln:123456"]["jevInput"]["schema"] == "jev-input-v4"
        slug = "https://hk.linkedin.com/jobs/view/title-210740045-at-company-4468639951"
        assert job_id(slug) == "ln:4468639951"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=Path("jobs.json"))
    parser.add_argument("--index", type=Path, default=Path("jobs-index.json"))
    parser.add_argument("--details", type=Path, default=Path("jobs-details.json"))
    parser.add_argument("--boilerplate", type=Path, default=Path("data/jev-boilerplate.json"))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        print("frontend_payload_test_ok")
        return
    count, detail_count = build(args.source, args.index, args.details, args.boilerplate)
    print("frontend_index_jobs", count, "frontend_details", detail_count,
          "index_bytes", args.index.stat().st_size, "details_bytes", args.details.stat().st_size)


if __name__ == "__main__":
    main()

__all__ = ["build", "job_id", "self_test"]
