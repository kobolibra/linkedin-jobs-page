#!/usr/bin/env python3
"""Keep the JD disclosure arrow in place and stop mobile JD overflow.

Desktop bug: .job-jd was a `flex:0 0 auto` item of .job-meta-line, and the JD
body lived inside it with flex-basis:100%. Once expanded, the details element's
max-content width became the whole JD paragraph, so flex-wrap pushed the entire
block -- arrow included -- onto the line below the company name. display:contents
makes <summary> its own inline flex item that never moves, while only
.job-jd-text takes a full-width row starting at the far left.

Mobile bug: .job-jd-text spanned `grid-column:1 / -1` inside a grid whose first
three tracks were max-content. A spanning item contributes its width to every
intrinsic track it spans, so the JD body inflated the city / salary / arrow
tracks: the row overflowed the viewport, the arrow was pushed off-screen (so it
could not be collapsed again) and the four right-hand controls lost their
right alignment. Fix: keep explicit grid slots for row 1 (city, salary, arrow,
controls pinned right) and give the JD body `width:0; min-width:100%` so its
intrinsic contribution to those tracks is exactly zero while it still renders
at the full row width.

Desktop and mobile blocks are patched independently so neither can disturb the
other.
"""
from pathlib import Path

CSS_PATH = Path("styles-list.css")

DESKTOP_OLD = """.job-jd { display:inline-flex;flex:0 0 auto;flex-wrap:wrap;align-items:baseline;max-width:100%;color:var(--ink-soft);font-size:12px;line-height:1.5; }
.job-jd summary { cursor:pointer;color:var(--region,var(--navy));font-size:11px;letter-spacing:.04em; }
.job-jd-text { flex-basis:100%;width:100%;margin-top:6px;white-space:normal;max-height:0;overflow:hidden;opacity:0;transition:opacity .18s ease; }
.job-jd[open] .job-jd-text { max-height:10000px;overflow:visible;opacity:1; }
"""

DESKTOP_NEW = """.job-jd { display:contents;color:var(--ink-soft);font-size:12px;line-height:1.5; }
.job-jd summary { cursor:pointer;color:var(--region,var(--navy));font-size:11px;letter-spacing:.04em;flex:0 0 auto;align-self:baseline; }
.job-jd-text { flex:1 1 100%;width:100%;max-width:100%;min-width:0;margin-top:6px;white-space:normal;overflow-wrap:anywhere; }
.job-jd:not([open]) .job-jd-text { display:none; }
.job-jd[open] .job-jd-text { display:block;max-height:none;overflow:visible;opacity:1; }
"""

MOBILE_OLD = """  .job-detail-line { display:grid;grid-template-columns:max-content max-content max-content minmax(0,1fr);align-items:center;column-gap:12px;row-gap:5px;min-width:0;margin-top:5px;line-height:17px; }
  .job-city { grid-column:1;grid-row:1; }
  .salary-ref-mobile { grid-column:2;grid-row:1; }
  .job-jd { display:contents; }
  .job-jd summary { grid-column:3;grid-row:1; }
  .job-right-mobile { grid-column:4;grid-row:1;justify-self:end; }
  .job-jd-text { grid-column:1 / -1;grid-row:2;width:auto;min-width:0;overflow-wrap:anywhere; }
"""

MOBILE_NEW = """  .job-detail-line { display:grid;width:100%;max-width:100%;grid-template-columns:max-content max-content max-content minmax(0,1fr);align-items:center;column-gap:10px;row-gap:5px;min-width:0;margin-top:5px;line-height:17px;overflow:hidden; }
  .job-city { grid-column:1;grid-row:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
  .salary-ref-mobile { grid-column:2;grid-row:1;min-width:0;white-space:nowrap; }
  .job-jd { display:contents; }
  .job-jd summary { grid-column:3;grid-row:1;flex:0 0 auto;align-self:center;padding:2px 0; }
  .job-right-mobile { grid-column:4;grid-row:1;justify-self:end;align-self:center; }
  .job-jd-text { grid-column:1 / -1;grid-row:2;width:0;min-width:100%;max-width:100%;margin-top:2px;overflow-wrap:anywhere;word-break:break-word; }
"""


def apply_block(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        if new in text:
            print(f"{label}: already applied, skipping")
            return text
        raise SystemExit(f"{label}: anchor not found; aborting without writing anything")
    found = text.count(old)
    if found != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {found}; aborting")
    print(f"{label}: patched")
    return text.replace(old, new)


def main() -> int:
    text = CSS_PATH.read_text(encoding="utf-8")
    original = text
    text = apply_block(text, DESKTOP_OLD, DESKTOP_NEW, "desktop .job-jd")
    text = apply_block(text, MOBILE_OLD, MOBILE_NEW, "mobile .job-detail-line")
    if text == original:
        print("nothing to change")
        return 0
    CSS_PATH.write_text(text, encoding="utf-8")
    print("wrote styles-list.css")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
