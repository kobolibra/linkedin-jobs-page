# Homepage startup audit — 2026-11-04

Source reviewed: `4e118dedbbecdf3fdea6d9fd1b933616c0807bca` (current main when the audit began).

## Findings

The main avoidable delay was a request waterfall: HTML/CSS → account.js → session → account-sync.js → application scripts → local snapshot → deployment version → job index when needed. Even cached visits waited for code downloads and session-dependent script discovery before checking the snapshot. The 5,377,608-byte job index makes downloading it needlessly particularly expensive; this is the repository payload size, not a measured compressed transfer size.

The current implementation already has windowed list rendering, deferred JD partitions, bounded/idle-aware index retries, a versioned IndexedDB snapshot, nonblocking external font CSS, and guestbook prefetch deferred until the job request settles. These are retained. CSS and logos are public assets served without per-asset account database queries; changing the authentication gate or moving the site to Pages is unnecessary for this fix.

Some progressive appearance is deliberate: counters animate for 420 ms, charts have short reveal transitions, visits come from an independent external counter, and account preferences synchronize separately. Those do not all measure job-request latency. Their visual design and request semantics are unchanged.

## Change

- Discover existing application script URLs in the HTML head through preloads. Their execution order and authorization prerequisite are retained. Cache keys match the actual script requests; no data or protected sync module is publicly preloaded.
- Download account.js with `defer`, and prepare the existing loader concurrently with session checking. On server-marked signed-in pages, prepare the protected account-sync module concurrently as well, through its unchanged authenticated route. Guest pages never request it.
- Move the existing bounded index fetcher into job-store.js without changing its deadlines, retries, guest endpoint, or stream handling. After session confirmation and preference installation, start the index/cache request while UI scripts finish executing. app.js reuses this single promise.
- Read the local snapshot and check its deployment version concurrently. Only an exact valid version match can reuse a snapshot. A changed or unverifiable version requires a fresh request; no stale-first display is introduced. Guests bypass both the authenticated snapshot and its version endpoint.
- Coordinate the initial render with row/chart modules only. A slow optional guestbook module does not hold back the first job. This also ensures initial rendering uses the final chart implementation and installed row actions.

No job fields, ingestion pipeline, ordering, filters, statuses, salary history, JD position, account data model, API authorization, or presentation CSS change. Four runtime files change; total added runtime source is approximately 2.6 KB before compression, mainly preload declarations. No new dependency or data download is added. Cold authenticated visits additionally perform the small version request concurrently; unchanged visits avoid the full index download.

## Evidence

Isolated Chromium, actual application scripts and DOM, 8,000 synthetic jobs. Identical simulated delays: session 250 ms, JavaScript requests 200 ms, index 400 ms, version 150 ms. All requests intercepted; no production account was read or changed. DOM insertion timestamps use a MutationObserver rather than automation polling intervals.

| Milestone | Before | After | Difference |
| --- | ---: | ---: | ---: |
| Cold: first job inserted | 1,650 ms | 1,224 ms | −26% |
| Refresh: first job inserted | 1,170 ms | 743 ms | −36% |

These are controlled comparative measurements, not a promise of production latency on every device/network. The index request starts around 0.5 s instead of 0.95 s under those conditions. Fresh snapshot reuse still performs the required server version check.

65 targeted Node tests passed, plus 5 deployment-verifier tests. Added tests cover parallel validation, fresh/stale versions, denied storage, guest isolation and preload URL consistency. Existing streaming-download and security tests remain intact. Chromium and WebKit viewport/interaction regression passed: JD expansion and coordinates, favorites, application history, desktop fit and default landscape phone chart. Separate real-browser startup checks exercise a two-second guestbook delay, exactly one initial index request, unchanged-refresh reuse, changed-version reload, guest endpoint separation and no eager JD downloads.

The older `test_ui_presentation.mjs` has two pre-existing stale checks (an old MSN avatar and superseded cache keys); running it against the current source also fails those checks. This patch does not alter the avatar or unrelated presentation tests.

## Remaining constraints

An uncached authenticated visit still needs the complete index. Reducing that further would require a separate compact overview or server-side index pagination, with careful validation of complete filters, statistics, search, favorites and history. That broader data redesign is deliberately outside this scoped fix. External font swaps and the external visits service can still finish separately. Live browser inspection reached the page but could not provide a reliable production performance trace in this tool session; deployment verification and controlled browser results must not be described as measured production speed.
