#!/usr/bin/env python3
"""Atomic reclassification: TARGET -> EXCLUDED across every persisted surface.

Closes the race where a company is added to financial_blacklist.json but stays
stranded in the cumulative/today target history. One invocation applies the
change to BOTH the GitHub repo (via Contents API) and the local /workspace
report files, so downstream output (the TSV the agent prints) is consistent too.

Surfaces:
  remote + local (if present):
    reports|.  today-companies-<date>.json      <- move target->excluded
    reports|.  today-target-companies-<date>.tsv    <- remove + renumber
    reports|.  today-excluded-companies-<date>.tsv  <- add + renumber
  remote only:
    financial_blacklist.json                        <- add
    company_industries.json                         <- add verified industries
    reports/cumulative-target-companies.tsv         <- remove
    reports/cumulative-excluded-companies.tsv       <- add (idempotent)

Matching key: casefold + strip (same as auto-daily-companies._is_financial_exclusion).

Usage:
  # dry-run preview
  python3 reclassify.py --dry-run --blacklist "PFCC Talent Solutions"
  # apply
  python3 reclassify.py --blacklist "PFCC Talent Solutions" \
      --industry '{"Fano (Fano Labs)":"语言人工智能(AI)"}'
"""
import argparse
import base64
import json
import os
import ssl
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

BEIJING = timezone(timedelta(hours=8))
REASON = "verified financial/headhunter (reclassified)"


def load_cfg():
    cfg = json.load(open("/workspace/config.json", encoding="utf-8"))
    return cfg["github_token"], cfg["repo"], cfg["branch"], cfg.get("proxy", "")


def build_opener(proxy):
    ctx = ssl.create_default_context()
    handlers = [urllib.request.HTTPSHandler(context=ctx)]
    if proxy:
        handlers.append(urllib.request.ProxyHandler({"https": proxy, "http": proxy}))
    return urllib.request.build_opener(*handlers)


class Repo:
    def __init__(self, token, repo, branch, opener):
        self.token, self.repo, self.branch, self.opener = token, repo, branch, opener

    def _url(self, path):
        return f"https://api.github.com/repos/{self.repo}/contents/{path}?ref={self.branch}"

    def get(self, path):
        req = urllib.request.Request(self._url(path))
        req.add_header("Authorization", f"Bearer {self.token}")
        req.add_header("Accept", "application/vnd.github+json")
        try:
            data = json.loads(self.opener.open(req).read())
            return base64.b64decode(data["content"]).decode("utf-8"), data.get("sha")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None, None
            raise

    def put(self, path, text, sha, message, dry_run, attempts=4):
        if dry_run:
            print(f"  [dry-run] would PUT {path} ({len(text)} bytes)")
            return
        last = None
        for i in range(attempts):
            payload = {"message": message, "branch": self.branch,
                       "content": base64.b64encode(text.encode("utf-8")).decode("ascii")}
            if sha:
                payload["sha"] = sha
            req = urllib.request.Request(self._url(path), data=json.dumps(payload).encode("utf-8"), method="PUT")
            req.add_header("Authorization", f"Bearer {self.token}")
            req.add_header("Accept", "application/vnd.github+json")
            req.add_header("Content-Type", "application/json")
            try:
                resp = json.loads(self.opener.open(req).read())
                print(f"  [pushed] {path} commit {resp['commit']['sha'][:10]}")
                return
            except urllib.error.HTTPError as e:
                last = e
                # 409/422: concurrent commit landed (e.g. CI reconcile). Refresh sha and retry.
                if e.code in (409, 422) and i < attempts - 1:
                    time.sleep(1.5 * (i + 1))
                    _, sha = self.get(path)
                    continue
                raise
        if last:
            raise last


def norm(name):
    return str(name or "").strip().casefold()


def col_index(header, name):
    for i, h in enumerate(header):
        if str(h).strip() == name:
            return i
    raise ValueError(f"column {name!r} not found in header {header}")


