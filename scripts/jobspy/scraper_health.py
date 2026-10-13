"""Persist scraping health separately from the last known good job snapshot."""
import argparse
import json
import os
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


def read(path, default):
    if not path or not Path(path).exists():
        return default
    return json.loads(Path(path).read_text(encoding="utf-8"))


def cooldowns(*states, now=None):
    now = time.time() if now is None else now
    result = {}
    for state in states:
        for host, record in state.items():
            if not isinstance(record, dict):
                continue
            slot = result.setdefault(host, {})
            for field in ("cooldownUntil", "stopUntil"):
                slot[field] = max(slot.get(field, 0), record.get(field, 0))
            if record.get("stopUntil", 0) >= slot.get("stopUntil", 0):
                slot["reason"] = record.get("reason", "")
    return {host: slot for host, slot in result.items()
            if max(slot.get("cooldownUntil", 0), slot.get("stopUntil", 0)) > now}


def collect(args):
    events = []
    for line in Path(args.events).read_text().splitlines() if Path(args.events).exists() else []:
        try:
            events.append(json.loads(line))
        except ValueError:
            continue
    statuses = {}
    if args.search_dir:
        for path in sorted(Path(args.search_dir).glob("*.json")):
            try:
                statuses.update(read(path, {}).get("statusSummary", {}))
            except (ValueError, TypeError):
                statuses[path.stem] = "unreadable"
    responses = [event for event in events if "status" in event]
    search_transport = {}
    for event in responses:
        if event.get("stage") != "search" or not event.get("company"):
            continue
        query = str(event["company"]) + "::" + str(event.get("region", "unknown"))
        stats = search_transport.setdefault(query, {"requests": 0, "retries": 0,
                                                    "httpStatuses": {}, "rateLimitedPages": []})
        stats["requests"] += 1
        stats["retries"] += event.get("attempt", 1) > 1
        code = str(event["status"])
        stats["httpStatuses"][code] = stats["httpStatuses"].get(code, 0) + 1
        if code == "429" and "pageStart" in event and event["pageStart"] not in stats["rateLimitedPages"]:
            stats["rateLimitedPages"].append(event["pageStart"])
        if code == "429" and event.get("retryAfterSeconds") is not None:
            stats["maxRetryAfterSeconds"] = max(stats.get("maxRetryAfterSeconds", 0), event["retryAfterSeconds"])
    report = {
        "runId": args.task + ":" + os.environ.get("GITHUB_RUN_ID", "local") + ":" + os.environ.get("GITHUB_RUN_ATTEMPT", "1"),
        "task": args.task, "workflowStatus": args.workflow_status, "observedAt": datetime.now(timezone.utc).isoformat(),
        "requests": len(responses), "retries": sum(event.get("attempt", 1) > 1 for event in responses),
        "httpStatuses": dict(Counter(str(event["status"]) for event in responses)),
        "outcomes": dict(Counter(event.get("outcome", "unknown") for event in events)),
        "stages": dict(Counter(event.get("stage", "unknown") for event in responses)),
        "detailEndpoints": dict(Counter(event.get("endpoint", "unknown") for event in events if event.get("outcome") == "parsed")),
        "queries": statuses,
        "searchTransport": search_transport,
        "cooldowns": cooldowns(read(args.state, {})),
    }
    if args.task == "jobs":
        # Inputs are only supplied when those steps ran in this invocation.
        report["details"] = read(args.details, {}).get("health", {})
        report["liveness"] = read(args.liveness, {}).get("stats", {})
        # The health step runs after skipped publishing steps, when job.status
        # can still say success. Record the known all-source failure honestly.
        details = report["details"]
        all_details_blocked = bool(details.get("attempted")) and details.get("blocked") == details.get("attempted") and not details.get("ok")
        if not any(str(value).startswith(("ok:", "empty")) for value in statuses.values()) or all_details_blocked:
            report["workflowStatus"] = "failure"
    else:
        report["logos"] = read(args.logo_report, {})
    return report


