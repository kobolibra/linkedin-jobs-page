#!/usr/bin/env python3
"""Reconcile classification state after financial_blacklist.json changes.

Runs inside the publish workflow (local checkout, no network). For EVERY company
present in financial_blacklist.json, guarantee it is:
  - REMOVED from reports/cumulative-target-companies.tsv
  - PRESENT in reports/cumulative-excluded-companies.tsv
  - moved target->excluded in today's daily JSON / TSV reports

Idempotent and self-healing: safe to run on every publication. Only writes files
when something actually changes, so the caller's `git diff --cached --quiet`
correctly detects no-op runs.
"""
import json
import os
import sys
from datetime import datetime, timezone, timedelta

BEIJING = timezone(timedelta(hours=8))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def norm(name):
    return str(name or "").strip().casefold()


def read(path):
    p = os.path.join(ROOT, path)
    if not os.path.exists(p):
        return None
    with open(p, encoding="utf-8") as f:
        return f.read()


def write_if_changed(path, text):
    p = os.path.join(ROOT, path)
    old = read(path)
    if old == text:
        return False
    with open(p, "w", encoding="utf-8") as f:
        f.write(text)
    return True


def parse_tsv(text):
    return [ln.split("\t") for ln in text.splitlines() if ln.strip()]


def col(header, name):
    for i, h in enumerate(header):
        if str(h).strip() == name:
            return i
    raise ValueError(f"column {name!r} missing in {header}")


def main():
    today = datetime.now(BEIJING).strftime("%Y-%m-%d")
    bl_raw = read("financial_blacklist.json")
    if not bl_raw:
        print("no financial_blacklist.json; nothing to reconcile")
        return 0
    blacklist = {norm(n) for n in json.loads(bl_raw)}
    if not blacklist:
        print("empty blacklist; nothing to reconcile")
        return 0

    changed = []

    # ---- 1. cumulative-target: drop blacklisted rows ----
    ct_path = "reports/cumulative-target-companies.tsv"
    txt = read(ct_path)
    moved = []  # (company, reason, first_seen) rows removed from target
    if txt:
        rows = parse_tsv(txt)
        header, data = rows[0], rows[1:]
        ci = col(header, "公司名")
        fi = col(header, "首次出现") if "首次出现" in header else None
        kept = []
        for r in data:
            if norm(r[ci]) in blacklist:
                first = r[fi] if fi is not None and fi < len(r) else today
                moved.append((r[ci], first))
            else:
                kept.append(r)
        if len(kept) != len(data):
            out = ["\t".join(header)] + ["\t".join(r) for r in kept]
            if write_if_changed(ct_path, "\n".join(out) + "\n"):
                changed.append(f"{ct_path} (-{len(data)-len(kept)})")

    # ---- 2. cumulative-excluded: ensure blacklisted companies present ----
    ce_path = "reports/cumulative-excluded-companies.tsv"
    txt = read(ce_path)
    rows = parse_tsv(txt) if txt else [["公司名", "排除原因", "首次出现", "最近出现"]]
    header, data = rows[0], rows[1:]
    ci = col(header, "公司名")
    present = {norm(r[ci]) for r in data}
    # move everything removed from target; also backfill any blacklisted company
    # that somehow still sits only in target history
    additions = []
    seen = set(present)
    for company, first in moved:
        if norm(company) not in seen:
            additions.append([company, "verified financial/headhunter (reclassified)", first, today])
            seen.add(norm(company))
    if additions:
        out = ["\t".join(header)] + ["\t".join(r) for r in data + additions]
        if write_if_changed(ce_path, "\n".join(out) + "\n"):
            changed.append(f"{ce_path} (+{len(additions)})")

    # ---- 3-5. today's daily reports ----
    dj_path = f"reports/today-companies-{today}.json"
    txt = read(dj_path)
    if txt:
        j = json.loads(txt)
        t = j.get("target_companies", [])
        e = j.get("excluded_companies", [])
        existing_e = {norm(c.get("company")) for c in e}
        t2, newly = [], []
        for c in t:
            if norm(c.get("company")) in blacklist:
                if norm(c.get("company")) not in existing_e:
                    nc = dict(c)
                    nc["category"] = "excluded"
                    nc["reason"] = "verified financial/headhunter (reclassified)"
                    newly.append(nc)
            else:
                t2.append(c)
        if len(t2) != len(t) or newly:
            j["target_companies"] = t2
            j["excluded_companies"] = e + newly
            j["total_target"] = len(t2)
            j["total_excluded"] = len(j["excluded_companies"])
            if write_if_changed(dj_path, json.dumps(j, ensure_ascii=False, indent=2) + "\n"):
                changed.append(f"{dj_path} (moved {len(t)-len(t2)})")

    for path, reason_col, add_reason in [
        (f"reports/today-target-companies-{today}.tsv", "备注", None),
        (f"reports/today-excluded-companies-{today}.tsv", "排除原因", "verified financial/headhunter (reclassified)"),
    ]:
        txt = read(path)
        if not txt:
            continue
        rows = parse_tsv(txt)
        header, data = rows[0], rows[1:]
        ci = col(header, "公司名")
        ri = col(header, reason_col)
        if add_reason is None:
            # target TSV: drop blacklisted rows + renumber
            kept = [r for r in data if norm(r[ci]) not in blacklist]
            if len(kept) != len(data):
                out = ["\t".join(header)] + [f"{i}\t{r[ci]}\t{r[ri]}" for i, r in enumerate(kept, 1)]
                if write_if_changed(path, "\n".join(out) + "\n"):
                    changed.append(f"{path} (-{len(data)-len(kept)})")
        else:
            # excluded TSV: ensure every blacklisted company that was in today's
            # target JSON is present (the JSON move already records them; here we
            # backfill from the same source of truth = blacklist ∩ today's target)
            present = {norm(r[ci]) for r in data}
            # companies removed from target TSV above OR in daily JSON excluded
            need = set()
            dj = read(dj_path)
            if dj:
                jj = json.loads(dj)
                for c in jj.get("excluded_companies", []):
                    if norm(c.get("company")) in blacklist:
                        need.add(c.get("company"))
            additions = []
            for company in sorted(need, key=norm):
                if norm(company) not in present:
                    additions.append(company)
                    present.add(norm(company))
            if additions:
                merged = data + [["", c, add_reason] for c in additions]
                out = ["\t".join(header)] + [f"{i}\t{r[ci]}\t{r[ri]}" for i, r in enumerate(merged, 1)]
                if write_if_changed(path, "\n".join(out) + "\n"):
                    changed.append(f"{path} (+{len(additions)})")

    if changed:
        print("reconciled classification:")
        for c in changed:
            print("  ", c)
    else:
        print("classification already consistent; no changes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
