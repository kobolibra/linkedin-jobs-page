# Personal application tracking

## Product decisions and references

- [Huntr's job board](https://help.huntr.co/en/articles/13413245-the-job-board) separates saved jobs from submitted applications and supports interview rounds. We use Saved as the initial state and expose the requested six English stages.
- [Teal's tracker](https://help.tealhq.com/en/articles/14435727-how-to-track-your-job-applications) keeps stages with individual saved jobs. Here, progress belongs to the authenticated account and the existing saved-job identity, rather than the public posting lifecycle.
- [Huntr's metrics](https://huntr.co/product/job-search-metrics) distinguish the job-search funnel from current job status. Here, a closed LinkedIn listing never automatically rejects an application.
- [App Economy Insights](https://www.appeconomyinsights.com/p/how-to-analyze-an-income-statement) uses proportionate flows, direct numeric labels and distinct outcome colors. The application diagram follows those principles with a restrained blue progression, green offers, neutral waiting states and terracotta rejection branches. No artwork or charting dependency is copied.
- [An open-source job application tracker](https://github.com/waddington/job-application-tracker) demonstrates the value of interview-round detail and an application Sankey. This implementation uses the site's existing account infrastructure instead of introducing a separate tracking system.

## Interaction

Desktop: save a role, hover over the role's action capsule, then hover or click its progress label. The panel also opens with the keyboard. Mobile: swipe left on the saved role and select Application progress. Stage controls retain their focus after selection. Escape dismisses the panel.

My Journey is available in the account menu and in a dedicated summary strip when filtering to saved roles. It includes all favorites in the account, regardless of the other list filters. The strip leaves the existing filter toolbar intact.

The diagram is generated on demand, without a remote chart service. Mobile users can scroll the chart horizontally; a text breakdown is also available. Light, dark and reduced-motion preferences are supported.

## Data and interpretation

`applications` is an additional kind in the existing account preferences protocol. Each item is a validated, immutable JSON event (version, unique event ID, job ID, current stage, effective recorded path and timestamp). It fits the existing 500-character item limit. There is no database migration, public endpoint or additional identity store.

Events use the existing account-scoped durable outbox, authenticated delta reads, CSRF checks, idempotent operation IDs and bounded write batches. Stage events are append-only; destructive writes are rejected. Existing clients ignore the new kind while retaining server rows in their caches.

The latest event per job is chosen deterministically by timestamp and event ID. A local change advances beyond the latest known event even if the local clock has moved backward. Concurrent offline changes preserve both events; after merging, the deterministic latest event supplies the current state. This is not a server-ordered collaboration log.

Selecting a later stage adds that explicitly selected stage. It does not invent intermediate interviews. Selecting an earlier stage corrects the effective path by removing later stages from that path. Rejected retains the preceding path. Reset to Saved clears the effective path while retaining all historical events. Removing a favorite excludes it from the chart but does not erase its progress; re-saving restores it. Expired listings remain trackable.

Each favorite contributes one unit to the diagram. Unsubmitted, waiting and rejected roles branch from their last recorded stage. Current offers terminate at Offer received. Source, intermediate nodes and terminal nodes conserve the number of jobs. Current-stage totals are available separately; an intermediate stage's flow includes roles that subsequently progressed or were rejected.

## Validation

`node --test scripts/test_job_applications.mjs scripts/test_account_sync.mjs` covers exact paths, skipped rounds, rejection origins, corrections, history retention, deterministic merging, duplicate delivery, clock rollback, flow conservation, invalid events, offline reload, cross-account isolation and unchanged favorite deletion semantics.

The existing account boundary, public-asset, job action, hover and loading resilience suites remain applicable. The deployment gate includes the application and account-sync suites. Browser verification additionally checks desktop selection, hover, history, reload, mobile nested dialogs, chart layout, unchanged JD button coordinates and successful JD expansion.
