# Personal application tracking

## Product decisions and references

- [Huntr's job board](https://help.huntr.co/en/articles/13413245-the-job-board) separates saved jobs from submitted applications and supports interview rounds. We use Saved as the initial state and expose the English stages: Applied, Recruiter Contact, 1st Interview, 2nd Interview, Final Interview and Offer, plus No Response and Rejected outcomes.
- [Teal's tracker](https://help.tealhq.com/en/articles/14435727-how-to-track-your-job-applications) keeps stages with individual saved jobs. Here, progress belongs to the authenticated account and the existing saved-job identity, rather than the public posting lifecycle.
- [Huntr's metrics](https://huntr.co/product/job-search-metrics) distinguish the job-search funnel from current job status. Here, a closed LinkedIn listing never automatically rejects an application.
- [App Economy Insights](https://www.appeconomyinsights.com/p/how-to-analyze-an-income-statement) uses proportionate flows, direct numeric labels and distinct outcome colors. The application diagram follows those principles with blue regional sources and progression, green offers, grey waiting and no-response states, and red rejection branches. The visual hierarchy follows App Economy’s report composition: prominent regional identities on the left, a central total, a rising progression, descending outcomes, solid node caps, opaque curved ribbons, larger counts and smaller percentage labels. The figure has no decorative logo. The My Journey control and account menu use the Lucide Route icon (ISC), sized and weighted to match the existing interface; its license is preserved in licenses/lucide-route.txt. No artwork or charting dependency is copied.
- [An open-source job application tracker](https://github.com/waddington/job-application-tracker) demonstrates the value of interview-round detail and an application Sankey. This implementation uses the site's existing account infrastructure instead of introducing a separate tracking system.

## Interaction

Desktop: save a role, hover over the role's action capsule, then hover or click its progress label. The panel also opens with the keyboard. Mobile: swipe left on the saved role and select Application progress. Stage controls retain their focus after selection. Escape dismisses the panel.

My Journey is available in the account menu and as a compact unframed action when filtering to saved roles. It includes all favorites in the account, regardless of the other list filters. The action has no additional heading, promotional copy or bordered panel; it leaves the existing filter toolbar intact.

The diagram opens with a regional breakdown on the left: Mainland China, Hong Kong, Singapore and any Other / Unspecified records converge into the full Saved total. This is a composition of the total, like a product revenue breakdown; it is not a region filter. Counts and percentages use all saved roles. Region metadata reuses the existing job index, with a validated optional region snapshot on new stage events for records no longer in the index. No additional job-data request is made.

The diagram is generated on demand, without a remote chart service. The entire chart fits its viewport without horizontal or vertical panning. On touch devices held in portrait, the dialog itself opens as a landscape canvas by default; physically rotating the device switches to its native landscape dimensions automatically. This uses responsive CSS, without an orientation-lock permission or an extra rotate button. Compact geometry places outcome labels beside their endpoints to keep them clear of the main flow. A text breakdown is also available. Light, dark and reduced-motion preferences are supported.

## Data and interpretation

`applications` is an additional kind in the existing account preferences protocol. Each item is a validated, immutable JSON event (version, unique event ID, job ID, current stage, effective recorded path, timestamp and optional region snapshot). It fits the existing 500-character item limit. There is no database migration, public endpoint or additional identity store.

Events use the existing account-scoped durable outbox, authenticated delta reads, CSRF checks, idempotent operation IDs and bounded write batches. Stage events are append-only; destructive writes are rejected. Existing clients ignore the new kind while retaining server rows in their caches.

The latest event per job is chosen deterministically by timestamp and event ID. A local change advances beyond the latest known event even if the local clock has moved backward. Concurrent offline changes preserve both events; after merging, the deterministic latest event supplies the current state. This is not a server-ordered collaboration log.

Selecting a later stage adds that explicitly selected stage. It does not invent intermediate interviews. Selecting an earlier stage corrects the effective path by removing later stages from that path. No Response and Rejected retain the preceding path; No Response is only ever marked manually. Recruiter Contact sits after Applied and before 1st Interview. Reset to Saved clears the effective path while retaining all historical events. Removing a favorite excludes it from the chart but does not erase its progress; re-saving restores it. Expired listings remain trackable.

Each favorite contributes one unit to the diagram. The chart uses continuously curved ribbons, a gently rising application spine and downward outcome branches, with direct labels rather than cards or an enclosing chart frame. Unsubmitted, waiting and rejected roles branch from their last recorded stage. Current offers end at Offer. A separate Offer received branch appears only when other roles were closed after reaching Offer, so current offers and later closures remain distinct. Source, intermediate nodes and terminal nodes conserve the number of jobs. Current-stage totals are available separately; an intermediate stage's flow includes roles that subsequently progressed or were rejected.

## Validation

`node --test scripts/test_job_applications.mjs scripts/test_account_sync.mjs` covers exact paths, skipped rounds, rejection origins, corrections, history retention, deterministic merging, duplicate delivery, clock rollback, flow conservation, invalid events, offline reload, cross-account isolation and unchanged favorite deletion semantics.

The existing account boundary, public-asset, job action, hover and loading resilience suites remain applicable. The deployment gate includes the application and account-sync suites. Browser verification additionally checks desktop selection, hover, history, reload, mobile nested dialogs, chart layout, unchanged JD button coordinates and successful JD expansion. The viewport regression covers 1920×1080, 1440×900, 1366×768 and 1280×720, plus touch contexts at 390×844, 844×390 and 360×800. It asserts complete dialog bounds, no dialog/chart overflow, no clipped SVG text, default landscape rotation, native landscape after device rotation and a 44px close target. Run `python scripts/test_journey_viewports.py` with Playwright installed; set `JOURNEY_TEST_BROWSER=webkit` for the WebKit run. The fixture intercepts all network requests and writes no production data.
