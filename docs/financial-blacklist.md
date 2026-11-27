# Financial and recruitment protection list

`financial_blacklist.json` is the sole maintained employer-type classification
source and the protection list for the company analysis and RSS publication paths. Protection applies to every name regardless of
`employerType`. The RSS effective deletion set is the cumulative target list
minus the protection list. The n8n blocklist has its own inputs.

Each entry preserves the original `company` string. Matching continues to
apply Unicode NFKC, case folding and whitespace normalization. Keep original
spellings and order during the migration. Spelling variants that normalize to
the same key must share a type. When evidence establishes other aliases,
document the connection and keep their types aligned without adding new name
matching rules.

| employerType | Meaning for a future display filter |
| --- | --- |
| `direct_employer` | The identified organization operates its own business or institution and primarily hires for its own operations. Its posts are candidates for a company-level direct-employer view. |
| `recruitment_agency` | Recruiting for clients is a core service, including executive search, staffing, labor dispatch and recruitment process outsourcing. The company can also hire its own staff. |
| `recruitment_platform` | The identified brand mainly runs a marketplace or job board. The display name alone does not identify the ultimate employer. |
| `mixed` | Legacy compatibility only; do not assign to new or reviewed records. Third-party staffing, placement, RPO or EOR businesses warrant `recruitment_agency` when that is the publisher's core business. Incidental service lines of a direct operating business are insufficient. |
| `unknown` | Evidence is missing, conflicting or does not resolve the exact entity or service. Keep it out of a strict direct-employer view. |

The live display has two mutually exclusive scopes: Direct includes only
`direct_employer`; Agency includes every other classification and unmatched
publishers. The label is a display grouping, not proof that an unresolved
publisher is an agency. Full includes both scopes.

HR consulting, payroll software and managed services do not by themselves
establish recruiting for clients. Publishers primarily providing third-party recruitment or labor supply are
classified as agency rather than mixed. For corporate services, fund
administration and consulting businesses, assess the principal business and
actual publisher vacancies; a secondary staffing service is not sufficient
to classify the whole company as agency. Preserve expressly
requester-confirmed classifications (including VISTRA and Apex Group Ltd as direct), with their
evidence basis; do not extrapolate those exceptions to other employers. Choose a type using evidence of the
organization's services and identity. Financial institution names, brand
fragments and search hits with a similar spelling alone are insufficient.

For each verified classification store `evidence.url` (a source for the
specific entity), `evidence.reviewedOn` (ISO date) and `evidence.note` (the
supported claim and any identity mapping). Prefer the organization's website,
regulatory register, filing or company-maintained LinkedIn page. An `unknown`
with evidence records an inconclusive check. For an inconclusive search
without a reliable source, `review` records the date, query and specific
reason. An `unknown` without either field is pending. Remove the
inconclusive `review` after a type has been established. Publishers outside the
protection list have no maintained employer type; absence is not a type or a
reason to add protection. For
a classification confirmed by the project requester,
`evidence.basis` is `requester_confirmation`. The note states which part
is supplied by that confirmation and what the linked source supports.

## Explicit requester exclusions

An exact company name in the cumulative target ledger with reason
`用户指定排除（不再核验）` is an explicit requester decision, not an AI
industry determination. Remove any conflicting unresolved protection record
through a reviewed PR. Publication continues to use the normal cumulative
target filter. Discovery and atomic review skip these companies, and the
agent may not overwrite their requester decision. Confirmed protection
records cannot be removed by this exception.

## Agent write contract

Scheduled TRAE runs must use the canonical atomic `apply-review` entrypoint in
[the scheduler contract](trae-company-review.md). It checkpoints discoveries and
commits verified decisions, historical ledgers and investigation progress together.
The legacy commands below describe manual compatibility workflows, not scheduled
TRAE writes.

Refresh both `auto-daily-companies.py` and `reclassify.py` together in any
external Agent checkout (including persistent copies under `/workspace`)
before enabling writes against the migrated branch. Continue using
`auto-daily-companies.py` for daily reports and `reclassify.py --finalize`
for verified company reports. For a new protected name pass
`--blacklist-records` with a JSON array of typed records. For example:

```sh
python reclassify.py --date 2026-11-26 --finalize \
  --blacklist-records '[{"company":"New verified protected name","employerType":"unknown"}]'
```

The older `--blacklist NAME ...` argument still records new names as
`unknown` for compatibility. Routine Agent operation must use typed additions
with evidence (or an explicit inconclusive review) and the current writer for
the complete atomic transaction. A protected name is added only when it
qualifies under the existing protection rules, independent of its employer type.
Keep existing records and their evidence intact. Do not regenerate the
file from a list of company strings or reconstructed reports. Submit evidence
or type corrections to existing rows for review. Readers accept the legacy
string array when replaying older checkouts; the schema check rejects a
string array on pull requests and reports a downgrade if an external writer
pushes directly to `main`. A required check and rules against bypass on
`main` are needed to prevent direct writers from bypassing this check.

## Single classification source

The 23 homepage publishers explicitly selected by the project requester were
added to `financial_blacklist.json` with their existing types and evidence:
19 traditional finance and investment companies plus Dow Jones, Alibaba Group,
Baidu, Inc., and Tencent. The original 1,176 rows and these 23 additions are
retained; the migration baseline has 1,199 rows and 1,197 normalized keys.

The previously introduced classification-only file has been retired. Its 61
other publishers are not added to the protection list: classification alone
must never confer protection or change an existing deletion decision. Their
historical research remains available in PR #295 and Git history. Do not
recreate, read or maintain a second employer-type registry. A future
display-only filter must treat any unmatched publisher as unclassified,
never assume direct employment, and leave canonical deletion rules unchanged.