def parse_tsv(text):
    return [ln.split("\t") for ln in text.splitlines() if ln.strip()]


# ---------- pure transforms: text -> (new_text, changed, info) ----------

def t_cumulative_target(text, reclass):
    rows = parse_tsv(text)
    header, data = rows[0], rows[1:]
    ci = col_index(header, "公司名")
    kept = [r for r in data if norm(r[ci]) not in reclass]
    if len(kept) == len(data):
        return text, False, 0
    out = ["\t".join(header)] + ["\t".join(r) for r in kept]
    return "\n".join(out) + "\n", True, len(data) - len(kept)


def t_cumulative_excluded(text, reclass, today):
    rows = parse_tsv(text)
    header, data = rows[0], rows[1:]
    ci = col_index(header, "公司名")
    present = {norm(r[ci]) for r in data}
    additions = [[exact, REASON, today, today] for nk, exact in reclass.items() if nk not in present]
    if not additions:
        return text, False, 0
    out = ["\t".join(header)] + ["\t".join(r) for r in data + additions]
    return "\n".join(out) + "\n", True, len(additions)


def t_cum_upsert(text, companies, today, is_target, reclass):
    """Upsert verified companies into a cumulative TSV (idempotent).

    Used by --finalize: after verification, the daily report's remaining targets
    are the verified non-financial companies; write them into the cumulative
    ledger instead of letting the pre-verification daily script pollute it.
    """
    default = ["公司名", "备注" if is_target else "排除原因", "首次出现", "最近出现"]
    rows = parse_tsv(text) if text else [default]
    header = rows[0] if rows and len(rows[0]) >= 4 and rows[0][0] == "公司名" else default
    data = rows[1:] if header is rows[0] else []
    by, order = {}, []
    for r in data:
        if not r:
            continue
        r = (r + ["", "", "", ""])[:4]
        k = norm(r[0])
        if not k or k in by:
            continue
        by[k] = r
        order.append(r)
    for c in companies:
        name = str(c.get("company") or "").strip()
        if not name:
            continue
        k = norm(name)
        if is_target and k in reclass:
            continue
        reason = c.get("reason", "") or ""
        if k in by:
            r = by[k]
            r[3] = today
            if r[1] == "待查证" and reason and reason != "待查证":
                r[1] = reason
        else:
            r = [name, reason, today, today]
            by[k] = r
            order.append(r)
    out = ["\t".join(header)] + ["\t".join(r) for r in order]
    return "\n".join(out) + "\n"


def t_daily_json(text, reclass):
    j = json.loads(text)
    t = j.get("target_companies", [])
    e = j.get("excluded_companies", [])
    existing = {norm(c.get("company")) for c in e}
    t2, newly, moved_names = [], [], []
    for c in t:
        if norm(c.get("company")) in reclass:
            moved_names.append(c.get("company"))
            if norm(c.get("company")) not in existing:
                nc = dict(c)
                nc["category"] = "excluded"
                nc["reason"] = REASON
                newly.append(nc)
        else:
            t2.append(c)
    if len(t2) == len(t) and not newly:
        return text, False, 0, []
    j["target_companies"] = t2
    j["excluded_companies"] = e + newly
    j["total_target"] = len(t2)
    j["total_excluded"] = len(e) + len(newly)
    return json.dumps(j, ensure_ascii=False, indent=2) + "\n", True, len(t) - len(t2), moved_names


def t_daily_target_tsv(text, reclass):
    rows = parse_tsv(text)
    header, data = rows[0], rows[1:]
    ci = col_index(header, "公司名")
    ri = col_index(header, "备注")
    kept = [r for r in data if norm(r[ci]) not in reclass]
    if len(kept) == len(data):
        return text, False, 0
    out = ["\t".join(header)] + [f"{i}\t{r[ci]}\t{r[ri]}" for i, r in enumerate(kept, 1)]
    return "\n".join(out) + "\n", True, len(data) - len(kept)


