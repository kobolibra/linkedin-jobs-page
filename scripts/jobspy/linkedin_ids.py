#!/usr/bin/env python3
"""Canonical LinkedIn job-id parsing shared by lifecycle and payload scripts."""
from __future__ import annotations

import re
from urllib.parse import parse_qs, urlsplit

_DIGITS = re.compile(r"(\d{5,})")
_VIEW_PATH = re.compile(r"/jobs/view/([^/?#]+)", re.IGNORECASE)


def linkedin_job_id(value: object) -> str:
    """Return the numeric LinkedIn job id, without a ``li-``/``ln:`` prefix.

    LinkedIn URLs may contain several numeric fragments in the human-readable
    slug. The job id is the final numeric fragment in the /jobs/view slug, or
    the explicit currentJobId query parameter. For sourceJobId values such as
    ``li-<slug>-<id>``, the final numeric fragment is likewise canonical.
    """
    raw = str(value or "").strip()
    if not raw:
        return ""

    parsed = urlsplit(raw)
    path = parsed.path or raw.split("?", 1)[0].split("#", 1)[0]
    view = _VIEW_PATH.search(path)
    if view:
        matches = _DIGITS.findall(view.group(1))
        if matches:
            return matches[-1]

    query_id = parse_qs(parsed.query).get("currentJobId", [])
    if query_id and query_id[0].isdigit():
        return query_id[0]
    query_match = re.search(r"(?:^|[?&])currentJobId=(\d+)", raw)
    if query_match:
        return query_match.group(1)

    # Source ids are commonly li-<slug>-<numeric-id> or ln:<numeric-id>.
    # Use the final numeric fragment so title numbers cannot win.
    matches = _DIGITS.findall(path)
    return matches[-1] if matches else ""


__all__ = ["linkedin_job_id"]


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("value")
    args = parser.parse_args()
    print(linkedin_job_id(args.value))
