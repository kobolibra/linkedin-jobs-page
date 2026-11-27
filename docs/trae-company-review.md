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
and RUN_DIR/company-review-queue.json. Preparation publishes a startup audit
and checkpoints unresolved observations to GitHub before AI research begins.

## AI task contract

Research the highest-impact companies first, using the exact publisher identity,
official/regulatory or company-maintained sources and original job context.
Do not infer the industry or agency status from the name or job title alone.
Do not assign a new mixed/unknown protection record. Submit inconclusive
investigations with specific outstanding questions; do not delete or add new
protection without evidence.

Write a JSON array in the current RUN_DIR, with one object per researched company:
company, investigationStatus (verified or inconclusive), protectionDecision
(protect, delete, or undetermined), identityStatus, industry, industryEvidence
(array of HTTPS url/note objects), queries (actual search strings or query
objects), investigationSummary, remainingQuestion if inconclusive. For a
verified result identityStatus must be confirmed. For verified protection add
employerType and protectedRecord (company, employerType, evidence containing
HTTPS url, reviewedOn and note). For verified deletion do not assign
employerType or protectedRecord. Dates use Beijing time. Existing protected
type corrections require a reviewed PR; never remove protection.

Submit results in small independent batches; each batch is a single atomic
GitHub transaction with the cumulative ledgers, typed protection/industry
sources, applicable daily reports and research history. The writer recalculates
against the latest head, rejects conflicting or unobserved decisions, preserves
historical observation dates, and refuses to overwrite newer verified decisions.

```bash
python3 -I -B "$ENTRYPOINT" apply-review --results "$RESULTS_FILE" --dry-run
python3 -I -B "$ENTRYPOINT" apply-review --results "$RESULTS_FILE"
python3 -I -B "$ENTRYPOINT" refresh
python3 -I -B "$ENTRYPOINT" publication --check
python3 -I -B "$ENTRYPOINT" publish-audit
```

The legacy split reclassify and local queue write commands are disabled in the
TRAE entrypoint; use apply-review instead. Never edit cumulative lists, state
files, or the publication watermark directly. Refresh checkpoints new
observations and preserves previous unresolved research. On code changes,
preserve research outside the checkout and start a fresh run; do not mix code
versions. Publication may still be pending after a successful data transaction;
verify the relevant GitHub Actions and production separately. The execution
manifest records actual steps, not proof of successful research or deployment.
