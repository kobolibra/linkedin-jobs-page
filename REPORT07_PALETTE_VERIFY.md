# report-07 palette verification

The local live-data preview now uses a warm gray paper background, deep forest green for the high-weight second chart and Company Insight, olive/sage for secondary data, charcoal-green typography, and mustard only for current/peak states and active accents.

The second chart remains the verified 30-day rhythm line. The Company Insight card now uses the same forest green surface as the second chart, with light text, sage bars, olive mid-state bars, and mustard key values. Regional ribbons continue to use the same restrained family rather than introducing unrelated hues.

Local data still loads with 4,509 jobs and 744 companies. Company Insight opens from a company row without errors. The browser screenshot annotations are inspection overlays and are not website UI.

## Final deployment check

The GitHub Pages server now serves `report07-palette-01` for all CSS and JavaScript assets. The live entry contains `近 30 日新增`, the forest-green chart surface rule, and the warm paper token. A previously opened browser session may continue showing the old `rhythm-line-01` resource URLs until a fresh session or hard reload; the server-side curl verification confirms the new version is deployed.
