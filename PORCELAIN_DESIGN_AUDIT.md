# Porcelain · 青瓷蓝 design audit

## Reference basis

The `lieflat-charts` Porcelain preset defines a single-hue blue system in which lightness carries ordered data. Its canonical roles are `BG #F7F2EB`, `TXT #081F5C`, `MUT rgba(8,31,92,.60)`, `LAB rgba(8,31,92,.72)`, `FAINT rgba(8,31,92,.32)`, `FLOOR rgba(8,31,92,.24)`, `QUIET rgba(8,31,92,.15)`, `TRACK rgba(8,31,92,.12)`, `GRID rgba(8,31,92,.16)`, `DATA #334EAC`, `DATA2 #7096D1`, `HERO #081F5C`, and `FAINTDATA #BAD6EB`. Its four ordered data levels are `#081F5C`, `#334EAC`, `#7096D1`, and `#BAD6EB`.

The reference report applies the system consistently: warm porcelain paper background, deep ink-blue typography, blue data lines and marks, faint blue-gray rules, and lightness rather than unrelated hues for ordered values. It also uses a clear editorial hierarchy: high-contrast title/section rules, restrained metadata, tabular numerals, and no unrelated green/olive/mustard palette.

## Current project issues

The current project still contains the previous forest/olive/mustard system and dark-theme variants, including `--panel`, `--cn`, `--hk`, `--sg`, old region overrides, and hard-coded forest surface rules. That language conflicts with Porcelain because it introduces multiple hue families and makes regional color compete with ordered time-density encoding.

## Implementation boundary

The redesign will preserve all data calculations, `jobs.json`, filters, Company Insight events, and responsive layout. It will replace the visual roles only: background, text, structure lines, chart tracks, ordered density ramps, rhythm line/points, panel surface, region chips, controls, and Company Insight. The regional colors will become Porcelain-compatible blue levels derived from the canonical blue family, not three unrelated hues. The dark theme will use the Porcelain `DARK` family rather than forest green.

## Local visual regression

The local live-data preview now renders the Porcelain system: porcelain paper background, deep ink-blue title and metrics, blue ordered density bands in the regional timeline, a deep porcelain-blue 30-day rhythm panel, and a matching deep-blue Company Insight panel. CN/HK/SG are represented by ordered blue levels rather than unrelated hues. A real company click opens Company Insight successfully, and the job list/filter controls remain available.
