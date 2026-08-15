# Rhythm line verification

The local live-data preview now renders the second hero chart as a 30-day daily rhythm line. Each day contributes one real point from `seenAt(j)`, with a thin vertical projection to the baseline and a single connected editorial line. Weekdays render as filled dark-teal nodes; Saturdays and Sundays render as open nodes; the maximum observed day and the current day use the single amber emphasis color with numeric labels. The bottom axis shows the first day, midpoint, and current day in English month/day format.

The regional density ribbon remains unchanged in data logic and geometry. The revised global palette is restrained: warm paper background, blue-graphite ink, deep teal chart line, low-saturation sage auxiliaries, and one amber event color. The local page loads 4,509 jobs and 744 companies successfully.

## Final online verification

The GitHub Pages root URL with a fresh query now loads the new resource version `rhythm-line-01`. The live DOM confirms the heading `近 30 日新增`, a `.rhythm-svg` line chart, 30 date points from JUL 17 through AUG 15, and peak/current labels of 130 and 22. The previous seven-bar DOM is no longer present on the fresh root URL. The live screenshot shows the intended dark-teal line, filled weekday nodes, open weekend nodes, amber peak/current nodes, and vertical daily projections.
