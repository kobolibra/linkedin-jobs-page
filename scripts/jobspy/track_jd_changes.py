#!/usr/bin/env python3
"""Compare newly fetched repost JDs with the canonical JD and emit tracked changes.

The snapshot still carries the newest JD as descriptionHtml/descriptionText.  When a
repost changed an existing JD, this script adds jdDiffHtml so the frontend can show
insertions and deletions without changing the canonical lifecycle timestamps.
"""
from __future__ import annotations

import argparse
import difflib
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from bs4 import BeautifulSoup

from linkedin_ids import linkedin_job_id
from posting_dates import is_repost


def rows(doc):
    if isinstance(doc, list):
        return doc
    return doc.get("jobs", []) if isinstance(doc, dict) else []


def jid(row):
    raw = str(row.get("sourceJobId") or row.get("link") or "").strip()
    return linkedin_job_id(raw) or raw


def plain_text(row):
    raw_html = str(row.get("descriptionHtml") or "").strip()
    if raw_html:
        text = BeautifulSoup(raw_html, "html.parser").get_text("\n")
    else:
        text = str(row.get("descriptionText") or row.get("description") or "")
    lines = []
    for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = re.sub(r"[ \t]+", " ", line).strip()
        if line:
            lines.append(line)
    return "\n".join(lines)


def diff_tokens(old_text: str, new_text: str) -> str:
    """Return escaped inline tracked changes while preserving readable whitespace."""
    old_tokens = re.findall(r"\s+|[^\s]+", old_text)
    new_tokens = re.findall(r"\s+|[^\s]+", new_text)
    matcher = difflib.SequenceMatcher(a=old_tokens, b=new_tokens, autojunk=False)
    output: list[str] = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        old = html.escape("".join(old_tokens[i1:i2]), quote=False)
        new = html.escape("".join(new_tokens[j1:j2]), quote=False)
        if tag == "equal":
            output.append(old)
        elif tag == "delete":
            output.append(f"<del>{old}</del>")
        elif tag == "insert":
            output.append(f"<ins>{new}</ins>")
        else:
            output.append(f"<del>{old}</del><ins>{new}</ins>")
    return "".join(output).replace("\n", "<br>")


def build_diff(old_row, new_row) -> str:
    old_text = plain_text(old_row)
    new_text = plain_text(new_row)
    if not old_text or not new_text or old_text == new_text:
        return ""
    return diff_tokens(old_text, new_text)


def annotate(existing_doc, snapshot_doc, observed_at=None):
    existing = {jid(row): row for row in rows(existing_doc) if isinstance(row, dict) and jid(row)}
    observed_at = observed_at or datetime.now(timezone.utc).isoformat()
    changed = unchanged = skipped = 0
    result = dict(snapshot_doc) if isinstance(snapshot_doc, dict) else {"jobs": rows(snapshot_doc)}
    out_rows = []
    for item in rows(snapshot_doc):
        item = dict(item)
        old = existing.get(jid(item))
        # Only a repost with a newly fetched JD is eligible. New jobs and missing-JD
        # backfills are intentionally excluded from change tracking.
        if not old or not (is_repost(old, item.get("datePosted"), observed_at) if item.get("datePosted") else item.get("jobspyRepost") is True):
            out_rows.append(item)
            continue
        if item.get("detailStatus") in {"failed", "blocked", "gone"} or not str(item.get("descriptionHtml") or item.get("descriptionText") or "").strip():
            skipped += 1
            out_rows.append(item)
            continue
        diff = build_diff(old, item)
        if not diff:
            item["jdChangeStatus"] = "unchanged"
            item["jdCheckedAt"] = observed_at
            unchanged += 1
        else:
            item["jdChangeStatus"] = "changed"
            item["jdChangedAt"] = observed_at
            item["jdDiffHtml"] = diff
            item["jdDiffPreviousText"] = plain_text(old)
            item["jdDiffCurrentText"] = plain_text(item)
            changed += 1
        out_rows.append(item)
    result["jobs"] = out_rows
    result["jdChangeSummary"] = {
        "observedAt": observed_at,
        "changed": changed,
        "unchanged": unchanged,
        "skipped": skipped,
    }
    return result


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--existing", type=Path, required=True)
    ap.add_argument("--snapshot", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--observed-at")
    args = ap.parse_args()
    existing = json.loads(args.existing.read_text(encoding="utf-8"))
    snapshot = json.loads(args.snapshot.read_text(encoding="utf-8"))
    result = annotate(existing, snapshot, args.observed_at)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result["jdChangeSummary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
