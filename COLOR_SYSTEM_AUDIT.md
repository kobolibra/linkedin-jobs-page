# Global color system audit

## Final roles

The site now uses one consolidated token block in `styles.css`. The canvas is warm paper (`--bg`), cards use an off-white paper surface (`--surface`), structure uses charcoal-green typography (`--ink`, `--ink-soft`, `--ink-faint`), and borders use paper-gray lines (`--line`, `--line-strong`). The high-weight data surface is `--panel`, with `--panel-ink`, `--panel-muted`, `--panel-line`, and `--panel-focus` controlling the second chart and Company Insight.

The three regional colors are fixed to the user-selected reference family: CN uses mustard (`--cn`), HK uses deep olive (`--hk`), and SG uses pale olive (`--sg`). These colors are used for regional density ribbons, region labels, filter active states, job initials, and region metadata. The fourth `other` state is a neutral gray-green fallback.

## Regression

The local live-data page renders the second chart as a forest-green panel and the Company Insight as the same panel surface. The page shows one consistent typography hierarchy: charcoal-green headline/body text, softened metadata, light panel text, and mustard reserved for active/peak/current states. A company row opens Company Insight successfully, and the company filter state remains functional.

The current dynamic data snapshot is 4,512 jobs and 752 companies; the data file was not edited by this color-only change. The browser's numbered boxes are inspection overlays, not website UI.

## Consolidation pass

The former top-level red/blue/green palette blocks and hard-coded regional literals were removed. The final color system now has one root token block and one dark-theme block at the top of `styles.css`; layout tokens such as radius, shadow, typography families, spacing, and caret remain intact. The old region literal scan is clean. Local visual regression still shows the three selected regional colors, the forest panel, and the Company Insight card with the intended text hierarchy.

## Final online check

The local final screenshot and live DOM show the expected values: background `#f1efe9`, ink `#3b443b`, CN `#d2a321`, HK `#78895f`, SG `#b4ad79`, and forest chart/Company Insight surface `rgb(63, 91, 60)`. The browser session used for visual inspection may retain the previous resource URL `region-colors-181-155-114`; the server-side deployment is versioned separately as `color-system-final-01`.

## Hybrid ceramic-blue palette regression

The new hybrid palette uses ceramic blue for typography and structure, muted green-yellow tones for CN/HK/SG, black-gray for density and scaffolding, and fluorescent orange only for peak/current/focus events. The real-data homepage and Quantcast Company Insight panel render with the same roles; company interaction remains functional.
