"""Retry transient deployment transport errors; fail fast on config/auth errors."""
import argparse
import os
import re
import signal
import subprocess
import sys
import time

COMMAND = ["npx", "--no-install", "wrangler", "deploy", "--config", "wrangler.jsonc"]
ANSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")


def transient_error(output):
    plain = ANSI.sub("", output)
    if re.search(r"Authentication error|Invalid API Token|Unauthorized|Forbidden|"
                 r"(?:HTTP|status(?: code)?)\s*[:=]?\s*(?:400|401|403)\b|"
                 r"\b(?:10000|10001)\b|ParseError|Unrecognized key|"
                 r"Could not resolve|No such file|Binding.*not found", plain, re.I):
        return False
    if "Received a malformed response from the API" in plain and re.search(r"->\s*200\b", plain):
        return True
    return bool(re.search(
        r"(?:HTTP|status(?: code)?|->)\s*[:=]?\s*(?:429|500|502|503|504)\b|"
        r"\b(?:502 Bad Gateway|503 Service Unavailable|504 Gateway Timeout)\b|"
        r"\b(?:ETIMEDOUT|ECONNRESET|EAI_AGAIN|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET)\b|"
        r"fetch failed|socket hang up|network connection.*(?:lost|timeout)", plain, re.I))


def run_command(command, *, stdout, stderr, text, timeout):
    # npx launches descendants; kill the complete process group before retrying.
    with subprocess.Popen(command, stdout=stdout, stderr=stderr, text=text,
                          start_new_session=True) as process:
        try:
            output, _ = process.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.communicate()
            raise
        return subprocess.CompletedProcess(command, process.returncode, output)


def deploy(*, attempts=3, timeout=240, run=run_command, sleep=time.sleep,
           report=print, summary=None):
    if attempts < 1 or timeout <= 0:
        raise ValueError("deployment attempts and timeout must be positive")
    for attempt in range(1, attempts + 1):
        report(f"Cloudflare deployment attempt {attempt}/{attempts}")
        try:
            result = run(COMMAND, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         text=True, timeout=timeout)
            output = result.stdout or ""
            if output:
                report(output.rstrip())
            code = result.returncode
            retry = transient_error(output)
        except subprocess.TimeoutExpired:
            code, retry = 124, True
            report(f"::warning::Wrangler exceeded {timeout}s; deployment result is unconfirmed")
        if code == 0:
            if summary:
                with open(summary, "a", encoding="utf-8") as handle:
                    handle.write(f"\nCloudflare deployment succeeded on attempt {attempt}/{attempts}.\n")
            return 0
        if not retry or attempt == attempts:
            report(f"::error::Cloudflare deployment failed after {attempt} attempt(s); publication is not confirmed")
            return code if code > 0 else 1
        delay = min(120, 30 * 2 ** (attempt - 1))
        report(f"::warning::Transient Cloudflare deployment error; retrying in {delay}s")
        sleep(delay)
    return 1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--attempts", type=int, default=3)
    parser.add_argument("--timeout", type=int, default=240)
    args = parser.parse_args()
    return deploy(attempts=args.attempts, timeout=args.timeout,
                  summary=os.environ.get("GITHUB_STEP_SUMMARY"))


if __name__ == "__main__":
    sys.exit(main())
