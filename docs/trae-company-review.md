# TRAE company review: canonical scheduler entrypoint

GitHub main is the only source of business code and policy. The external
scheduler keeps only the bootstrap command and the AI research task. The
outer workspace provides the existing /workspace/config.json authentication
and proxy settings (or an injected GITHUB_TOKEN/GH_TOKEN secret); it is NOT a script, report, or module source.

## Scheduler script (Bash)

```bash
python3 -I -B - <<'PY'
import json, os, pathlib, subprocess, sys, tempfile, urllib.request
p = pathlib.Path("/workspace/config.json")
cfg = json.loads(p.read_text()) if p.exists() else {}
if cfg.get("repo", "kobolibra/linkedin-jobs-page") != "kobolibra/linkedin-jobs-page" or cfg.get("branch", "main") != "main":
    raise SystemExit("Wrong repository or branch")
token = cfg.get("github_token") or os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
if not token:
    raise SystemExit("Missing GitHub credential")
base = pathlib.Path("/workspace/next-journey-runs")
base.mkdir(parents=True, exist_ok=True)
run = pathlib.Path(tempfile.mkdtemp(prefix="run.", dir=base))
url = "https://api.github.com/repos/kobolibra/linkedin-jobs-page/contents/scripts/trae_bootstrap.py?ref=main"
req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token, "Accept": "application/vnd.github.raw+json"})
handlers = [urllib.request.ProxyHandler({"https": cfg["proxy"]})] if cfg.get("proxy") else []
with urllib.request.build_opener(*handlers).open(req, timeout=60) as response:
    script = run / "trae_bootstrap.py"
    script.write_bytes(response.read())
subprocess.run([sys.executable, "-I", "-B", str(script)], check=True)
PY
```

The authenticated API download and process-local HTTPS Git authentication support both public and private repositories, including subsequent fetches. Never put credentials into URLs, logs or task text.

Do not use a previous run folder or old workspace scripts. The printed ENTRYPOINT
is absolute; use it on every subsequent call. Read the current checkout's policy
and RUN_DIR/company-review-queue.json. New-company discovery uses canonical
jobs and open-ended RSS staging; JobSpy's fixed, already verified company
universe is not separately scanned for new companies. Preparation publishes a startup audit
and checkpoints unresolved observations to GitHub before AI research begins.

## AI task contract (authoritative scheduler instructions)

This section is the complete task contract. The scheduler prompt should not
duplicate mutable classification rules, result schemas, commands or reporting
rules. Read this section and the current checkout's financial-blacklist.md
after every successful bootstrap. The scheduler retains only the authenticated
bootstrap and the instruction to follow this contract. A failed bootstrap
must stop the task; never choose an older run directory as a fallback. Use one
bootstrap per task and do not deliberately overlap two scheduled or manual
runs. The writer prevents stale duplicate commits, but independent overlapping
agents can still waste research on the same queue.

### 1. Worklist

Use the actual RUN_DIR, REPO_DIR and ENTRYPOINT printed by the successful
bootstrap. Read execution-manifest.json from RUN_DIR; require preparedAt and
use reviewDay as the report date (Beijing time). All temporary research and
result files must be in RUN_DIR, outside REPO_DIR.

Research **only** rows in RUN_DIR/company-review-queue.json's reviewQueue,
highest impact first, preserving the supplied order. Never independently
research deferredObservations, daily TSVs, employer-pending.json, employer-ranked.tsv,
old workspace files, or historical audits. If reviewQueue is empty, skip
research and proceed directly to final verification/reporting.

An inconclusive investigation persists the LinkedIn IDs observed in that run.
Only a previously unreviewed open listing can reopen it; repeated RSS pulls,
timestamp/status changes, and known linked reposts do not. Companies with no
new listing stay deferred. Already established classifications and explicit
requester exclusions must not be reopened. Do not separately investigate the
fixed JobSpy company universe. If a company is still ambiguous after reasonable,
targeted research, record the unresolved question and move on rather than
repeating equivalent searches. Do not impose arbitrary batch limits on the
whole run; process the eligible queue within the scheduler's execution budget
and report unfinished items honestly.

### 2. Research and classification

Apply the current financial-blacklist.md policy, retaining financial and
financial-technology institutions, cryptocurrency/blockchain businesses,
and recruitment businesses within the project scope. Respect existing
requester-confirmed classifications and exact normalized company names.

Confirm the actual job publisher's identity, primary business and relationship
to the advertised role. Prefer official company websites, regulator registers,
filings and company-maintained LinkedIn pages; use original vacancy context
to distinguish similar names. Do not infer industry or agency status from
names, keywords or job titles alone. Record actual search queries and evidence
that supports the specific conclusion.

For a company that qualifies for protection, use direct_employer,
recruitment_agency or recruitment_platform as defined in the policy. An EOR,
third-party staffing or RPO business generally falls under recruitment_agency
when that is the publisher's core business. Do not assign mixed or unknown
as a new protected type. Evidence insufficient to establish exact identity,
industry or employer type must result in inconclusive, not forced classification
or deletion. Existing protected type corrections require a reviewed PR, not
a routine scheduler write.

### 3. Submit a batch

