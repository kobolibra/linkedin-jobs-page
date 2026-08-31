#!/usr/bin/env python3
"""Mobile job-meta layout, v2 -- one wrapping flex row instead of a grid.

Why v1 failed on iOS Safari: the JD body used `width:0; min-width:100%` inside
a grid to avoid inflating the max-content tracks it spanned. Percentage
min-width against a grid area whose tracks are still being sized is a circular
dependency, so WebKit resolved it as 0. The paragraph rendered at ~0 width and
collapsed into one vertical column of letters, pushing the arrow off screen.

v2 removes the grid entirely. On mobile .job-detail-line becomes
`display:contents`, so .job-city, .salary-ref-mobile, <summary>,
.job-right-mobile and .job-jd-text all become direct flex items of
.job-meta-line, the same wrapping flex row that already holds the company name.
That single change gives three guarantees for free:

1. No city / salary / JD -> the four controls (age, region, star, ban) sit on
   the company-name row itself, right-aligned by margin-left:auto.
2. Salary with no city -> salary follows the company name directly; empty city
   nodes are removed with :empty so they cannot leave a phantom column-gap.
3. The JD body is `flex:1 1 100%` against a flex container with a definite
   width, so it always takes one full-width row starting at the far left --
   no zero-width collapse, no horizontal overflow. `order` keeps the controls
   on the first row and the JD body last, so the arrow is always reachable.

The desktop rules were already applied in the previous run and are re-checked
idempotently here. Desktop and mobile blocks are patched independently.
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

MOBILE_OLD = """  .job-detail-line { display:grid;width:100%;max-width:100%;grid-template-columns:max-content max-content max-content minmax(0,1fr);align-items:center;column-gap:10px;row-gap:5px;min-width:0;margin-top:5px;line-height:17px;overflow:hidden; }
  .job-city { grid-column:1;grid-row:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
  .salary-ref-mobile { grid-column:2;grid-row:1;min-width:0;white-space:nowrap; }
  .job-jd { display:contents; }
  .job-jd summary { grid-column:3;grid-row:1;flex:0 0 auto;align-self:center;padding:2px 0; }
  .job-right-mobile { grid-column:4;grid-row:1;justify-self:end;align-self:center; }
  .job-jd-text { grid-column:1 / -1;grid-row:2;width:0;min-width:100%;max-width:100%;margin-top:2px;overflow-wrap:anywhere;word-break:break-word; }
"""

MOBILE_NEW = """  .job-detail-line { display:contents;line-height:17px; }
  .job-city { flex:0 0 auto;order:0;align-self:center;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
  .job-city:empty { display:none; }
  .salary-ref-mobile { flex:0 0 auto;order:0;align-self:center;white-space:nowrap; }
  .salary-ref-mobile:empty { display:none; }
  .job-jd { display:contents; }
  .job-jd summary { flex:0 0 auto;order:0;align-self:center;padding:2px 0; }
  .job-right-mobile { order:1;align-self:center; }
  .job-jd-text { flex:1 1 100%;order:2;width:100%;max-width:100%;min-width:0;margin-top:4px;overflow-wrap:anywhere; }
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
