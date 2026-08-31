#!/usr/bin/env python3
"""JD disclosure, v6 -- remove <details> entirely.

Evidence from three mobile screenshots
--------------------------------------
Who was indented, and who was not:

  no JD, with salary   湣打环球商业服务 / 法国兴业银行   not indented
  no JD                CMU OmniClear / Michael Page / CGTN / UBS   not indented
  has JD               HSBC / Standard Chartered / State Street    indented ~16px

The indent correlates strictly with "does this card have a JD", not with city or
salary. And in the expanded card the stacking order was:

  JD body  ->  company row  ->  city + arrow

The JD body jumped *above* the company name, while the arrow stayed in row 3 and
did rotate to a down-triangle (so the self-drawn arrow was working).

Diagnosis
---------
Both facts have a single cause. WebKit implements <details> with a shadow tree
and a <slot>: everything other than <summary> is placed inside an anonymous slot
wrapper. With display:contents on <details>, that anonymous wrapper -- not
.job-jd-text -- becomes the flex item. `order:7` is declared on .job-jd-text, so
it never reaches the wrapper, which therefore keeps the default order 0. Closed,
the wrapper is a zero-width item at the head of the row, and with the 8px
column-gap that is exactly the ~16px indent. Open, it carries the JD body to the
front of the row, above the company name. Only cards with a JD render a
<details>, which is why only those cards were affected.

Conclusion: `display:contents` on <details> cannot be relied on in WebKit, and no
amount of CSS tuning fixes it, because the box being laid out is a UA-generated
box we cannot select.

Fix
---
Drop <details>/<summary> from the DOM. Render a plain <button class=
"job-jd-toggle"> for the arrow and a sibling <div class="job-jd-text"> for the
body, toggled through aria-expanded by the existing delegated click handler in
app.js. No shadow DOM, no slots, so `order` is fully authoritative:

  mobile   toggle order 6 (row 3, next to city and salary), body order 9 (row 4)
  desktop  body order 9 with flex:1 1 100%, so it lands last on its own row

The arrow keeps a fixed 14x14 box and rotates via transform, so it turns in
place and can never change the line's metrics.

The old .job-jd rules are left in the stylesheet on purpose: with <details> gone
they match nothing, so removing them is unnecessary risk. The new rules are
appended after them, and the visibility of the body is driven by
`.job-jd-toggle[aria-expanded="true"] ~ .job-jd-text`.

Cache keys for app.js and styles-list.css are bumped, otherwise the browser will
keep serving the old pair and nothing will appear to change.
"""
import re
from pathlib import Path

CSS_PATH = Path("styles-list.css")
APP_PATH = Path("app.js")
SALARY_PATH = Path("salary-display.js")
HTML_PATH = Path("index.html")

CACHE_KEY = "jd-toggle-1"

# --------------------------------------------------------------------- app.js

TPL_OLD = (
    "(jdText?'<details class=\"job-jd\"><summary aria-label=\"展开职位描述\">"
    "</summary><div class=\"job-jd-text\">'+jdHtml+'</div></details>':'')"
)
TPL_NEW = (
    "(jdText?'<button type=\"button\" class=\"job-jd-toggle\" aria-expanded=\"false\" "
    "aria-label=\"展开职位描述\"></button><div class=\"job-jd-text\">'+jdHtml+'</div>':'')"
)

HANDLER_OLD = """  if(e.target.closest(".job-title")){reads.add(id);saveReads();card.classList.add("read");return;}
  const star=e.target.closest(".star");
"""
HANDLER_NEW = """  if(e.target.closest(".job-title")){reads.add(id);saveReads();card.classList.add("read");return;}
  const jdToggle=e.target.closest(".job-jd-toggle");
  if(jdToggle){e.preventDefault();const open=jdToggle.getAttribute("aria-expanded")==="true";jdToggle.setAttribute("aria-expanded",open?"false":"true");jdToggle.setAttribute("aria-label",open?"展开职位描述":"收起职位描述");return;}
  const star=e.target.closest(".star");
"""

# ------------------------------------------------------------------------ css

