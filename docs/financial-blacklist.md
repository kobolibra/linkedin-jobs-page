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
means review is pending. Unlisted publishers are tracked separately. For
a classification confirmed by the project requester,
`evidence.basis` is `requester_confirmation`. The note states which part
is supplied by that confirmation and what the linked source supports.

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

## Classification-only records

`company_employer_types.json` uses the same record and evidence format. It
covers the 84 other homepage publishers from the pinned 2026-11-26 snapshot.
These names have no membership in the protection list. Classifications for
them do not affect any Agent or RSS exclusion. A future display filter can
look up both files using the same normalization. When a name later appears
in both, a classified protection-list record takes precedence over the
classification-only record.

Of these 84 publishers, 70 are direct employers, 12 are recruiters, one is a
recruitment platform and one has mixed operations. Together both files cover
all 550 keys and 6,300 jobs in the homepage metric. Across the homepage the
types are 360 direct employers, 173 recruitment agencies, two recruitment
platforms and 15 mixed businesses.

## Coverage audit

Run `python scripts/audit_employer_types.py` against a checkout with
`jobs.json`. Add `--pending` for the review queue, ordered by the number of jobs that
count toward the public homepage. Publishers are matched using
`jobs[].company` and the protection list's existing normalization.
`website` reports the protection-list intersection.
`websiteIncludingOtherEmployers` reports combined classification coverage.
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

| 2026-11-26 snapshot | All canonical jobs | Explicitly active | Website homepage |
| --- | ---: | ---: | ---: |
| Jobs | 15,064 | 5,739 | 6,300 |
| Company keys | 913 | 488 | 550 |
| Company keys matching the protection list | 617 | 446 | 466 |
| Jobs matching the protection list | 14,653 | 5,692 | 6,185 |
| Jobs with an evidenced type other than unknown | 14,550 | 5,692 | 6,185 |
| Jobs matching an unknown record | 103 | 0 | 0 |
| Jobs with no record | 411 | 47 | 115 |
| Company keys with no record | 296 | 42 | 84 |

The live public preview and the pinned homepage build both returned 550
companies and 6,300 jobs. The homepage uses eligible CN/HK/SG LinkedIn rows
in `jobs-index.json` and counts every row whose status is not `expired`.
The 561 rows without `jobStatus` are eligible on this snapshot and add
62 company keys. The canonical explicit-active column instead requires
`jobStatus == "active"`.

All 466 protection-list names that appear in the homepage metric are
classified. In the full protection list, 751 records are classified and
425 remain unknown. 1 have inconclusive reviews and 424 await evidence.
In the canonical snapshot, 6,812 records have `companyCanonical` and
`requestedCompany`, and 10,100 have `companyLogoSource`. No job has an
`employerType` or `jobPoster` field.
