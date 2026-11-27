#!/usr/bin/env python3
"""Single, pinned entrypoint for the external TRAE company-review scheduler.

The scheduler creates an authenticated fresh checkout of main and calls prepare.
No Python code, prior report, or module is loaded from the outer workspace.
Credentials remain outside Git. Subsequent steps use the same entrypoint.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = "kobolibra/linkedin-jobs-page"
REMOTE = "https://github.com/" + REPO + ".git"
CONFIG = Path("/workspace/config.json")
sys.path.insert(0, str(ROOT / "scripts"))
from trae_bootstrap import git_env, load_config as bootstrap_config
KEY_FILES = (
    "auto-daily-companies.py", "reclassify.py",
    "scripts/trae_bootstrap.py", "scripts/trae_company_review.py", "scripts/company_review_queue.py",
    "scripts/audit_employer_types.py", "scripts/publication_state.py",
    "scripts/apply_company_review.py", "scripts/jobspy/linkedin_ids.py",
    "docs/financial-blacklist.md", "docs/trae-company-review.md",
)
CODE_PATHS = (*KEY_FILES, "scripts/__init__.py", "scripts/jobspy/__init__.py")
LOCAL_CODE_PATHS = ("auto-daily-companies.py", "reclassify.py", "scripts/",
                    "docs/financial-blacklist.md", "docs/trae-company-review.md")
ALLOWED = {
    "reclassify": "reclassify.py",
    "queue": "scripts/company_review_queue.py",
    "audit": "scripts/audit_employer_types.py",
    "publication": "scripts/publication_state.py",
}


def utc():
    return datetime.now(timezone.utc).isoformat()


def git(root, *args):
    # Authenticate fetches and partial-clone lazy object downloads, also for private main.
    env = git_env(load_config())
    return subprocess.check_output(
        ["git", "-C", str(root), *args], env=env, text=True
    ).strip()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(path, obj):
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                     delete=False) as temp:
        json.dump(obj, temp, indent=2, ensure_ascii=False)
        temp.write("\n")
    os.replace(temp.name, path)


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_config(path=None):
    return bootstrap_config(CONFIG if path is None else path)


def child_env(run_dir, config=CONFIG):
    cfg = load_config(config)
    env = git_env(cfg)
    for key in list(env):
        if key.startswith("PYTHON"):
            env.pop(key)
    env["GITHUB_TOKEN"] = cfg["github_token"]
    env["NEXT_JOURNEY_CONFIG"] = str(config)
    env["NEXT_JOURNEY_OUTPUT_DIR"] = str(run_dir)
    env["NEXT_JOURNEY_SNAPSHOT"] = str(run_dir / "repo" / "jobs.json")
    env["GIT_TERMINAL_PROMPT"] = "0"
    if cfg.get("proxy"):
        for key in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
            env[key] = cfg["proxy"]
    return env


def check_layout(root, run_dir):
    if root != run_dir / "repo" or root.parent != run_dir:
        raise ValueError("Use the fresh run directory created by the scheduler")
    if git(root, "rev-parse", "--show-toplevel") != str(root):
        raise ValueError("Incorrect Git checkout")
    if git(root, "remote", "get-url", "origin") != REMOTE:
        raise ValueError("Incorrect Git remote")
    if run_dir.name.startswith("run.") is False:
        raise ValueError("Expected a dedicated run.* directory")


def check_code(root, manifest):
    # Check tracked content AND untracked files in the code scope. In particular,
    # don't allow a stale local reclassify module to shadow the checked-out one.
    commit = manifest["codeCommit"]
    head = git(root, "rev-parse", "HEAD")
    if git(root, "diff", "--name-only", commit, head, "--", *CODE_PATHS):
        raise RuntimeError("Pinned business code changed; restart from latest main")
    if git(root, "status", "--porcelain", "--untracked-files=all", "--", *LOCAL_CODE_PATHS):
        raise RuntimeError("Local business code is modified or untracked; refuse execution")
    for item in manifest["scripts"]:
        if digest(root / item["path"]) != item["sha256"]:
            raise RuntimeError("Pinned script bytes changed: " + item["path"])


def refresh(root, run_dir, manifest):
    check_code(root, manifest)
    git(root, "fetch", "--depth=1", "--no-tags", "origin", "refs/heads/main")
    new = git(root, "rev-parse", "FETCH_HEAD")
    if git(root, "diff", "--name-only", manifest["codeCommit"], new, "--", *CODE_PATHS):
        raise RuntimeError("GitHub business code changed; preserve research and restart from latest main")
    if git(root, "rev-parse", "HEAD") != new:
        # Never discard research edits. The agent must save/commit them first.
        if git(root, "status", "--porcelain", "--untracked-files=all"):
            raise RuntimeError("Checkout has local changes; persist them before refreshing")
        git(root, "checkout", "--detach", new)
    manifest["dataCommit"] = new
    check_code(root, manifest)
    save(run_dir / "execution-manifest.json", manifest)


def script_command(root, relative, args):
    return [sys.executable, "-I", "-B", str(root / relative), *args]


def execute(root, run_dir, manifest, name, command, *, output=None, credentials=False):
    check_code(root, manifest)
    # Do not persist arbitrary argument values, which might contain secrets.
    event = {"step": name, "startedAt": utc(), "dataCommit": manifest["dataCommit"],
             "executable": command[0], "script": command[3] if len(command) > 3 else None,
             "argumentFlags": [x.split("=", 1)[0] for x in command[4:] if x.startswith("--")],
             "argumentsSha256": hashlib.sha256(json.dumps(command[4:]).encode()).hexdigest()}
    manifest["events"].append(event)
    save(run_dir / "execution-manifest.json", manifest)
    env = child_env(run_dir)
    if manifest.get("reviewDay"):
        env["NEXT_JOURNEY_REVIEW_DAY"] = manifest["reviewDay"]
    if not credentials:
        env.pop("GITHUB_TOKEN", None)
        env.pop("GH_TOKEN", None)
    try:
        if output is None:
            subprocess.run(command, cwd=root, env=env, check=True)
        else:
            with output.open("w", encoding="utf-8") as out:
                subprocess.run(command, cwd=root, env=env, stdout=out, check=True)
        event["exitCode"] = 0
    except subprocess.CalledProcessError as error:
        event["exitCode"] = error.returncode
        raise RuntimeError(f"{name} failed with exit code {error.returncode}") from None
    finally:
        event["finishedAt"] = utc()
        save(run_dir / "execution-manifest.json", manifest)


def prepare(root, run_dir):
    manifest_path = run_dir / "execution-manifest.json"
    if manifest_path.exists():
        raise RuntimeError("Run already initialized; start a new run for prepare")
    head = git(root, "rev-parse", "HEAD")
    git(root, "fetch", "--depth=1", "--no-tags", "origin", "refs/heads/main")
    latest = git(root, "rev-parse", "FETCH_HEAD")
    if git(root, "status", "--porcelain", "--untracked-files=all"):
        raise RuntimeError("Prepare requires a clean checkout")
    if latest != head:
        if git(root, "diff", "--name-only", head, latest, "--", *CODE_PATHS):
            raise RuntimeError("Main business code advanced during checkout; start a new run")
        git(root, "checkout", "--detach", latest)
        head = latest
    load_config()
    from datetime import timedelta
    day = datetime.now(timezone(timedelta(hours=8))).date().isoformat()
    manifest = {"version": 2, "runId": run_dir.name, "repository": REPO,
                "reviewDay": day,
                "branch": "main", "startedAt": utc(), "codeCommit": head,
                "dataCommit": head, "checkout": str(root),
                "pythonExecutable": sys.executable, "events": [],
                "scripts": [{"path": path, "sha256": digest(root / path)}
                            for path in KEY_FILES]}
    save(manifest_path, manifest)
    check_code(root, manifest)
    try:
        # One worklist and one atomic report/checkpoint write. Regression tests
        # and whole-universe diagnostic audits belong in GitHub CI, not here.
        build_queue(root, run_dir, manifest)
        apply_review(root, run_dir, manifest, [], preparing=True)
        manifest["preparedAt"] = utc()
    except Exception as error:
        manifest["preparationFailedAt"] = utc()
        manifest["preparationErrorType"] = type(error).__name__
        save(manifest_path, manifest)
        try:
            publish_audit(root, run_dir, manifest)
        except Exception:
            print("Could not publish failure audit; retain local execution-manifest.json", file=sys.stderr)
        raise
    save(manifest_path, manifest)
    publish_audit(root, run_dir, manifest)


def build_queue(root, run_dir, manifest):
    execute(root, run_dir, manifest, "review-queue",
            script_command(root, ALLOWED["queue"], ["--root", str(root)]),
            output=run_dir / "company-review-queue.json")


def apply_review(root, run_dir, manifest, args, *, preparing=False):
    parser = argparse.ArgumentParser(prog="apply-review", allow_abbrev=False)
    parser.add_argument("--results", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    opts = parser.parse_args(args)
    command = ["--queue", str(run_dir / "company-review-queue.json"),
               "--code-commit", manifest["codeCommit"], "--date", manifest["reviewDay"]]
    if preparing:
        command.append("--prepare")
    if opts.results:
        if not opts.results.is_absolute() or not opts.results.resolve().is_relative_to(run_dir):
            raise ValueError("Results must be an absolute file inside this run")
        command += ["--results", str(opts.results.resolve())]
    if opts.dry_run:
        command.append("--dry-run")
    execute(root, run_dir, manifest,
            "prepare-review" if preparing else ("apply-review" if opts.results else "checkpoint-queue"),
            script_command(root, "scripts/apply_company_review.py", command), credentials=True)
    if not opts.dry_run:
        refresh(root, run_dir, manifest)
        # The atomic writer updates this run's worklist from the committed
        # checkpoint. No repeated scan of all jobs is required after a batch.


def checked_arguments(action, args, root, run_dir):
    args = list(args)
    flags = {x.split("=", 1)[0] for x in args if x.startswith("--")}
    if action == "reclassify":
        if "--blacklist" in flags or any(x.startswith("--black") and not
                x.startswith("--blacklist-records") for x in flags):
            raise ValueError("Use --blacklist-records, never legacy --blacklist")
        if "--local-root" in flags or any(x.startswith("--local") for x in flags):
            raise ValueError("Output root is controlled by the run entrypoint")
    if action in {"queue", "publication"}:
        if "--root" in flags:
            raise ValueError("Data root is controlled by the run entrypoint")
        if action == "queue":
            for i, value in enumerate(args):
                if value == "--apply-results" or value.startswith("--apply-results="):
                    file = Path(value.split("=", 1)[1] if "=" in value else args[i + 1])
                    if not file.is_absolute() or not file.resolve().is_relative_to(run_dir):
                        raise ValueError("Investigation results must be an absolute file inside this run")
        args.extend(["--root", str(root)])
    return args


def publish_audit(root, run_dir, manifest):
    check_code(root, manifest)
    # Import only from the verified checkout; config is never committed.
    sys.path.insert(0, str(root))
    from reclassify import Repo
    import ssl
    import urllib.request
    cfg = load_config()
    handlers = [urllib.request.HTTPSHandler(context=ssl.create_default_context())]
    if cfg.get("proxy"):
        handlers.append(urllib.request.ProxyHandler(dict.fromkeys(("http", "https"), cfg["proxy"])))
    manifest["auditPublishedAt"] = utc()
    path = "reports/agent-runs/" + manifest["runId"] + ".json"
    if not re.fullmatch(r"reports/agent-runs/run\.[A-Za-z0-9]+\.json", path):
        raise ValueError("Invalid run ID")
    body = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    Repo(cfg["github_token"], REPO, "main", urllib.request.build_opener(*handlers)).transact(
        lambda read_file: {path: body}, "Record TRAE company review execution " + manifest["runId"])
    save(run_dir / "execution-manifest.json", manifest)
    print("AUDIT_PATH=" + path)


def finish(root, run_dir, manifest):
    """Refresh the reports once, check publication, and record the final audit."""
    try:
        refresh(root, run_dir, manifest)
        from publication_state import current
        manifest["publicationState"] = "current" if current(root) else "pending"
    except Exception as error:
        manifest["publicationState"] = "error"
        manifest["publicationErrorType"] = type(error).__name__
        print("Final publication verification failed: " + type(error).__name__, file=sys.stderr)
    manifest["finishedAt"] = utc()
    save(run_dir / "execution-manifest.json", manifest)
    publish_audit(root, run_dir, manifest)
    print("PUBLICATION_STATE=" + manifest["publicationState"])
    if manifest["publicationState"] == "error":
        raise RuntimeError("Final publication verification failed; inspect the manifest")


def main():
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument("action", choices=["prepare", "finish", "refresh", "publish-audit", "apply-review", *ALLOWED])
    parser.add_argument("args", nargs=argparse.REMAINDER)
    opts = parser.parse_args()
    root = ROOT
    run_dir = root.parent
    check_layout(root, run_dir)
    if opts.action == "prepare":
        if opts.args:
            raise ValueError("prepare accepts no additional arguments")
        prepare(root, run_dir)
    else:
        manifest = read(run_dir / "execution-manifest.json")
        if manifest.get("checkout") != str(root) or manifest.get("repository") != REPO:
            raise ValueError("Run manifest does not match checkout")
        check_code(root, manifest)
        if opts.action == "publish-audit":
            if opts.args:
                raise ValueError("publish-audit accepts no additional arguments")
            publish_audit(root, run_dir, manifest)
        else:
            if not manifest.get("preparedAt"):
                raise RuntimeError("Run preparation did not complete")
            if opts.action == "finish":
                if opts.args:
                    raise ValueError("finish accepts no additional arguments")
                finish(root, run_dir, manifest)
            elif opts.action == "refresh":
                refresh(root, run_dir, manifest)
                if opts.args:
                    raise ValueError("refresh accepts no additional arguments")
                build_queue(root, run_dir, manifest)
                apply_review(root, run_dir, manifest, [])
            elif opts.action == "apply-review":
                # The atomic writer guards the current remote code and state;
                # one refresh after a successful write is sufficient.
                apply_review(root, run_dir, manifest, opts.args)
            else:
                refresh(root, run_dir, manifest)
                args = checked_arguments(opts.action, opts.args, root, run_dir)
                # Legacy split writes would bypass the evidence and atomicity gate.
                # Keep read-only diagnostics and the old dry-run command available.
                if opts.action == "reclassify" and "--dry-run" not in args:
                    raise ValueError("Use apply-review --results FILE; legacy reclassify writes are disabled in TRAE")
                if opts.action == "queue" and any(a == "--write" or a.startswith("--apply-results") for a in args):
                    raise ValueError("Use apply-review --results FILE; never write queue state separately")
                execute(root, run_dir, manifest, opts.action,
                        script_command(root, ALLOWED[opts.action], args),
                        credentials=opts.action == "reclassify")
    print("RUN_DIR=" + str(run_dir))
    print("REPO_DIR=" + str(root))
    print("ENTRYPOINT=" + str(root / "scripts/trae_company_review.py"))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, OSError) as error:
        print("TRAE_ENTRYPOINT_FAILED: " + str(error), file=sys.stderr)
        sys.exit(1)
