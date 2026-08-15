# Lieflat color strategy for linkedin-jobs-page

## Selected system: WIRE · mono + accent

After reviewing the lieflat chart catalog and the official `PORCELAIN`, `PALM`, and `WIRE` presets, the best fit is **WIRE** rather than a full multi-hue palette. WIRE is explicitly defined as `mono+accent`: grayscale carries all data and one orange accent creates a controlled visual focal point. Its canonical roles are `BG #F0F0EE`, `TXT #1F1E1C`, `MUT rgba(31,30,28,.60)`, `FAINT rgba(31,30,28,.32)`, `GRID rgba(31,30,28,.16)`, data `#22211F`, secondary gray `#8F8E86`, faint data `#C0BFB7`, and hero orange `#F5572F`.

## Why WIRE fits this website

The site has multiple ordered data structures: firstSeen time density, 30-day daily rhythm, company history, role-age distribution, and ranked job lists. These should not each receive a separate hue; grayscale gives them a consistent quantitative language. The site also needs one clear point of attention, which is best reserved for current-day/peak events, active filter states, and the most important KPI. This produces a deliberate editorial hierarchy rather than a collection of competing regional colors.

## Chart-to-color mapping

| Site element | Data shape | Visual encoding |
|---|---|---|
| Regional firstSeen timeline | ordered time density by region | neutral gray ladder per row; density = darkness/opacity; orange only for active region or selected boundary |
| 30-day rhythm | one daily reading | dark-gray line and stems; weekend hollow nodes; orange only for current day and the single peak |
| Company Insight | small company history, age buckets, region labels | charcoal panel, paper text, grayscale distributions; orange only for selected company/current metric |
| Filters and controls | interaction state | paper/ink neutrals; orange reserved for active/focus state, never used as a data series |
| Job list | repeated records and metadata | black hierarchy, soft gray support text, one orange status/active marker |

## Prohibited combinations

The implementation must not mix WIRE with Porcelain blue, PALM green/olive, forest green, mustard, or unrelated region hues. It must not use orange for every region or every chart. Orange is a single hero accent, not a categorical palette.

## Reference basis

The mapping follows the lieflat catalog contracts: L3/F2 are daily time-series candidates; L4 is a small categorical-by-categorical matrix; L14/L15 are small-unit composition patterns; and WIRE is the official grayscale-plus-one-accent system for editorial, restrained, magazine-like work.

## Local visual regression

The local live-data preview now uses WIRE: grayscale paper and ink across the page, gray regional density rows, a charcoal rhythm panel with a single orange current/peak focus, and a charcoal Company Insight panel where orange appears only on the selected/current metric. The region/company filters and the Company Insight interaction remain available on the real dataset.
