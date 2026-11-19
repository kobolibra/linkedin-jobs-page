"""Nonblocking GitHub checkpoint publication for the dedicated State Street import.

The scraper writes its checkpoint atomically, then periodically publishes only
the historical JD checkpoint and its progress summary to main. Every ref move
is fast-forward only, preserving concurrent commits by other workflows.
"""
from __future__ import annotations

import base64
import json
import os
import re
from pathlib import Path

import requests

from update_state_street_progress import progress

JD_PATH = "data/jobspy/backfill/state-street-live-jd-checkpoint.json"
PROGRESS_PATH = "docs/state-street-backfill-progress.json"


def publish_checkpoint(details: Path, search: Path, *, token=None, repository=None,
                       branch="main", session=None, retries=4):
    token = token or os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    repository = repository or os.environ.get("GITHUB_REPOSITORY", "")
    if not token:
        raise ValueError("GitHub token not available for live checkpoint")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise ValueError("Invalid GitHub repository")
    if branch != "main":
        raise ValueError("State Street checkpoint must target main")
    details_doc = json.loads(details.read_text(encoding="utf-8"))
    search_doc = json.loads(search.read_text(encoding="utf-8"))
    if not isinstance(details_doc.get("jobs"), list):
        raise ValueError("Malformed JD checkpoint")
    progress_doc = progress(search_doc, details_doc)
    if progress_doc["jdTotal"] != len(details_doc["jobs"]):
        raise ValueError("Search/JD job count mismatch")
    if progress_doc["jdOk"] < 1:
        raise ValueError("No verified JD to checkpoint")

    api = "https://api.github.com/repos/" + repository
    session = session or requests.Session()
    headers = {"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json",
               "X-GitHub-Api-Version": "2022-11-28"}

    def call(method, endpoint, *, json_body=None, allow_conflict=False):
        res = session.request(method, api + endpoint, headers=headers, json=json_body,
                              timeout=(10, 30))
        if allow_conflict and res.status_code in (409, 422):
            return None
        res.raise_for_status()
        return res.json()

    blobs = []
    payloads = {
        JD_PATH: details.read_bytes(),
        PROGRESS_PATH: (json.dumps(progress_doc, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
    }
    for path, body in payloads.items():
        obj = call("POST", "/git/blobs",
                   json_body={"content": base64.b64encode(body).decode("ascii"),
                              "encoding": "base64"})
        blobs.append({"path": path, "mode": "100644", "type": "blob", "sha": obj["sha"]})

    for _ in range(max(1, retries)):
        parent = call("GET", "/git/ref/heads/" + branch)["object"]["sha"]
        parent_commit = call("GET", "/git/commits/" + parent)
        new_tree = call("POST", "/git/trees",
                        json_body={"base_tree": parent_commit["tree"]["sha"],
                                   "tree": blobs})["sha"]
        new_commit = call("POST", "/git/commits",
                          json_body={"message": ("checkpoint: State Street JD "
                                                 f"{progress_doc['jdOk']}/{progress_doc['jdTotal']}"),
                                     "tree": new_tree, "parents": [parent]})["sha"]
        result = call("PATCH", "/git/refs/heads/" + branch,
                      json_body={"sha": new_commit, "force": False},
                      allow_conflict=True)
        if result is not None:
            return {"sha": new_commit, "jdOk": progress_doc["jdOk"],
                    "jdTotal": progress_doc["jdTotal"]}
    raise RuntimeError("Concurrent main updates prevented live checkpoint; local progress retained")
