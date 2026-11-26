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

Preparation automatically publishes the initial execution manifest. The final
audit call updates that same run record. Store research JSON inside RUN_DIR,
not in the outer workspace; do not reuse a prior run's results file.
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