def merge_history(previous, report):
    reports = {x["runId"]: x for x in previous.get("runs", [])}
    reports[report["runId"]] = report
    runs = sorted(reports.values(), key=lambda x: (x["observedAt"], x["runId"]))[-40:]
    streaks = {}
    for entry in runs:
        for query, status in entry.get("queries", {}).items():
            failed = not str(status).startswith(("ok:", "empty"))
            streaks[query] = streaks.get(query, 0) + 1 if failed else 0
    return {"schemaVersion": "1.0", "runs": runs, "queryFailureStreaks": streaks}


def alerts(report):
    statuses = list(report.get("queries", {}).values())
    failures = [x for x in statuses if str(x).startswith(("failed", "process-failed", "unreadable"))]
    reliable = any(str(x).startswith(("ok:", "empty")) for x in statuses)
    details = report.get("details", {})
    all_details_blocked = bool(details.get("attempted")) and details.get("blocked") == details.get("attempted") and not details.get("ok")
    critical = (bool(statuses) and not reliable) or report.get("workflowStatus") == "failure" or (report.get("task") == "jobs" and not statuses) or all_details_blocked
    issues = []
    if critical:
        issues.append("Search coverage or detail enrichment failed; preserve verified observations and existing JD, and never expire jobs from incomplete queries")
    elif statuses and any(not str(x).startswith(("ok:", "empty")) for x in statuses):
        issues.append("Company search incomplete or zero results untrusted; inspect health queries")
    if report.get("httpStatuses", {}).get("429") or report.get("outcomes", {}).get("blocked"):
        issues.append("LinkedIn rate limit or login/challenge detected; shared cooldown applied")
    if report.get("liveness", {}).get("selectorGuardTripped") or report.get("liveness", {}).get("circuitOpen"):
        issues.append("Liveness guard or circuit opened; uncertain observations are not expiry evidence")
    if report.get("liveness", {}).get("budgetExhausted"):
        issues.append("Liveness stage budget reached; unprocessed jobs remain due for a later run")
    if report.get("logos", {}).get("stoppedReason"):
        issues.append("Logo collection stopped: " + report["logos"]["stoppedReason"])
    details = report.get("details", {})
    if details.get("attempted") and not details.get("ok"):
        issues.append("No attempted job details parsed successfully; existing JD retained")
    elif details.get("blocked"):
        issues.append("Some job details deferred by limits or stage budget; existing JD retained")
    return critical, issues


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", choices=("jobs", "logos"), default="jobs")
    parser.add_argument("--workflow-status", default="success")
    parser.add_argument("--events", default=os.environ.get("LINKEDIN_HEALTH_EVENTS", "/tmp/linkedin-health.jsonl"))
    parser.add_argument("--state", default=os.environ.get("LINKEDIN_HTTP_STATE", "data/jobspy/http-state.json"))
    parser.add_argument("--search-dir")
    parser.add_argument("--details")
    parser.add_argument("--liveness")
    parser.add_argument("--logo-report")
    parser.add_argument("--snapshot")
    parser.add_argument("--apply")
    parser.add_argument("--history", default="data/jobspy/health.json")
    args = parser.parse_args()
    if args.snapshot:
        write(args.snapshot, collect(args))
        return 0
    report = read(args.apply, {})
    if not report.get("runId"):
        parser.error("--apply requires a valid captured report")
    history = merge_history(read(args.history, {}), report)
    write(args.history, history)
    write(args.state, cooldowns(read(args.state, {}), report.get("cooldowns", {})))
    critical, issues = alerts(report)
    for issue in issues:
        print("::" + ("error" if critical else "warning") + " title=LinkedIn scraping health::" + issue)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as handle:
            handle.write("\n### LinkedIn scraping health\n\n")
            handle.write(f"Task: {report['task']} · Requests: {report['requests']} · Retries: {report['retries']}\n\n")
            handle.write("\n".join("- " + issue for issue in issues) or "No scraping transport alarms detected.")
            handle.write("\n")
    # Commit the report before marking an all-source failure in the workflow.
    return 2 if critical else 0


if __name__ == "__main__":
    raise SystemExit(main())
