#!/usr/bin/env python3
"""Run the existing per-company LinkedIn searcher with bounded concurrency.

This intentionally delegates each company to fetch_linkedin_requests.py instead
of changing its request logic. The workflow therefore keeps the same per-company
pagination, delays, retries, output schema, and a maximum of two simultaneous
company searches as the former matrix configuration.
"""
from __future__ import annotations

import argparse
import json
import logging
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from fetch_linkedin_requests import COMPANIES

LOG = logging.getLogger("jobspy-orchestrator")


def run_one(args: argparse.Namespace, key: str, company: str, company_id: str) -> tuple[str, int, str]:
    output = args.output_dir / f"{key}.json"
    command = [
        sys.executable,
        str(Path(__file__).with_name("fetch_linkedin_requests.py")),
        "--company", company,
        "--company-id", company_id,
        "--results-per-company", str(args.results_per_company),
        "--delay-min", str(args.delay_min),
        "--delay-max", str(args.delay_max),
        "--page-timeout", str(args.page_timeout),
        "--output", str(output),
    ]
    LOG.info("starting %s (%s)", key, company)
    completed = subprocess.run(command, text=True, capture_output=True)
    if completed.stdout:
        LOG.info("%s stdout:\n%s", key, completed.stdout.rstrip())
    if completed.stderr:
        LOG.info("%s stderr:\n%s", key, completed.stderr.rstrip())
    if completed.returncode != 0 and not output.exists():
        output.write_text(
            json.dumps(
                {
                    "schemaVersion": "1.1",
                    "generatedAt": "",
                    "country": "China",
                    "descriptionFetchEnabled": False,
                    "count": 0,
                    "statusSummary": {company: f"process-failed: exit={completed.returncode}"},
                    "jobs": [],
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
    return key, completed.returncode, str(output)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--results-per-company", type=int, default=1000)
    parser.add_argument("--delay-min", type=float, default=2)
    parser.add_argument("--delay-max", type=float, default=5)
    parser.add_argument("--page-timeout", type=int, default=20)
    parser.add_argument("--max-workers", type=int, default=2)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    if args.max_workers < 1:
        parser.error("--max-workers must be >= 1")

    selected = list(COMPANIES.items())
    failures = []
    with ThreadPoolExecutor(max_workers=args.max_workers) as pool:
        futures = [
            pool.submit(run_one, args, key, company, spec["company_id"])
            for company, spec in selected
            for key in [spec["canonical"].replace(" ", "_")]
        ]
        for future in as_completed(futures):
            key, returncode, output = future.result()
            if returncode == 0:
                LOG.info("completed %s -> %s", key, output)
            else:
                LOG.error("company search failed: %s exit=%s output=%s", key, returncode, output)
                failures.append(key)

    # Preserve the old matrix's non-fatal company behavior: the downstream
    # combiner decides whether any valid company result can be published.
    LOG.info("company searches complete: total=%s failed=%s", len(selected), len(failures))
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    raise SystemExit(main())
