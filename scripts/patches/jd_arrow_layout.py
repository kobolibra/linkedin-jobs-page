#!/usr/bin/env python3
"""JD arrow + job-card layout, v5 -- fixes the two real root causes.

Root cause A: the arrow could never be controlled from CSS
----------------------------------------------------------
app.js renders `<summary aria-label="展开职位描述"></summary>` -- completely
empty. The visible triangle is the browser's native disclosure marker, whose
box metrics and rotation are decided by the UA. Its width differs between the
closed and open state, which is what made it jump to the next line, and no
amount of flex tuning on <summary> can change that.

Fix: suppress the native marker (::marker and ::-webkit-details-marker), draw
the triangle ourselves in summary::before, and give <summary> a fixed 14x14 box.
A constant-size box makes reflow on toggle structurally impossible, and the
open state is a pure `transform:rotate(90deg)`, so the arrow turns in place
instead of moving.

Root cause B: the company-name indent
-------------------------------------
.job-jd got `display:contents` but no `order`. When display:contents fails on
<details> -- a known WebKit issue -- the element degrades into a regular flex
item with the default order 0, while the company name carries order 1. The
collapsed arrow box therefore lands *before* the company name, and together
with the 8px column-gap it reads exactly like a small indent. Only jobs that
have a JD render a <details>, which is why it affected many cards but not all.

Fix: give .job-jd an explicit order so it is correctly placed in row 3 whether
or not display:contents takes effect. This makes the layout independent of that
engine behaviour instead of relying on it.

Root cause C: an injected stylesheet was overriding the CSS file
---------------------------------------------------------------
salary-display.js appends a <style> to <head> at runtime, so it wins over
styles-list.css at equal specificity. It forced .job-sub back to
`white-space:normal; overflow:visible; text-overflow:clip`, cancelling the
single-line ellipsis the row-2 design depends on. That injected rule is patched
here too, and index.html's cache-busting query for the script is bumped so the
new JS is actually fetched.

All layout changes stay inside @media (max-width:720px) except the arrow rules,
which are intentionally shared so desktop and mobile behave identically.
"""
from pathlib import Path

CSS_PATH = Path("styles-list.css")
JS_PATH = Path("salary-display.js")
HTML_PATH = Path("index.html")

# ---------------------------------------------------------------- arrow (both)

SUMMARY_OLD = (
    ".job-jd summary { cursor:pointer;color:var(--region,var(--navy));"
    "font-size:11px;letter-spacing:.04em;flex:0 0 auto;align-self:baseline; }\n"
)

SUMMARY_NEW = """.job-jd summary { cursor:pointer;color:var(--region,var(--navy));flex:0 0 auto;align-self:center;display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;list-style:none;-webkit-tap-highlight-color:transparent; }
.job-jd summary::-webkit-details-marker { display:none; }
.job-jd summary::marker { content:""; }
.job-jd summary::before { content:"";display:block;width:0;height:0;border-left:5px solid currentColor;border-top:3.5px solid transparent;border-bottom:3.5px solid transparent;transform:rotate(0deg);transform-origin:center;transition:transform .18s var(--ease,ease); }
.job-jd[open] summary::before { transform:rotate(90deg); }
@media (prefers-reduced-motion:reduce) { .job-jd summary::before { transition:none; } }
"""

# ------------------------------------------------------------- mobile band

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

BAND_V4 = """  /* Three fixed rows: (1) title, (2) company left + age/region/star/ban right on
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

BAND_FINAL = """  /* Three fixed rows: (1) title, (2) company left + age/region/star/ban right on
     one line, (3) city / salary / JD arrow left, (4) JD body full width.
     .job-jd carries an explicit order so the card is laid out correctly even if
     display:contents does not take effect on <details>. */
  .job-meta-line { display:flex;flex-wrap:wrap;align-items:center;column-gap:8px;row-gap:0;min-width:0;margin-top:3px; }
  .job-meta-line::after { content:"";flex:1 1 100%;height:0;min-width:0;order:3; }
  .job-detail-line { display:contents;line-height:17px; }
  .job-right-mobile { order:2;align-self:center; }
  .job-city { flex:0 0 auto;order:4;align-self:center;min-width:0;max-width:100%;margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
  .job-city:empty { display:none; }
  .salary-ref-mobile { flex:0 0 auto;order:5;align-self:center;margin-top:5px;white-space:nowrap; }
  .salary-ref-mobile:empty { display:none; }
  .job-jd { display:contents;order:6;flex:0 1 auto;min-width:0;margin-top:5px; }
  .job-jd summary { order:6;margin-top:5px; }
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

# ------------------------------------------------- injected stylesheet in JS

JS_SUB_OLD = """      .job-sub{
        display:flex;
        align-items:baseline;
        gap:8px;
        white-space:normal;
        overflow:visible;
        text-overflow:clip;
      }
      .job-company-text{
        flex:1 1 auto;
        min-width:0;
        white-space:normal;
        overflow-wrap:break-word;
      }
"""

JS_SUB_NEW = """      .job-sub{
        display:flex;
        align-items:center;
        gap:6px;
        min-width:0;
        overflow:hidden;
      }
      .job-company-text{
        flex:0 1 auto;
        min-width:0;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
"""

JS_COMPACT_OLD = (
    "      body.compact .job-sub{white-space:normal;overflow:visible;"
    "text-overflow:clip}\n"
)
JS_COMPACT_NEW = "      body.compact .job-sub{overflow:hidden}\n"

HTML_OLD = "salary-display.js?v=wip-salary-1"
HTML_NEW = "salary-display.js?v=wip-salary-2"


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
    css = CSS_PATH.read_text(encoding="utf-8")
    js = JS_PATH.read_text(encoding="utf-8")
    html = HTML_PATH.read_text(encoding="utf-8")
    before = (css, js, html)

    css = apply_block(css, [SUMMARY_OLD], SUMMARY_NEW, "self-drawn JD arrow")
    css = apply_block(
        css, [BAND_V4, BAND_V3, BAND_V2], BAND_FINAL, "mobile three-row band"
    )
    css = apply_block(css, [SUB_V2], SUB_FINAL, "mobile .job-sub")
    css = apply_block(css, [RIGHT_V2], RIGHT_FINAL, "mobile .job-right-mobile")
    css = apply_block(css, [AGE_V2], AGE_FINAL, "mobile .age alignment")

    js = apply_block(js, [JS_SUB_OLD], JS_SUB_NEW, "injected .job-sub rule")
    js = apply_block(js, [JS_COMPACT_OLD], JS_COMPACT_NEW, "injected compact rule")

    html = apply_block(html, [HTML_OLD], HTML_NEW, "salary-display.js cache key")

    if (css, js, html) == before:
        print("nothing to change")
        return 0
    if css != before[0]:
        CSS_PATH.write_text(css, encoding="utf-8")
        print("wrote styles-list.css")
    if js != before[1]:
        JS_PATH.write_text(js, encoding="utf-8")
        print("wrote salary-display.js")
    if html != before[2]:
        HTML_PATH.write_text(html, encoding="utf-8")
        print("wrote index.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