## Company investigation progress

`reports/employer-review-status.json` tracks research progress only; it is not a runtime classification source. It combines current unknown/unlisted employers, historical daily reports marked `待查证`, staging/canonical coverage gaps, and unresolved work carried forward after jobs expire.

Build it after the daily company report:

```sh
python scripts/company_review_queue.py --write
```

Each queue row must distinguish `verified`, `inconclusive` (actual research completed but evidence remains insufficient), and `not_started`. Merge actual research with `--apply-results`; a verified delete decision requires industry evidence, and a verified protection decision requires a typed record with evidence. Applying a research result does not itself change runtime classification.

For scheduled TRAE research, use `apply-review --results FILE` to atomically persist both classification and investigation progress, including historical or staging-only companies. Existing protected type corrections require the reviewed PR process. Manual legacy commands are not a complete transaction for research progress. Never reconstruct `company_employer_types.json` from this progress file.

## Coverage audit

Run `python scripts/audit_employer_types.py` against a checkout with
`jobs.json`. Add `--pending` for the review queue, ordered by the number of jobs that
count toward the public homepage. Publishers are matched using
`jobs[].company` and the protection list's existing normalization.
`website` reports coverage against the sole protection list. `unlisted` is a
coverage-audit status for unmatched publishers, not an allowed stored
`employerType`. The review queue does not authorize adding those publishers.
`companyCanonical`, `requestedCompany` and LinkedIn profile links can help
resolve identity where present. Source and job status fields describe ingestion
and availability, respectively. Company classification and the available job
fields do not prove who posted an individual job or the ultimate employing
organization. A future strict direct-employer filter should only include matched
`direct_employer` records; unresolved or unlisted publishers must not be
silently classified as direct employers. The full unfiltered view remains available.

At the 2026-11-26 baseline (`ca8c716c4ab4ad549ac6df880dbbfbaa79c38bf9`),
all 1,176 original records and their order were preserved. There were 1,174
normalized original keys before the 23 requester-selected additions. `BAH Partners` / `Bah Partners` and `BOSS直聘` /
`Boss直聘` share their respective types and evidence.

The following historical coverage snapshot is for the protection list after
its 23 authorized additions, not the retired combined registry. Re-run the audit
for current counts as jobs and protected names change.

| 2026-11-26 snapshot | All canonical jobs | Explicitly active | Website homepage |
| --- | ---: | ---: | ---: |
| Jobs | 15,064 | 5,739 | 6,300 |
| Company keys | 913 | 488 | 550 |
| Company keys matching the protection list | 640 | 455 | 489 |
| Jobs matching the protection list | 14,695 | 5,705 | 6,218 |
| Jobs with an evidenced type other than unknown | 14,689 | 5,705 | 6,218 |
| Jobs matching an unknown record | 6 | 0 | 0 |
| Jobs with no record | 369 | 34 | 82 |
| Company keys with no record | 273 | 33 | 61 |

The live public preview and the pinned homepage build both returned 550
companies and 6,300 jobs. The homepage uses eligible CN/HK/SG LinkedIn rows
in `jobs-index.json` and counts every row whose status is not `expired`.
The 561 rows without `jobStatus` are eligible on this snapshot and add
62 company keys. The canonical explicit-active column instead requires
`jobStatus == "active"`.

At this historical snapshot all 489 protection-list names appearing in the
homepage metric were classified. In the full protection list, 1181 records
were classified and 18 remained unknown; all 18 had inconclusive reviews.
In the canonical snapshot, 6,812 records have `companyCanonical` and
`requestedCompany`, and 10,100 have `companyLogoSource`. No job has an
`employerType` or `jobPoster` field.

## Serialized publication and write safeguards

All pushes affecting RSS staging, cumulative targets, employer classifications, or frontend assets enter `deploy.yml`, which owns the `cloudflare-site` concurrency group across reconciliation, canonical commit, verified asset build, and Cloudflare deployment. The former RSS workflow is a manual compatibility dispatcher only. The publication watermark records exact SHA-256 inputs and the Git commit containing the last verified classification file; it is not a second classification source. Unprocessed inputs require reconciliation even if a pending workflow was replaced by a UI push. A source change during frozen RSS/Logo processing aborts the obsolete merge, and the deploy gate rejects unprocessed inputs after any main refresh. The latest queued run reprocesses current main. A no-diff canonical publication still reaches the deployment gate. JobSpy snapshots continue to be merged on the next RSS publication.

Schema validation and deployment compare the proposed typed blacklist against the last verified version, rejecting missing original records, confirmed-to-unresolved downgrades, and removed evidence. The current Agent writer also validates its proposed typed change before writing. Intentional removal/downgrade requires an explicitly reviewed maintenance change to the policy and validation baseline. This prevents malformed or destructive classification data from going live even if a direct main push bypasses the standalone schema job. It does not substitute for GitHub repository-level branch/ruleset enforcement; configure path-specific restrictions or a reviewed Agent PR path with a trusted workflow bypass before claiming that bad commits cannot enter main.

## External TRAE scheduler

Use the single [TRAE scheduler entrypoint](trae-company-review.md). Every scheduled run checks out fresh main, pins and hashes the actual code, isolates local outputs from /workspace, and refuses changed or stale code. The existing external config supplies credentials only. Run the daily report, review queue and all subsequent business commands via the pinned entrypoint; publish the execution audit without credentials. Never use the old workspace script copies or legacy --blacklist in TRAE.
