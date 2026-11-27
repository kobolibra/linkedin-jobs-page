"""Publication watermark and fail-closed validation for the single deploy pipeline.

Only RSS and classification sources are tracked. JobSpy snapshots retain their
existing contract: they become canonical on the next RSS/target publication.
The watermark is validation metadata, not another classification source.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from reclassify import BLACKLIST, TARGET, requester_excluded_names, validate_blacklist_transition

STAMP = "data/publication-state.json"
SOURCES = ("data/n8n/rss-latest.json", TARGET, BLACKLIST)


def fingerprint(root: Path) -> dict[str, str]:
    return {path: hashlib.sha256((root / path).read_bytes()).hexdigest() for path in SOURCES}


def load_state(root: Path) -> dict:
    state = json.loads((root / STAMP).read_text(encoding="utf-8"))
    if (state.get("version") != 1
            or not re.fullmatch(r"[0-9a-f]{40}", str(state.get("classificationCommit", "")))
            or not isinstance(state.get("inputs"), dict)):
        raise ValueError("Invalid publication state")
    return state


def git(root, *args):
    return subprocess.check_output(("git", *args), cwd=root, text=True)


def validate(root: Path) -> None:
    if (root / "company_employer_types.json").exists():
        raise ValueError("Use financial_blacklist.json as the single classification source")
    state = load_state(root)
    ref = state["classificationCommit"]
    try:
        old = git(root, "show", f"{ref}:{BLACKLIST}")
    except subprocess.CalledProcessError:
        # Actions checks out a shallow clone. Retrieve only the verified ancestor.
        subprocess.run(("git", "fetch", "--depth=1", "origin", ref), cwd=root, check=True)
        old = git(root, "show", f"{ref}:{BLACKLIST}")
    manual = requester_excluded_names(lambda path: (root / path).read_text(encoding="utf-8") if (root / path).is_file() else None)
    validate_blacklist_transition(json.loads(old), json.loads((root / BLACKLIST).read_text(encoding="utf-8")), requester_exclusions=manual)


def current(root: Path) -> bool:
    return load_state(root)["inputs"] == fingerprint(root)


def record(root: Path) -> None:
    validate(root)
    state = {"version": 1, "classificationCommit": git(root, "rev-parse", "HEAD").strip(),
             "inputs": fingerprint(root)}
    (root / STAMP).write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")


def require_capture(root: Path, path: Path) -> None:
    if json.loads(path.read_text(encoding="utf-8")) != fingerprint(root):
        raise ValueError("Publication sources advanced during logo collection; refuse stale merge. A newer queued publication will process them.")


def main():
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument("--root", type=Path, default=ROOT)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--validate", action="store_true")
    action.add_argument("--check", action="store_true")
    action.add_argument("--record", action="store_true")
    action.add_argument("--capture", type=Path)
    action.add_argument("--require-capture", type=Path)
    args = parser.parse_args()
    if args.validate:
        validate(args.root)
    elif args.check:
        if not current(args.root):
            sys.exit("RSS/classification inputs have not been published")
    elif args.record:
        record(args.root)
    elif args.capture:
        args.capture.write_text(json.dumps(fingerprint(args.root)), encoding="utf-8")
    else:
        require_capture(args.root, args.require_capture)


if __name__ == "__main__":
    main()
