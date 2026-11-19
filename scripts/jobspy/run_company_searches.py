#!/usr/bin/env python3
"""Run the existing per-company LinkedIn searcher with bounded concurrency.

Delegate pagination and shared request pacing to fetch_linkedin_requests.py.
After the initial company pass, resume recoverable rate-limited pages up to twice from
their checkpoints. Verified prefixes and completed regions remain intact.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from fetch_linkedin_requests import COMPANIES

LOG = logging.getLogger("jobspy-orchestrator")
STATE_STREET_INITIALIZED = Path("data/jobspy/backfill/state-street-initialized.json")


def run_one(args: argparse.Namespace, key: str, company: str, company_id: str, *, resume=False) -> tuple[str, int, str]:
    output = args.output_dir / f"{key}.json"
    if not resume:
        output.unlink(missing_ok=True)
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
    if resume:
        command.append("--resume")
    for location in args.locations:
        command.extend(["--location", location])
    LOG.info("starting %s (%s)", key, company)
    env=os.environ.copy();env.pop('LINKEDIN_HTTP_DEADLINE',None)
    env['PYTHONUNBUFFERED']='1'
    # Stream per-page progress directly into Actions instead of buffering
    # both company logs until their entire searches have finished.
    completed = subprocess.run(command, text=True, env=env)
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
                    "country": "Multi-region" if len(args.locations) > 1 else "CN",
                    "scopeLocations": ["CN", "HK", "SG"] if len(args.locations) > 1 else ["CN"],
                    "descriptionFetchEnabled": False,
                    "count": 0,
                    "statusSummary": {
                        f"{company}::{code}": f"process-failed: exit={completed.returncode}"
                        for code in (["CN", "HK", "SG"] if len(args.locations) > 1 else ["CN"])
                    },
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
    # Accept the previous executor argument during a rolling upgrade, without
    # retaining its data-truncating behavior. Current workflows omit it.
    parser.add_argument("--time-budget-seconds", type=float, default=None, help=argparse.SUPPRESS)
    parser.add_argument(
        "--location",
        dest="locations",
        action="append",
        choices=["China", "Hong Kong", "Singapore"],
        default=None,
        help="Search location; repeat for multiple regions (default: China)",
    )
    args = parser.parse_args()
    args.locations = args.locations or ["China"]
    if args.time_budget_seconds is not None:
        LOG.warning("Legacy stage budget ignored; company searches finish or report actual request failures")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    if args.max_workers < 1:
        parser.error("--max-workers must be >= 1")

    selected = [(company, spec) for company, spec in COMPANIES.items()
                if company != 'State Street' or STATE_STREET_INITIALIZED.is_file()]
    if 'State Street' in COMPANIES and not STATE_STREET_INITIALIZED.is_file():
        LOG.info('State Street deferred until the complete historical backfill is published')
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

    # Finish other companies before revisiting a rate-limited page, at most twice.
    for recovery_round in range(1, 3):
        recoveries = []
        for company, spec in selected:
            key = spec['canonical'].replace(' ', '_')
            path = args.output_dir / f'{key}.json'
            try:
                report = json.loads(path.read_text(encoding='utf-8'))
                if report.get('retryAt',0) > time.time():
                    LOG.info('Keep %s deferred; no idle wait for employer cooldown', key)
                    continue
                if any(re.match(r'^failed@start=\d+:.*HTTP 429', str(status)) for status in report.get('statusSummary', {}).values()):
                    recoveries.append((key, company, spec['company_id']))
            except (OSError, ValueError, TypeError, AttributeError):
                continue
        if recoveries:
            LOG.info('Recover rate-limited company pages round %s after other work: %s', recovery_round, [x[0] for x in recoveries])
            with ThreadPoolExecutor(max_workers=args.max_workers) as pool:
                pending = [pool.submit(run_one, args, key, company, company_id, resume=True) for key, company, company_id in recoveries]
                for future in as_completed(pending):
                    key, returncode, output = future.result()
                    LOG.info('resume completed %s exit=%s output=%s', key, returncode, output)
    
    # Preserve the old matrix's non-fatal company behavior: the downstream
    # combiner decides whether any valid company result can be published.
    LOG.info("company searches complete: total=%s failed=%s", len(selected), len(failures))
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    raise SystemExit(main())
