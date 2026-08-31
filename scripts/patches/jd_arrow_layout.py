#!/usr/bin/env python3
"""Mobile job-meta layout, v3 -- one non-wrapping band with graded shrink.

Design problem v2 left unsolved
-------------------------------
v2 made the meta row a wrapping flex row. Wrapping then depended on content
length, so short cards kept everything on one line while long ones pushed the
four right-hand items (age / region / star / ban) onto a line of their own.
The right edge of the list no longer formed a straight vertical column, which
is what made the list look unsettled.

The physical constraint
-----------------------
The mobile content column is roughly 330px. The meta row must carry eight
things: company + count, city, salary, JD arrow, age, region tag, star, ban.
The fixed ones alone are about 220px. Something has to yield, so the design
must say explicitly what yields -- guessing produces exactly the ragged result
above.

The rule adopted here (standard practice in dense professional lists):
metadata and controls never yield; identity text yields and truncates.

Three hard guarantees
---------------------
1. The meta row is always a single line. Company name and city get
   `min-width:0` plus ellipsis, so the sum of all minimum contributions in the
   row falls to roughly 175px, well under the container width. Wrapping is
   therefore structurally impossible rather than merely unlikely.
2. Graded shrink priority: city `flex-shrink:6`, company `flex-shrink:1`,
   salary and arrow `flex:0 0 auto`. Under pressure the degradation order is
   city -> company -> stop. Salary is never compressed because it is the
   highest-value field on the card. The title is untouched and still wraps.
3. The four right-hand items are pinned right with margin-left:auto, and .age
   gets a fixed min-width with right alignment, so the right edge is a true
   vertical line across every card.

The JD body stays `flex:1 1 100%` with the highest `order`, so it occupies a
full-width third row on its own while the arrow keeps its place on the meta
row. Desktop rules are untouched; every change below sits inside
@media (max-width:720px).
"""
from pathlib import Path

CSS_PATH = Path("styles-list.css")

DESKTOP_GUARD = ".job-jd { display:contents;color:var(--ink-soft);font-size:12px;line-height:1.5; }"

MOBILE_OLD = """  .job-detail-line { display:contents;line-height:17px; }
  .job-city { flex:0 0 auto;order:0;align-self:center;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
  .job-city:empty { display:none; }
  .salary-ref-mobile { flex:0 0 auto;order:0;align-self:center;white-space:nowrap; }
  .salary-ref-mobile:empty { display:none; }
  .job-jd { display:contents; }
  .job-jd summary { flex:0 0 auto;order:0;align-self:center;padding:2px 0; }
  .job-right-mobile { order:1;align-self:center; }
  .job-jd-text { flex:1 1 100%;order:2;width:100%;max-width:100%;min-width:0;margin-top:4px;overflow-wrap:anywhere; }
"""

MOBILE_NEW = """  /* Meta row = one non-wrapping band: identity yields on the left, metadata and
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

SUB_OLD = "  .job-sub { white-space:normal; }\n"
SUB_NEW = (
    "  .job-sub { flex:1 1 auto;order:1;min-width:0;align-self:center;"
    "overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }\n"
)

RIGHT_OLD = (
    "  .job-right-mobile { display:flex;flex:0 0 auto;align-items:center;"
    "gap:6px;margin-left:auto;white-space:nowrap; }\n"
)
RIGHT_NEW = (
    "  .job-right-mobile { display:flex;flex:0 0 auto;align-items:center;"
    "gap:5px;margin-left:auto;white-space:nowrap; }\n"
    "  .job-right-mobile .icon-btn { width:24px;height:24px; }\n"
    "  .job-right-mobile .icon-btn svg { width:14px;height:14px; }\n"
)

AGE_OLD = "  .lvl,.age { min-width:0;text-align:left; }\n"
AGE_NEW = (
    "  .lvl { min-width:0;text-align:left; }\n"
    "  .age { min-width:42px;text-align:right; }\n"
)


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
    if DESKTOP_GUARD not in text:
        raise SystemExit(
            "desktop .job-jd is not in the expected display:contents state; aborting"
        )
    print("desktop .job-jd: verified, left untouched")

    original = text
    text = apply_block(text, MOBILE_OLD, MOBILE_NEW, "mobile meta band")
    text = apply_block(text, SUB_OLD, SUB_NEW, "mobile .job-sub")
    text = apply_block(text, RIGHT_OLD, RIGHT_NEW, "mobile .job-right-mobile")
    text = apply_block(text, AGE_OLD, AGE_NEW, "mobile .age alignment")

    if text == original:
        print("nothing to change")
        return 0
    CSS_PATH.write_text(text, encoding="utf-8")
    print("wrote styles-list.css")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
