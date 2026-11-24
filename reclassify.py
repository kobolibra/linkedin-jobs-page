#!/usr/bin/env python3
"""Atomic reclassification: verify -> reconcile every persisted surface.

One invocation applies verification results to BOTH the GitHub repo (Contents
API) and the local /workspace report files, so the TSV the agent prints and the
persisted ledgers are always identical.

Ordering guarantee: the daily script (auto-daily-companies.py) writes ONLY the
day's report. The cumulative ledgers are written here, AFTER verification, via
``--finalize``. Unverified "待查证" candidates therefore never leak into the
cumulative target history (which would let the publication filter delete their
jobs before verification).

Surfaces:
  remote + local (if present):
    today-companies-<date>.json        move financial target->excluded,
                                       apply verified industries to target notes
    today-target-companies-<date>.tsv  rebuilt from the JSON (canonical)
    today-excluded-companies-<date>.tsv rebuilt from the JSON (canonical)
  remote only:
    financial_blacklist.json           add
    company_industries.json            add verified industries
    cumulative-target-companies.tsv    remove blacklisted; --finalize upsert verified targets
    cumulative-excluded-companies.tsv  add blacklisted; --finalize upsert excluded

Matching key: casefold + strip (same as auto-daily-companies._is_financial_exclusion).

Usage:
  python3 reclassify.py --finalize --blacklist "PFCC Talent Solutions" \
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


# ---------- pure transforms ----------

def t_cumulative_target(text, reclass):
    rows = parse_tsv(text)
    header, data = rows[0], rows[1:]
    ci = col_index(header, "公司名")
    kept = [r for r in data if norm(r[ci]) not in reclass]
    if len(kept) == len(data):
        return text, 0
    out = ["\t".join(header)] + ["\t".join(r) for r in kept]
    return "\n".join(out) + "\n", len(data) - len(kept)


def t_cumulative_excluded(text, reclass, today):
    rows = parse_tsv(text)
    header, data = rows[0], rows[1:]
    ci = col_index(header, "公司名")
    present = {norm(r[ci]) for r in data}
    additions = [[exact, REASON, today, today] for nk, exact in reclass.items() if nk not in present]
    if not additions:
        return text, 0
    out = ["\t".join(header)] + ["\t".join(r) for r in data + additions]
    return "\n".join(out) + "\n", len(additions)


def t_daily_json(text, reclass, industries):
    """Move financial targets->excluded and apply verified industries to notes.

    Returns (new_text, changed, moved_count, moved_names, final_targets, final_excluded).
    """
    j = json.loads(text)
    t = j.get("target_companies", [])
    e = j.get("excluded_companies", [])
    existing = {norm(c.get("company")) for c in e}
    indu = {norm(k): v for k, v in (industries or {}).items()}
    t2, newly, moved_names = [], [], []
    changed = False
    for c in t:
        name = c.get("company")
        k = norm(name)
        if k in reclass:
            moved_names.append(name)
            changed = True
            if k not in existing:
                nc = dict(c)
                nc["category"] = "excluded"
                nc["reason"] = REASON
                newly.append(nc)
            continue
        cc = dict(c)
        if k in indu:
            new_reason = indu[k]
            if cc.get("reason") != new_reason:
                cc["reason"] = new_reason
                changed = True
        t2.append(cc)
    if not changed and not newly:
        return text, False, 0, [], t, e
    j["target_companies"] = t2
    j["excluded_companies"] = e + newly
    j["total_target"] = len(t2)
    j["total_excluded"] = len(e) + len(newly)
    return json.dumps(j, ensure_ascii=False, indent=2) + "\n", True, len(moved_names), moved_names, t2, j["excluded_companies"]


def build_tsv(companies, kind):
    header = ["序号", "公司名", "备注"] if kind == "target" else ["序号", "公司名", "排除原因"]
    lines = ["\t".join(header)]
    for i, c in enumerate(companies, 1):
        lines.append(f"{i}\t{c.get('company', '')}\t{c.get('reason', '')}")
    return "\n".join(lines) + "\n"


def t_cum_upsert(text, companies, today, is_target, reclass):
    """Upsert verified companies into a cumulative TSV (idempotent)."""
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


def apply_local(local_root, date, reclass, industries, dry):
    """Mirror the same reconciliation onto local report files, if present."""
    jp = os.path.join(local_root, f"today-companies-{date}.json")
    tp = os.path.join(local_root, f"today-target-companies-{date}.tsv")
    ep = os.path.join(local_root, f"today-excluded-companies-{date}.tsv")
    changed = []
    if not os.path.exists(jp):
        print("  local: no local daily JSON; nothing to mirror")
        return 0
    txt = open(jp, encoding="utf-8").read()
    new, ch, n, moved, final_t, final_e = t_daily_json(txt, reclass, industries)
    if ch:
        if not dry:
            open(jp, "w", encoding="utf-8").write(new)
        changed.append(f"{os.path.basename(jp)} (moved {n})")
    for path, data, kind in [(tp, final_t, "target"), (ep, final_e, "excluded")]:
        if not os.path.exists(path):
            continue
        b = build_tsv(data, kind)
        old = open(path, encoding="utf-8").read()
        if b != old:
            if not dry:
                open(path, "w", encoding="utf-8").write(b)
            changed.append(os.path.basename(path))
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

    # ---- 1. financial_blacklist.json ----
    if reclass:
        print("\n[1/8] financial_blacklist.json")
        txt, sha = repo.get("financial_blacklist.json")
        bl = json.loads(txt) if txt else []
        new_bl = sorted(set(bl) | set(reclass.values()))
        if len(new_bl) != len(bl):
            repo.put("financial_blacklist.json", json.dumps(new_bl, ensure_ascii=False, indent=2), sha,
                     f"Reclassify: +{len(new_bl)-len(bl)} financial companies ({today})", dry)
            changes += 1
        else:
            print("  no change")

    # ---- 2. company_industries.json ----
    print("\n[2/8] company_industries.json")
    if industries:
        txt, sha = repo.get("company_industries.json")
        ind = json.loads(txt) if txt else {}
        ind.update(industries)
        repo.put("company_industries.json", json.dumps(ind, ensure_ascii=False, indent=2), sha,
                 f"Reclassify: update {len(industries)} industry entries ({today})", dry)
        changes += 1
    else:
        print("  skipped (no --industry)")

    if not (reclass or args.finalize or industries):
        print(f"\n=== Reclassify done: {changes} surface(s) changed{' (dry-run)' if dry else ''} ===")
        return

    jp = f"reports/today-companies-{today}.json"
    tp = f"reports/today-target-companies-{today}.tsv"
    ep = f"reports/today-excluded-companies-{today}.tsv"

    # ---- 3. cumulative-target: remove blacklisted ----
    if reclass:
        print("\n[3/8] cumulative-target-companies.tsv (remove blacklisted)")
        txt, sha = repo.get("reports/cumulative-target-companies.tsv")
        if txt:
            new, n = t_cumulative_target(txt, reclass)
            if n:
                repo.put("reports/cumulative-target-companies.tsv", new, sha,
                         f"Reclassify: remove {n} from cumulative target ({today})", dry)
                changes += 1
            else:
                print("  no change")
        else:
            print("  (file absent)")

    # ---- 4. daily JSON: move financial, apply industries ----
    print(f"\n[4/8] {jp}")
    txt, sha = repo.get(jp)
    final_t, final_e = [], []
    if txt:
        new, ch, n, moved, final_t, final_e = t_daily_json(txt, reclass, industries)
        if ch:
            repo.put(jp, new, sha, f"Reclassify {today}: move {n} target->excluded; apply industries", dry)
            changes += 1
        else:
            print("  no change")
    else:
        print("  (file absent)")

    # ---- 5. target TSV: rebuild from JSON (canonical) ----
    print(f"\n[5/8] {tp}")
    if txt:
        b = build_tsv(final_t, "target")
        old, sha2 = repo.get(tp)
        if b != (old or ""):
            repo.put(tp, b, sha2, f"Reclassify {today}: rebuild target TSV", dry)
            changes += 1
        else:
            print("  no change")
    else:
        print("  (skipped: no daily JSON)")

    # ---- 6. excluded TSV: rebuild from JSON (canonical) ----
    print(f"\n[6/8] {ep}")
    if txt:
        b = build_tsv(final_e, "excluded")
        old, sha3 = repo.get(ep)
        if b != (old or ""):
            repo.put(ep, b, sha3, f"Reclassify {today}: rebuild excluded TSV", dry)
            changes += 1
        else:
            print("  no change")
    else:
        print("  (skipped: no daily JSON)")

    # ---- 7/8. finalize: verified report -> cumulative ledgers ----
    if args.finalize:
        print("\n[7/8] cumulative-target <- verified report")
        if final_t:
            txt, sha = repo.get("reports/cumulative-target-companies.tsv")
            new = t_cum_upsert(txt, final_t, today, True, reclass)
            if new != (txt or ""):
                repo.put("reports/cumulative-target-companies.tsv", new, sha,
                         f"Finalize {today}: upsert {len(final_t)} verified targets", dry)
                changes += 1
            else:
                print("  no change")
        else:
            print("  (no targets)")

        print("\n[8/8] cumulative-excluded <- verified report")
        if final_e:
            txt, sha = repo.get("reports/cumulative-excluded-companies.tsv")
            new = t_cum_upsert(txt, final_e, today, False, reclass)
            if new != (txt or ""):
                repo.put("reports/cumulative-excluded-companies.tsv", new, sha,
                         f"Finalize {today}: upsert {len(final_e)} excluded", dry)
                changes += 1
            else:
                print("  no change")
        else:
            print("  (no excluded)")

    # ---- local mirror ----
    print(f"\n[local] {args.local_root}")
    changes += apply_local(args.local_root, today, reclass, industries, dry)

    print(f"\n=== Reclassify done: {changes} surface(s) changed{' (dry-run)' if dry else ''} ===")


if __name__ == "__main__":
    main()
