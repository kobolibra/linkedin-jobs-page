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

from bs4 import BeautifulSoup, Comment, NavigableString

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
        soup=BeautifulSoup(raw_html, "html.parser")
        text = (soup.select_one('.show-more-less-html__markup') or soup).get_text("\n")
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


def formatted_diff(old_text: str, current_html: str) -> str:
    """Annotate text inside the current source DOM without flattening its tags."""
    soup = BeautifulSoup(current_html, "html.parser")
    nodes = [node for node in soup.descendants if isinstance(node, NavigableString)
             and not isinstance(node, Comment) and node.parent.name not in {"script", "style", "template"}]
    current_words = [word for node in nodes for word in re.findall(r"\S+", str(node))]
    old_words = re.findall(r"\S+", old_text)
    if not current_words or not old_words or current_words == old_words:
        return current_html
    inserted = set()
    deleted = {}
    for kind, i1, i2, j1, j2 in difflib.SequenceMatcher(a=old_words, b=current_words, autojunk=False).get_opcodes():
        if kind in {"insert", "replace"}: inserted.update(range(j1,j2))
        if kind in {"delete", "replace"}: deleted[j1] = " ".join(old_words[i1:i2])
    position=0
    last=None
    for node in nodes:
        replacements=[]; insertion=None
        for token in re.findall(r"\s+|\S+",str(node)):
            word=not token.isspace()
            if word and position in deleted:
                insertion=None
                deletion=soup.new_tag('del');deletion.string=deleted.pop(position)+' '
                replacements.append(deletion)
            mark=position in inserted if word else position-1 in inserted and position in inserted
            if mark:
                if insertion is None:
                    insertion=soup.new_tag('ins');replacements.append(insertion)
                insertion.append(NavigableString(token))
            else:
                insertion=None;replacements.append(NavigableString(token))
            if word: position+=1
        if replacements:
            last=replacements[-1]
            node.replace_with(*replacements)
    if position in deleted and last is not None:
        suffix=soup.new_tag('del');suffix.string=' '+deleted[position]
        while last.parent and last.parent.name not in {'p','div','li','td','th','blockquote','[document]'}:
            last=last.parent
        last.insert_after(suffix)
    return str(soup)


def build_diff(old_row, new_row) -> str:
    old_text = plain_text(old_row)
    new_text = plain_text(new_row)
    if not old_text or not new_text or old_text == new_text:
        return ""
    if re.findall(r'\S+',old_text)==re.findall(r'\S+',new_text):return ""
    current_html=str(new_row.get('descriptionHtml') or '').strip()
    return formatted_diff(old_text,current_html) if current_html else diff_tokens(old_text, new_text)


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
        if not old or not (is_repost(old, item.get("datePosted"), observed_at, source_raw=item.get("linkedinPostedRaw")) if item.get("datePosted") else item.get("jobspyRepost") is True):
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