CSS_APPEND = """
/* JD disclosure without <details>. WebKit wraps non-<summary> content of
   <details> in an anonymous slot box that we cannot select, so `order` never
   reached the JD body: closed it added a phantom leading item (the company-name
   indent), open it carried the body to the front of the row. A plain button plus
   a sibling div removes the shadow DOM from the layout entirely. */
.job-jd-toggle { appearance:none;-webkit-appearance:none;background:none;border:0;padding:0;margin:0;cursor:pointer;color:var(--region,var(--navy));flex:0 0 auto;align-self:center;display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;-webkit-tap-highlight-color:transparent; }
.job-jd-toggle::before { content:"";display:block;width:0;height:0;border-left:5px solid currentColor;border-top:3.5px solid transparent;border-bottom:3.5px solid transparent;transform:rotate(0deg);transform-origin:center;transition:transform .18s ease; }
.job-jd-toggle[aria-expanded="true"]::before { transform:rotate(90deg); }
@media (prefers-reduced-motion:reduce) { .job-jd-toggle::before { transition:none; } }
.job-jd-text { display:none;flex:1 1 100%;order:9;width:100%;max-width:100%;min-width:0;margin-top:6px;color:var(--ink-soft);font-size:12px;line-height:1.5;white-space:normal;overflow-wrap:anywhere; }
.job-jd-toggle[aria-expanded="true"] ~ .job-jd-text { display:block; }
@media (max-width:720px) {
  .job-jd-toggle { order:6;margin-top:5px; }
  .job-jd-text { order:9;margin-top:6px; }
}
"""


def apply_block(text: str, old: str, new: str, label: str, expected: int = 1) -> str:
    if new in text:
        print(f"{label}: already applied, skipping")
        return text
    found = text.count(old)
    if found != expected:
        raise SystemExit(
            f"{label}: expected exactly {expected} match(es), found {found}; aborting"
        )
    print(f"{label}: patched")
    return text.replace(old, new)


def bump_cache(html: str, filename: str) -> str:
    pattern = re.compile(re.escape(filename) + r'(?:\?v=[^"\'\s>]*)?')
    if not pattern.search(html):
        raise SystemExit(f"cache bump: {filename} not referenced in index.html")
    return pattern.sub(f"{filename}?v={CACHE_KEY}", html)


def main() -> int:
    css = CSS_PATH.read_text(encoding="utf-8")
    app = APP_PATH.read_text(encoding="utf-8")
    salary = SALARY_PATH.read_text(encoding="utf-8")
    html = HTML_PATH.read_text(encoding="utf-8")
    before = (css, app, salary, html)

    # app.js: template + click handler
    app = apply_block(app, TPL_OLD, TPL_NEW, "job card JD markup")
    app = apply_block(app, HANDLER_OLD, HANDLER_NEW, "JD toggle click handler")

    # salary-display.js: the mobile badge anchored on the old .job-jd element
    if "querySelector('.job-jd-toggle')" in salary:
        print("salary badge anchor: already applied, skipping")
    else:
        found = salary.count("querySelector('.job-jd')")
        if found != 2:
            raise SystemExit(
                f"salary badge anchor: expected 2 matches, found {found}; aborting"
            )
        salary = salary.replace(
            "querySelector('.job-jd')", "querySelector('.job-jd-toggle')"
        )
        print("salary badge anchor: patched")

    # styles-list.css: append the new disclosure rules
    if ".job-jd-toggle" in css:
        print("JD toggle styles: already applied, skipping")
    else:
        css = css.rstrip("\n") + "\n" + CSS_APPEND
        print("JD toggle styles: appended")

    # index.html: cache keys
    if CACHE_KEY in html:
        print("cache keys: already applied, skipping")
    else:
        html = bump_cache(html, "app.js")
        html = bump_cache(html, "styles-list.css")
        print("cache keys: bumped")

    if (css, app, salary, html) == before:
        print("nothing to change")
        return 0
    for path, new_text, old_text in (
        (CSS_PATH, css, before[0]),
        (APP_PATH, app, before[1]),
        (SALARY_PATH, salary, before[2]),
        (HTML_PATH, html, before[3]),
    ):
        if new_text != old_text:
            path.write_text(new_text, encoding="utf-8")
            print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
