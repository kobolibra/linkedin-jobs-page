"""Bounded LinkedIn HTTP policy with coordination across worker processes."""
from __future__ import annotations

import contextlib
import fcntl
import json
import os
import random
import re
import time
import uuid
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlsplit

import requests


class RequestStopped(requests.RequestException):
    """A shared cooldown or circuit makes another request unsafe this run."""


def retry_after_seconds(value, now=None):
    value = str(value or "").strip()
    if value.isdigit():
        return int(value)
    try:
        when = parsedate_to_datetime(value)
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        return max(0, (when - (now or datetime.now(timezone.utc))).total_seconds())
    except (ValueError, TypeError, OverflowError):
        return None


def host_key(url):
    host = (urlsplit(url).hostname or "").lower()
    for domain in ("linkedin.com", "licdn.com"):
        if host == domain or host.endswith("." + domain):
            return domain
    return host


def block_page(html, final_url=""):
    path = urlsplit(final_url).path.lower()
    if re.search(r"/(authwall|checkpoint|login|uas/login)(?:/|$)", path):
        return True
    return bool(re.search(
        r'(?:class=[\"\'][^\"\']*authwall|id=[\"\']challenge|'
        r'class=[\"\'][^\"\']*login__form|name=[\"\']session_key|'
        r'captcha|security verification)', str(html or ""), re.I))


def record_event(**event):
    target = os.environ.get("LINKEDIN_HEALTH_EVENTS")
    if not target:
        return
    event.update(at=datetime.now(timezone.utc).isoformat(), runId=os.environ.get("GITHUB_RUN_ID", "local"))
    path = Path(target)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        handle.write(json.dumps(event, ensure_ascii=False) + "\n")
        handle.flush()


class Coordinator:
    """File leases coordinate threads AND subprocesses on the same runner.

    Only cooldowns are persisted for later runners; live leases are ephemeral.
    Different GitHub runners do not share a file lock.
    """
    def __init__(self, path=None, *, clock=time.time, sleep=time.sleep,
                 max_concurrent=2, min_interval=1.5, max_wait=180, deadline=None):
        self.path = Path(path or os.environ.get("LINKEDIN_HTTP_STATE", "data/jobspy/http-state.json"))
        self.clock, self.sleep = clock, sleep
        self.max_concurrent, self.min_interval = max(1, max_concurrent), max(0, min_interval)
        self.max_wait = max_wait
        self.deadline = deadline if deadline is not None else clock() + 2400

    @contextlib.contextmanager
    def locked(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a+", encoding="utf-8") as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            handle.seek(0)
            raw = handle.read()
            try:
                state = json.loads(raw) if raw.strip() else {}
                if not isinstance(state, dict):
                    raise ValueError("invalid shared HTTP state")
            except (ValueError, TypeError) as exc:
                raise RequestStopped("shared HTTP state unreadable; refusing uncoordinated requests") from exc
            yield state
            handle.seek(0)
            handle.truncate()
            json.dump(state, handle)
            handle.flush()

    def wait(self, seconds):
        if seconds > self.max_wait or self.clock() + seconds >= self.deadline:
            raise RequestStopped("server cooldown exceeds remaining request budget")
        if seconds > 0:
            self.sleep(seconds)

    def acquire(self, url):
        host = host_key(url)
        token = uuid.uuid4().hex
        while True:
            now = self.clock()
            if now >= self.deadline:
                raise RequestStopped("request time budget exhausted")
            with self.locked() as state:
                slot = state.setdefault(host, {})
                if slot.get("stopUntil", 0) > now:
                    raise RequestStopped("shared circuit open: " + slot.get("reason", "rate limited"))
                leases = {k: v for k, v in slot.get("leases", {}).items() if v > now}
                slot["leases"] = leases
                delay = max(slot.get("cooldownUntil", 0), slot.get("nextRequestAt", 0)) - now
                if delay <= 0 and len(leases) < self.max_concurrent:
                    leases[token] = now + 120
                    slot["nextRequestAt"] = now + self.min_interval
                    return host, token
                if len(leases) >= self.max_concurrent:
                    delay = max(delay, min(.25, min(leases.values()) - now))
            self.wait(max(.01, delay))

    def release(self, lease):
        host, token = lease
        with self.locked() as state:
            state.get(host, {}).get("leases", {}).pop(token, None)

    def defer(self, url, seconds, *, stop=False, reason="HTTP 429"):
        now = self.clock()
        until = now + max(0, seconds)
        with self.locked() as state:
            slot = state.setdefault(host_key(url), {})
            slot["cooldownUntil"] = max(slot.get("cooldownUntil", 0), until)
            if stop:
                slot["stopUntil"] = max(slot.get("stopUntil", 0), until, now + 60)
                slot["reason"] = reason


class LinkedInSession(requests.Session):
    def __init__(self, *, attempts=3, coordinator=None, context=None, user_agents=None):
        super().__init__()
        self.attempts = max(1, attempts)
        self.coordinator = coordinator or Coordinator()
        self.context = context or {}
        self.user_agents = tuple(user_agents or ())

    def request(self, method, url, **kwargs):
        kwargs.setdefault("timeout", (10, 20))
        kwargs.setdefault("allow_redirects", False)
        for attempt in range(1, self.attempts + 1):
            if self.user_agents:
                self.headers["User-Agent"] = self.user_agents[(attempt - 1) % len(self.user_agents)]
            lease = self.coordinator.acquire(url)
            started = self.coordinator.clock()
            response = None
            try:
                response = super().request(method, url, **kwargs)
            except requests.RequestException as exc:
                record_event(**self.context, host=host_key(url), status=0, attempt=attempt,
                             outcome="network_error", error=type(exc).__name__)
                if attempt == self.attempts:
                    raise
            finally:
                self.coordinator.release(lease)
            if response is None:
                self.coordinator.wait(min(60, 5 * 2 ** (attempt - 1) + random.uniform(0, 2)))
                continue
            status = response.status_code
            blocked = status in (401, 403, 999)
            if host_key(url) == "linkedin.com" and status == 200:
                blocked = blocked or block_page(response.text, response.url)
            if status in (301, 302, 303, 307, 308):
                blocked = blocked or block_page("", response.headers.get("Location", ""))
            record_event(**self.context, host=host_key(url), status=status, attempt=attempt,
                         outcome="blocked" if blocked else "rate_limited" if status == 429 else "response",
                         elapsedSeconds=round(self.coordinator.clock() - started, 3))
            if blocked:
                self.coordinator.defer(url, 1800, stop=True, reason="login/challenge or HTTP " + str(status))
                response.close()
                raise RequestStopped("LinkedIn blocked/login response", response=response)
            if status != 429 and status not in (500, 502, 503, 504):
                return response
            delay = retry_after_seconds(response.headers.get("Retry-After"))
            if delay is None:
                delay = min(180, 15 * 2 ** (attempt - 1) + random.uniform(0, 3))
            response.close()
            if status == 429:
                self.coordinator.defer(url, delay, stop=attempt == self.attempts)
            if attempt == self.attempts:
                if status == 429:
                    raise RequestStopped("HTTP 429 retry budget exhausted", response=response)
                response.raise_for_status()
            try:
                self.coordinator.wait(delay)
            except RequestStopped:
                if status == 429:
                    self.coordinator.defer(url, delay, stop=True)
                raise
        raise RequestStopped("HTTP retry budget exhausted")
