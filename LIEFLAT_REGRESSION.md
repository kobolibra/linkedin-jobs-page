# Lieflat upgrade regression

Local preview: `http://127.0.0.1:4173/index.html?preview=lieflat-palm-01`

- `jobs.json` loads successfully with 4,509 visible jobs and 744 companies.
- Regional timeline renders three rows with JUN/JUL/AUG labels, vertical month boundaries, continuous crisp-edged cells, and a unified green/ochre/sage palette.
- Seven-day chart renders as vertical stacked columns with weekday labels and totals: Sun 20, Mon 56, Tue 112, Wed 98, Thu 118, Fri 130, Sat 22.
- Clicking a company name opens Company Insight in the right-hand sticky editorial card.
- Company Insight displays regional chips, four KPI values, age histogram, median/mean axis, facts and note without errors.
- Region filtering remains interactive after Company Insight is open; the company filter and visible job count remain wired through the existing `apply()` flow.
- No jobs.json edits were made; the only working tree changes are visual CSS, index resource versioning, and audit notes.

## Final GitHub Pages verification

The final deployed commit is `a15dca8`, with unique asset version `lieflat-palm-02`. The live screenshot shows the unified green/ochre/sage PALM adaptation, vertical seven-day stacked columns, regional time-density ribbons, and the restyled paper analytics plate. Clicking the first company on the live page opens the sticky Company Insight card with the new editorial panel styling. The browser annotations in the captured screenshot are inspection overlays only and are not part of the website.