def t_daily_excluded_tsv(text, reclass, moved_names):
    """Only add companies that were actually in today's target (moved_names)."""
    rows = parse_tsv(text)
    header, data = rows[0], rows[1:]
    ci = col_index(header, "公司名")
    ri = col_index(header, "排除原因")
    present = {norm(r[ci]) for r in data}
    additions = []
    for name in moved_names:
        if norm(name) not in present:
            additions.append([name, REASON])
            present.add(norm(name))
    if not additions:
        return text, False, 0
    merged = data + [["", n, r] for n, r in additions]
    out = ["\t".join(header)] + [f"{i}\t{r[ci]}\t{r[ri]}" for i, r in enumerate(merged, 1)]
    return "\n".join(out) + "\n", True, len(additions)


def apply_local(local_root, date, reclass, dry):
    """Apply the same reconciliation to local report files, if they exist."""
    jp = os.path.join(local_root, f"today-companies-{date}.json")
    tp = os.path.join(local_root, f"today-target-companies-{date}.tsv")
    ep = os.path.join(local_root, f"today-excluded-companies-{date}.tsv")
    changed = []

    moved_names = []
    if os.path.exists(jp):
        txt = open(jp, encoding="utf-8").read()
        new, ch, n, moved_names = t_daily_json(txt, reclass)
        if ch:
            if not dry:
                open(jp, "w", encoding="utf-8").write(new)
            changed.append(f"{os.path.basename(jp)} (moved {n})")

    if os.path.exists(tp):
        txt = open(tp, encoding="utf-8").read()
        new, ch, n = t_daily_target_tsv(txt, reclass)
        if ch:
            if not dry:
                open(tp, "w", encoding="utf-8").write(new)
            changed.append(f"{os.path.basename(tp)} (-{n})")

    if os.path.exists(ep):
        txt = open(ep, encoding="utf-8").read()
        new, ch, n = t_daily_excluded_tsv(txt, reclass, moved_names)
        if ch:
            if not dry:
                open(ep, "w", encoding="utf-8").write(new)
            changed.append(f"{os.path.basename(ep)} (+{n})")

    if changed:
        print("  local: " + ", ".join(changed))
    else:
        print("  local: no local report files changed")
    return len(changed)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--blacklist", nargs="*", default=[])
    ap.add_argument("--industry", default="{}")
    ap.add_argument("--date", default=None, help="YYYY-MM-DD (default: today Beijing)")
    ap.add_argument("--local-root", default="/workspace")
    ap.add_argument("--finalize", action="store_true",
                    help="write today's verified report into the cumulative ledgers")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    reclass = {norm(n): n for n in args.blacklist}
    industries = json.loads(args.industry) if args.industry else {}
    if not reclass and not industries and not args.finalize:
        print("Nothing to do (no --blacklist/--industry/--finalize).")
        return

    dry = args.dry_run
    today = args.date or datetime.now(BEIJING).strftime("%Y-%m-%d")

    token, repo_name, branch, proxy = load_cfg()
    repo = Repo(token, repo_name, branch, build_opener(proxy))
    changes = 0

    # ---- remote ----
    if reclass:
        print("\n[1/7] financial_blacklist.json")
        txt, sha = repo.get("financial_blacklist.json")
        bl = json.loads(txt) if txt else []
        new_bl = sorted(set(bl) | set(reclass.values()))
        if len(new_bl) != len(bl):
            repo.put("financial_blacklist.json", json.dumps(new_bl, ensure_ascii=False, indent=2), sha,
                     f"Reclassify: +{len(new_bl)-len(bl)} financial companies ({today})", dry)
            changes += 1
        else:
            print("  no change")

    print("\n[2/7] company_industries.json")
    if industries:
        txt, sha = repo.get("company_industries.json")
        ind = json.loads(txt) if txt else {}
        ind.update(industries)
        repo.put("company_industries.json", json.dumps(ind, ensure_ascii=False, indent=2), sha,
                 f"Reclassify: update {len(industries)} industry entries ({today})", dry)
        changes += 1
    else:
        print("  skipped (no --industry)")

    if reclass or args.finalize:
        print("\n[3/7] cumulative-target-companies.tsv")
        txt, sha = repo.get("reports/cumulative-target-companies.tsv")
        if txt:
            new, ch, n = t_cumulative_target(txt, reclass)
            if ch:
                repo.put("reports/cumulative-target-companies.tsv", new, sha,
                         f"Reclassify: remove {n} from cumulative target ({today})", dry)
                changes += 1
            else:
                print("  no change")
        else:
            print("  (file absent)")

        print("\n[4/7] cumulative-excluded-companies.tsv")
        txt, sha = repo.get("reports/cumulative-excluded-companies.tsv")
        rows_header = "公司名\t排除原因\t首次出现\t最近出现\n"
        new, ch, n = t_cumulative_excluded(txt if txt else rows_header, reclass, today)
        if ch:
            repo.put("reports/cumulative-excluded-companies.tsv", new, sha,
                     f"Reclassify: archive {n} reclassified firms ({today})", dry)
            changes += 1
        else:
            print("  no change")

        jp = f"reports/today-companies-{today}.json"
        tp = f"reports/today-target-companies-{today}.tsv"
        ep = f"reports/today-excluded-companies-{today}.tsv"

        print(f"\n[5/7] {jp}")
        txt, sha = repo.get(jp)
        moved_names, final_t, final_e = [], [], []
        if txt:
            new, ch, n, moved_names = t_daily_json(txt, reclass)
            parsed = json.loads(new)
            final_t = parsed.get("target_companies", [])
            final_e = parsed.get("excluded_companies", [])
            if ch:
                repo.put(jp, new, sha, f"Reclassify {today}: move {n} target->excluded", dry)
                changes += 1
            else:
                print("  no change")
        else:
            print("  (file absent)")

        print(f"\n[6/7] {tp}")
        txt, sha = repo.get(tp)
        if txt:
            new, ch, n = t_daily_target_tsv(txt, reclass)
            if ch:
                repo.put(tp, new, sha, f"Reclassify {today}: drop from target TSV", dry)
                changes += 1
            else:
                print("  no change")
        else:
            print("  (file absent)")

        print(f"\n[7/7] {ep}")
        txt, sha = repo.get(ep)
        if txt:
            new, ch, n = t_daily_excluded_tsv(txt, reclass, moved_names)
            if ch:
                repo.put(ep, new, sha, f"Reclassify {today}: append to excluded TSV", dry)
                changes += 1
            else:
                print("  no change")
        else:
            print("  (file absent)")

        # ---- finalize: verified report -> cumulative ledgers (post-verification) ----
        if args.finalize and (final_t or final_e):
            print("\n[finalize] cumulative ledgers <- verified report")
            if final_t:
                txt, sha = repo.get("reports/cumulative-target-companies.tsv")
                new = t_cum_upsert(txt, final_t, today, True, reclass)
                if new != (txt or ""):
                    repo.put("reports/cumulative-target-companies.tsv", new, sha,
                             f"Finalize {today}: upsert {len(final_t)} verified targets", dry)
                    changes += 1
                else:
                    print("  cumulative-target: no change")
            if final_e:
                txt, sha = repo.get("reports/cumulative-excluded-companies.tsv")
                new = t_cum_upsert(txt, final_e, today, False, reclass)
                if new != (txt or ""):
                    repo.put("reports/cumulative-excluded-companies.tsv", new, sha,
                             f"Finalize {today}: upsert {len(final_e)} excluded", dry)
                    changes += 1
                else:
                    print("  cumulative-excluded: no change")

    # ---- local mirror (keep the agent's local TSV output consistent) ----
    if reclass:
        print(f"\n[local] {args.local_root}")
        changes += apply_local(args.local_root, today, reclass, dry)

    print(f"\n=== Reclassify done: {changes} surface(s) changed{' (dry-run)' if dry else ''} ===")


if __name__ == "__main__":
    main()
