# TRAE company review: canonical scheduler entrypoint

GitHub main is the only source of business code and policy. The external
scheduler keeps only the bootstrap command and the AI research task. The
outer workspace provides the existing /workspace/config.json authentication
and proxy settings; it is NOT a script, report, or module source.

## Scheduler script (Bash)

```bash
set -Eeuo pipefail
umask 077
BASE=/workspace/next-journey-runs
mkdir -p "$BASE"
RUN="$(mktemp -d "$BASE/run.XXXXXXXX")"
REPO="$RUN/repo"
GIT_TERMINAL_PROMPT=0 git clone --depth=1 --filter=blob:none --no-checkout --single-branch --branch main https://github.com/kobolibra/linkedin-jobs-page.git "$REPO"
git -C "$REPO" sparse-checkout set --no-cone '/auto-daily-companies.py' '/reclassify.py' '/financial_blacklist.json' '/company_industries.json' '/jobs.json' '/jobs-index.json' '/scripts/' '/reports/' '/docs/financial-blacklist.md' '/docs/trae-company-review.md' '/.github/workflows/' '/data/n8n/rss-latest.json' '/data/publication-state.json' '/data/target-filter-quarantine.json'
git -C "$REPO" checkout --detach refs/remotes/origin/main
python3 -I -B "$REPO/scripts/trae_company_review.py" prepare
```

Do not use a previous run folder. Never fall back to old workspace scripts.
The printed ENTRYPOINT is an absolute path; use it on every subsequent call
(even if the shell/cwd changes). Read the current checkout's financial policy
and the review queue generated beside the checkout. Complete the AI research
and apply only verified decisions. Examples, where ENTRYPOINT and the
arguments are real values from this run:

```bash
python3 -I -B "$ENTRYPOINT" reclassify --date "$DAY" --finalize --blacklist-records "$PROTECTED_JSON" --industry "$INDUSTRY_JSON" --dry-run
python3 -I -B "$ENTRYPOINT" reclassify --date "$DAY" --finalize --blacklist-records "$PROTECTED_JSON" --industry "$INDUSTRY_JSON"
python3 -I -B "$ENTRYPOINT" queue --apply-results "$RESULTS_FILE" --write
python3 -I -B "$ENTRYPOINT" refresh
python3 -I -B "$ENTRYPOINT" publication --check
python3 -I -B "$ENTRYPOINT" publish-audit
```

The queue command writes the local progress file; persist it via a reviewed,
non-overwriting GitHub data update before refreshing. Existing classification
corrections follow the reviewed PR process. Never force-push, never use legacy
--blacklist, and do not edit the publication watermark. On code changes,
preserve research outside the checkout and start another fresh run; do not
continue with a mixed code version. If preparation or any step fails, report
the failure and publish the available audit where possible. A published audit
records actual script steps and their exit codes; it is not a claim that the
AI investigation or production deployment succeeded. Keep the final task
report separate and verify Actions and production normally.
