# Financial and recruitment protection list

`financial_blacklist.json` is a protection list for the company analysis and
RSS publication paths. Protection applies to every name regardless of
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
| `mixed` | Material recruitment, staffing, employer-of-record or workforce outsourcing services coexist with substantial other business lines. Keep the role of this organization unclassified at the individual posting level. |
| `unknown` | Evidence is missing, conflicting or does not resolve the exact entity or service. Keep it out of a strict direct-employer view. |

HR consulting, payroll software and managed services do not by themselves
establish recruiting for clients. Choose a type using evidence of the
organization's services and identity. Financial institution names, brand
fragments and search hits with a similar spelling alone are insufficient.

For each verified classification store `evidence.url` (a source for the
specific entity), `evidence.reviewedOn` (ISO date) and `evidence.note` (the
supported claim and any identity mapping). Prefer the organization's website,
regulatory register, filing or company-maintained LinkedIn page. An `unknown`
with evidence records an inconclusive check. An `unknown` without evidence
means review is pending. Unlisted publishers are tracked separately.

## Agent write contract

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
`unknown`. Use the current writer for the complete atomic transaction.
Keep existing records and their evidence intact. Do not regenerate the
file from a list of company strings or reconstructed reports. Submit evidence
or type corrections to existing rows for review. Readers accept the legacy
string array when replaying older checkouts; the schema check rejects a
string array on pull requests and reports a downgrade if an external writer
pushes directly to `main`. A required check and rules against bypass on
`main` are needed to prevent direct writers from bypassing this check.

## Coverage audit

Run `python scripts/audit_employer_types.py` against a checkout with
`jobs.json`. Add `--pending` for the review queue. Counts use only
`jobs[].company` and the protection list's existing normalization.
`companyCanonical`, `requestedCompany` and LinkedIn profile links can help
resolve identity where present. Source and job status fields describe ingestion
and availability, respectively. Company classification and the available job
fields do not prove who posted an individual job or the ultimate employing
organization. A future webpage filter needs coverage outside this list and a
decision about how to display unresolved publishers.

At the 2026-11-26 baseline (`ca8c716c4ab4ad549ac6df880dbbfbaa79c38bf9`),
all 1,176 original records and their order were preserved. There are 1,174
normalized keys. `BAH Partners` / `Bah Partners` and `BOSS直聘` /
`Boss直聘` share their respective types and evidence.

| 2026-11-26 snapshot | All jobs | Explicitly active jobs |
| --- | ---: | ---: |
| Jobs | 15,064 | 5,739 |
| Company keys | 913 | 488 |
| Jobs matching the protection list | 14,653 | 5,692 |
| Jobs with an evidenced type other than unknown | 13,254 | 5,199 |
| Jobs matching an unknown record | 1,399 | 493 |
| Jobs with no record | 411 | 47 |
| Company keys with no record | 296 | 42 |

The first batch resolves 234 records. Of the 942 unknown records, one has an
inconclusive source and 941 await evidence. The 561 records with no
`jobStatus` are included in the all-jobs column. In the same jobs snapshot,
6,812 records have `companyCanonical` and `requestedCompany` and 10,100
have `companyLogoSource`. No job has an `employerType` or `jobPoster` field.
