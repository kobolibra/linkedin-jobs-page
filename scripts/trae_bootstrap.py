#!/usr/bin/env python3
"""Authenticated disposable checkout for public or private main."""
import base64
import json
import os
import subprocess
import sys
from pathlib import Path

REPO = "kobolibra/linkedin-jobs-page"
REMOTE = "https://github.com/" + REPO + ".git"
CONFIG = Path("/workspace/config.json")
SPARSE = (
    "/auto-daily-companies.py", "/reclassify.py", "/financial_blacklist.json",
    "/company_industries.json", "/jobs.json", "/jobs-index.json", "/scripts/",
    "/reports/", "/docs/financial-blacklist.md", "/docs/trae-company-review.md",
    "/.github/workflows/", "/data/n8n/rss-latest.json", "/data/jobspy/incremental/latest.json",
    "/data/publication-state.json", "/data/target-filter-quarantine.json",
)


def load_config(path=None):
    path = CONFIG if path is None else path
    try:
        cfg = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        cfg = {"repo": REPO, "branch": "main"}
    if cfg.get("repo") != REPO or cfg.get("branch") != "main":
        raise ValueError("Wrong GitHub repository/branch in external config")
    token = cfg.get("github_token") or os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not isinstance(token, str) or not token.strip():
        raise ValueError("Missing GitHub credential; configure GITHUB_TOKEN or /workspace/config.json")
    cfg["github_token"] = token.strip()
    return cfg


def git_env(cfg=None):
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")
           or k in {"GIT_SSL_CAINFO", "GIT_SSL_CAPATH"}}
    env.update({"GIT_TERMINAL_PROMPT": "0", "GIT_CONFIG_GLOBAL": os.devnull,
                "GIT_CONFIG_NOSYSTEM": "1"})
    if cfg is not None:
        basic = base64.b64encode(("x-access-token:" + cfg["github_token"]).encode()).decode()
        env.update({"GIT_CONFIG_COUNT": "3",
                    "GIT_CONFIG_KEY_0": "http.https://github.com/.extraheader",
                    "GIT_CONFIG_VALUE_0": "Authorization: Basic " + basic,
                    "GIT_CONFIG_KEY_1": "credential.helper", "GIT_CONFIG_VALUE_1": "",
                    "GIT_CONFIG_KEY_2": "http.followRedirects", "GIT_CONFIG_VALUE_2": "false"})
        if cfg.get("proxy"):
            for key in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
                env[key] = cfg["proxy"]
    return env


def main():
    run = Path(__file__).resolve().parent
    if not run.name.startswith("run."):
        raise ValueError("Bootstrap must run in a new run.* directory")
    repo = run / "repo"
    if repo.exists():
        raise ValueError("Never reuse a prior checkout")
    cfg = load_config()
    env = git_env(cfg)
    for command in (
        ["git", "clone", "--depth=1", "--filter=blob:none", "--no-checkout",
         "--single-branch", "--branch", "main", REMOTE, str(repo)],
        ["git", "-C", str(repo), "sparse-checkout", "set", "--no-cone", *SPARSE],
        ["git", "-C", str(repo), "checkout", "--detach", "refs/remotes/origin/main"],
    ):
        subprocess.run(command, env=env, check=True)
    if (repo / "scripts/trae_bootstrap.py").read_bytes() != Path(__file__).read_bytes():
        raise RuntimeError("GitHub bootstrap changed during startup; restart using latest main")
    subprocess.run([sys.executable, "-I", "-B", str(repo / "scripts/trae_company_review.py"),
                    "prepare"], cwd=repo, env=env, check=True)


if __name__ == "__main__":
    main()
