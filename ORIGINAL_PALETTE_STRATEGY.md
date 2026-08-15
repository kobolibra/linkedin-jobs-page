# Original palette strategy — Dusk Ledger

## Design intent

The page is a finance-careers data product, so the palette must feel editorial and analytical rather than decorative. The chosen direction is a warm paper canvas with a deep blue-green ink system, one cool data family, and two controlled regional/event colors. It is intentionally neither a preset clone nor a rainbow dashboard.

## Palette roles

| Role | Token | Use |
|---|---|---|
| Paper | `#F4F0E9` | 78–84% of visible area; page background and light cards |
| Ink | `#18343A` | 10–14%; headings, primary data, rules, controls |
| Deep panel | `#214A4A` | high-weight rhythm and Company Insight surfaces only |
| Data teal | `#39736D` | primary line, ordered density, active data |
| Pale celadon | `#A8C7BB` | quiet/low density, tracks, secondary distributions |
| Stone gray | `#8C9690` | metadata, axis, low hierarchy |
| Region clay | `#C27658` | CN region encoding and selected regional emphasis |
| Region brass | `#C3A45D` | HK region encoding and key quantitative event |
| Region celadon | `#7FA69A` | SG region encoding |
| Event highlight | `#D68B45` | one chart peak/current point and active interaction only |
| Panel ink | `#F4F0E9` | text on deep panels |

## Proportion rules

Paper remains dominant. Deep panel is limited to the right-hand rhythm chart and Company Insight. Region colors are only used when a region is the data dimension; they never color ordinary text, buttons, or unrelated chart series. The event highlight is not a fourth category: it marks one peak/current observation at a time. All support lines and metadata remain neutral stone/ink.

## Why this is more appropriate

The palette separates three visual jobs that prior attempts conflated: structure uses deep blue-green ink; ordered data uses the teal lightness ladder; categorical region identity uses three restrained colors with different hue families; and attention uses one warm highlight. This gives the page a memorable signature while preventing every chart from becoming equally loud.

## Local visual regression

The live-data preview shows the Dusk Ledger system as intended: warm porcelain paper dominates; the rhythm chart and Company Insight use a deep blue-green panel; teal carries the ordered time-series data; CN/HK/SG use restrained clay, brass, and celadon accents; terracotta is reserved for peak/current/focus events. The page remains readable and the Company Insight panel opens on real company data.

Company Insight regression passed: clicking the real Quantcast company surface opens a deep blue-green panel with warm paper typography, muted celadon metrics, restrained regional labels, and terracotta emphasis on the selected/current value. No interaction logic changed.
