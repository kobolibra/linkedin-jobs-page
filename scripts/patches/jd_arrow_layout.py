#!/usr/bin/env python3
"""Mobile job-card layout, v4 -- a deterministic three-row structure.

Target structure (mobile only):
  row 1  job title                            (wraps freely, never truncated)
  row 2  company - count            | age - region - star - ban   (one line)
  row 3  city - salary - JD arrow                                 (left)
  row 4  JD body, full width, only while expanded

Why v2 and v3 were not enough
-----------------------------
Both relied on flex wrapping, so which row an element landed on depended on how
long the text was. Short cards kept everything on one line, long cards pushed
the four right-hand controls down, and the right edge of the list came out
ragged. Row membership has to be a property of the design, not of the content.

How row membership is forced
---------------------------
All of .job-sub, .job-city, .salary-ref-mobile, <summary>, .job-right-mobile and
.job-jd-text become flex items of .job-meta-line (via display:contents on
.job-detail-line and .job-jd). Then:

* .job-meta-line::after is a generated flex item with `flex:1 1 100%` and
  `height:0`, carrying order:3. A full-width item cannot share a flex line, so
  everything with a lower order is trapped on line 1 and everything with a
  higher order is pushed below it. It is a structural line break that costs no
  vertical space (row-gap is 0; each row carries its own margin-top).
* order 1 = company, 2 = right-hand controls, 3 = break, 4/5/6 = city, salary,
  arrow, 7 = JD body (also flex:1 1 100%, so it takes its own row).

Why row 2 can never wrap
------------------------
Row 2 holds only two items. .job-sub has min-width:0 with ellipsis, so its
minimum contribution is 0, and the controls are a fixed ~130px. The sum can
never exceed the container, so a wrap is arithmetically impossible rather than
unlikely. .age carries a fixed min-width with right alignment, which is what
turns the right-hand column into a true vertical line across all cards.

Accepts either the v2 or the v3 mobile block as its starting point, and is
idempotent. Desktop rules are verified but never modified; every declaration
below lives inside @media (max-width:720px).
"""
from pathlib import Path

CSS_PATH = Path("styles-list.css")

DESKTOP_GUARD = ".job-jd { display:contents;color:var(--ink-soft);font-size:12px;line-height:1.5; }"

BAND_V2 = """  .job-detail-line { display:contents;line-height:17px; }
  .job-city { flex:0 0 auto;order:0;align-self:center;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
  .job-city:empty { display:none; }
  .salary-ref-mobile { flex:0 0 auto;order:0;align-self:center;white-space:nowrap; }
  .salary-ref-mobile:empty { display:none; }
  .job-jd { display:contents; }
  .job-jd summary { flex:0 0 auto;order:0;align-self:center;padding:2px 0; }
  .job-right-mobile { order:1;align-self:center; }
  .job-jd-text { flex:1 1 100%;order:2;width:100%;max-width:100%;min-width:0;margin-top:4px;overflow-wrap:anywhere; }
"""

BAND_V3 = """  /* Meta row = one non-wrapping band: identity yields on the left, metadata and
     controls stay fixed on the right so the right edge forms a vertical line. */
  .job-meta-line { flex-wrap:wrap;align-items:center;column-gap:8px;row-gap:4px; }
  .job-detail-line { display:contents;line-height:17px; }
  .job-city { flex:0 6 auto;order:2;align-self:center;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
  .job-city:empty { display:none; }
  .salary-ref-mobile { flex:0 0 auto;order:3;align-self:center;white-space:nowrap; }
  .salary-ref-mobile:empty { display:none; }
  .job-jd { display:contents; }
  .job-jd summary { flex:0 0 auto;order:4;align-self:center;padding:2px 0; }
  .job-right-mobile { order:5;align-self:center; }
  .job-jd-text { flex:1 1 100%;order:6;width:100%;max-width:100%;min-width:0;margin-top:5px;overflow-wrap:anywhere; }
"""

BAND_FINAL = """  /* Three fixed rows: (1) title, (2) company left + age/region/star/ban right on
     one line, (3) city / salary / JD arrow left, (4) JD body full width. */
  .job-meta-line { display:flex;flex-wrap:wrap;align-items:center;column-gap:8px;row-gap:0;min-width:0;margin-top:3px; }
  .job-meta-line::after { content:"";flex:1 1 100%;height:0;min-width:0;order:3; }
  .job-detail-line { display:contents;line-height:17px; }
  .job-right-mobile { order:2;align-self:center; }
  .job-city { flex:0 0 auto;order:4;align-self:center;min-width:0;max-width:100%;margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
  .job-city:empty { display:none; }
  .salary-ref-mobile { flex:0 0 auto;order:5;align-self:center;margin-top:5px;white-space:nowrap; }
  .salary-ref-mobile:empty { display:none; }
  .job-jd { display:contents; }
  .job-jd summary { flex:0 0 auto;order:6;align-self:center;margin-top:5px;padding:2px 0; }
  .job-jd-text { flex:1 1 100%;order:7;width:100%;max-width:100%;min-width:0;margin-top:6px;overflow-wrap:anywhere; }
"""

SUB_V2 = "  .job-sub { white-space:normal; }\n"
SUB_FINAL = (
    "  .job-sub { flex:1 1 auto;order:1;min-width:0;align-self:center;"
    "overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }\n"
)

RIGHT_V2 = (
    "  .job-right-mobile { display:flex;flex:0 0 auto;align-items:center;"
    "gap:6px;margin-left:auto;white-space:nowrap; }\n"
)
RIGHT_FINAL = (
    "  .job-right-mobile { display:flex;flex:0 0 auto;align-items:center;"
    "gap:5px;margin-left:auto;white-space:nowrap; }\n"
    "  .job-right-mobile .icon-btn { width:24px;height:24px; }\n"
    "  .job-right-mobile .icon-btn svg { width:14px;height:14px; }\n"
)

AGE_V2 = "  .lvl,.age { min-width:0;text-align:left; }\n"
AGE_FINAL = (
    "  .lvl { min-width:0;text-align:left; }\n"
    "  .age { min-width:42px;text-align:right; }\n"
)


def apply_block(text: str, candidates: list[str], new: str, label: str) -> str:
    if new in text:
        print(f"{label}: already applied, skipping")
        return text
    for old in candidates:
        if old not in text:
            continue
        found = text.count(old)
        if found != 1:
            raise SystemExit(f"{label}: expected exactly 1 match, found {found}; aborting")
        print(f"{label}: patched")
        return text.replace(old, new)
    raise SystemExit(f"{label}: no known anchor found; aborting without writing anything")


def main() -> int:
    text = CSS_PATH.read_text(encoding="utf-8")
    if DESKTOP_GUARD not in text:
        raise SystemExit(
            "desktop .job-jd is not in the expected display:contents state; aborting"
        )
    print("desktop .job-jd: verified, left untouched")

    original = text
    text = apply_block(text, [BAND_V3, BAND_V2], BAND_FINAL, "mobile three-row band")
    text = apply_block(text, [SUB_V2], SUB_FINAL, "mobile .job-sub")
    text = apply_block(text, [RIGHT_V2], RIGHT_FINAL, "mobile .job-right-mobile")
    text = apply_block(text, [AGE_V2], AGE_FINAL, "mobile .age alignment")

    if text == original:
        print("nothing to change")
        return 0
    CSS_PATH.write_text(text, encoding="utf-8")
    print("wrote styles-list.css")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