Write a UTF-8 JSON array in a new file inside the current RUN_DIR. One object
per researched company. Use the exact queued company name and only fields
accepted by scripts/apply_company_review.py. Dates use the manifest reviewDay.
The following are synthetic examples, not real investigations or evidence.
Replace every example value with actual research; do not submit these examples.

Verified non-target industry:

```json
[
  {
    "company": "Example Retail Company",
    "investigationStatus": "verified",
    "protectionDecision": "delete",
    "identityStatus": "confirmed",
    "industry": "Retail",
    "industryEvidence": [{"url": "https://example.com/about", "note": "Specific evidence supporting identity and principal retail business"}],
    "queries": ["Actual exact-company search query"],
    "investigationSummary": "Concise supported conclusion",
    "lastReviewedOn": "2026-11-27"
  }
]
```

Verified protected employer:

```json
[
  {
    "company": "Example Financial Company",
    "investigationStatus": "verified",
    "protectionDecision": "protect",
    "identityStatus": "confirmed",
    "industry": "Asset management",
    "industryEvidence": [{"url": "https://example.com/about", "note": "Specific supported industry claim"}],
    "employerType": "direct_employer",
    "protectedRecord": {
      "company": "Example Financial Company",
      "employerType": "direct_employer",
      "evidence": {
        "url": "https://example.com/about",
        "reviewedOn": "2026-11-27",
        "note": "Evidence supporting the exact employer identity and type"
      }
    },
    "queries": ["Actual exact-company search query"],
    "investigationSummary": "Concise supported conclusion",
    "lastReviewedOn": "2026-11-27"
  }
]
```

Inconclusive:

```json
[
  {
    "company": "Example Ambiguous Publisher",
    "investigationStatus": "inconclusive",
    "protectionDecision": "undetermined",
    "queries": ["Actual exact-company search query"],
    "investigationSummary": "What the available sources actually establish",
    "remainingQuestion": "Specific missing identity or business evidence",
    "lastReviewedOn": "2026-11-27"
  }
]
```

Do not add employerType or protectedRecord for a verified deletion. For
inconclusive results, do not add new protection or deletion decisions.
Actual evidence URLs must use HTTPS; do not fabricate sources. Record
the actual date from the manifest, not the example date.

Submit results in small batches as they are completed. Use the actual
absolute paths printed by bootstrap and the new result file:

```bash
python3 -I -B "$ENTRYPOINT" apply-review --results "$RESULTS_FILE" --dry-run
python3 -I -B "$ENTRYPOINT" apply-review --results "$RESULTS_FILE"
```

Only proceed with the real transaction after a successful dry run. On
success the entrypoint refreshes the checkout and rebuilds the worklist.
Read the refreshed reviewQueue before selecting the next company. Do not
submit an already researched batch again or manually overwrite its queue.
If a batch fails validation, correct only the invalid result; retain the
research file and do not bypass the writer. If the command reports a code
version change, stop and start a fresh bootstrap, reconciling retained
research with the new queue and current policy before submitting anything.
A nonzero exit after a remote commit is not proof that the commit failed;
refresh and inspect the latest GitHub state before retrying.

The atomic writer owns all classification, cumulative ledger, daily
report and investigation-state writes. No manual editing of those files,
legacy reclassify writes, separate queue state writes, alternate local
scripts or direct Git pushes by the agent. Do not modify JobSpy, n8n
blocklist, frontend or scheduler code during routine review.

### 4. Final verification and report

Whether or not there were eligible companies, attempt each final command
independently, recording its exit status. A pending publication must not
prevent recording the final audit.

```bash
python3 -I -B "$ENTRYPOINT" refresh
python3 -I -B "$ENTRYPOINT" publication --check
python3 -I -B "$ENTRYPOINT" publish-audit
```

The publication check verifies the GitHub classification/RSS input watermark,
not the Cloudflare production deployment. If input publication is pending,
report it as pending and inspect the relevant GitHub Actions status if
available. Never claim production deployment from a successful dry run,
data commit or watermark alone. If a final command fails, report the
actual failure and still attempt the audit; if code changes prohibit
refreshing, preserve the local manifest and clearly report the limitation.

Read final company reports from the refreshed REPO_DIR/reports directory,
not the initial RUN_DIR daily-report mirror, which may predate classification.
Use the manifest reviewDay for the report filenames:

- today-target-companies-YYYY-MM-DD.tsv
- today-excluded-companies-YYYY-MM-DD.tsv

Output a concise Chinese summary of actual investigated, protected, deleted,
inconclusive, still-eligible and deferred company counts. Separately identify
new verified deletions and their industries, and newly protected companies
and their employer types. Distinguish daily observed company totals from
actual new investigation totals; a daily report may include previously
classified companies. Include both final daily TSV reports as copyable text,
preserving the exact company names and labels. Mark any unresolved rows as
unverified, not approved for deletion. If a report is missing, report that
fact rather than inventing rows. Report the GitHub write, publication,
deployment and audit statuses separately, with actual commit/run references
when available. Never expose credentials, proxy credentials or authentication
headers. Do not alter the existing n8n Google Sheet or blocklist.

The execution manifest records actual steps, not proof of successful research
or deployment. A task with no eligible companies and successful preparation,
checkpoint and audit is a valid completed no-work run.
