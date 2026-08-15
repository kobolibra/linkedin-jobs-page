# Lieflat Charts Design Audit

## Reference system

The lieflat-charts catalog requires template-first selection. For this site, the closest honest mappings are:

| Site data | Lieflat candidate | Why it fits |
|---|---|---|
| Regional firstSeen distribution | L3 Barcode Lollipop as the primary visual grammar, with L10 Radial Patchwork rejected because the data is a linear time axis rather than a 24-hour circular distribution | One record/window remains visible as a mark; density can be shown by darker categorical levels without inventing a conclusion |
| Seven-day activity by market | L4 Arc Matrix / F10 Dot Heat comparison; Arc Matrix is better for the current weekday × market matrix because it keeps the small categorical grid legible | A small categorical matrix with count encoded by shape/size and a restrained editorial grid |
| Company Insight history | L15/L2 unit-based editorial grammar plus F2/F5 basics for the small histogram and ranked values | Company-level detail needs record-level reading, explicit markers, and restrained annotations |

## Visual rules extracted from lieflat SKILL.md

The reference system prioritizes Lupi Editorial and Basics before Glance; it uses hand-built SVG for record-level charts, hairline guides, strong typographic hierarchy, no chart-library defaults, and a single color system per delivery. Mono is the fallback: paper gray plus charcoal with data encoded by opacity/value, no gradients or decorative glow. Color presets are allowed only as a unified palette. The gallery emphasizes environment structure—hairline rules, ledger-like guides, explicit source rows, and restrained labels—as much as the data marks.

The closest palette direction for this site is a custom editorial adaptation of the PALM preset: deep ink/coffee text, muted green as the data family, warm amber as the single attention accent, and paper gray background. Existing per-region red/gold/green should be retained only if it is rebuilt as a coherent categorical system with a single density ladder within each region.

## Current project audit

The project is a static HTML/CSS/JS site with jobs.json as the data source. Existing functionality includes search, region filtering, age filtering, company filtering, favorites, blocked companies/keywords, compact density mode, light/dark theme, Company Insight, and guestbook. Core chart hooks are in app.js: #dist is a firstSeen regional SVG timeline; #spark is the seven-day activity chart; Company Insight is split across company-insight.js and styles-company.css.

Current visual weaknesses are not data-logic failures. The regional chart has accumulated several overrides and its density encoding is difficult to read on paper background. The seven-day chart uses a compact stacked-bar treatment that is visually repetitive. Company Insight has useful data but a more generic panel grammar than the lieflat reference. The upgrade should therefore be structural and token-led rather than a cosmetic color swap.

## Guardrails

No jobs.json changes. Do not change firstSeen/pushTime semantics, filtering predicates, company grouping, or Company Insight event wiring. Keep the site static and preserve existing URLs and cache-busting. Use one unified editorial palette and make every chart's data encoding explicit through shape, value, and spacing—not narrative conclusions.

## Screenshot audit

The current live page is calm and legible but visually underpowered in the exact places that matter. The masthead has a strong paper/editorial foundation, yet the analytics card reads as two generic horizontal fields rather than a designed data plate. The regional timeline has thin, pale ribbons whose density hierarchy is still weak at a glance; the month boundaries are technically present but do not establish a strong visual calendar. The seven-day chart is seven near-identical horizontal strips, so market composition and day-to-day differences are hard to read. The toolbar and job feed are functional but visually detached from the analytics system. Company Insight is data-rich but needs a stronger editorial frame: a clearer company identity block, a more disciplined metric rail, and a chart treatment that feels native to the same visual language.

The next implementation should make the analytics card the visual anchor: stronger grid discipline, darker hairline structure, more intentional scale labels, a single coherent data palette, and a clear contrast between data marks and paper substrate. The page should remain restrained rather than decorative; the goal is a publication-quality data plate, not a colorful dashboard.
