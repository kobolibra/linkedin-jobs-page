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
from bs4 import BeautifulSoup


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
    soup = BeautifulSoup(str(html or ""), "html.parser")
    # Public job pages contain a sign-in modal and recaptcha configuration.
    # A readable listing/JD is not an authentication wall; identity is checked
    # separately by the listing/detail parser before any data is accepted.
    public = soup.select("div.base-search-card h3.base-search-card__title, .show-more-less-html__markup, .description__text")
    if any(element.get_text(" ", strip=True) for element in public):
        return False
    if soup.select_one(".authwall, #challenge, form.login__form, input[name=session_key]"):
        return True
    for element in soup.select("script, style, template"):
        element.decompose()
    return bool(re.search(r"captcha|security verification", soup.get_text(" ", strip=True), re.I))


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
                 max_concurrent=1, min_interval=2.5, max_wait=180, deadline=None):
        self.path = Path(path or os.environ.get("LINKEDIN_HTTP_STATE", "data/jobspy/http-state.json"))
        self.clock, self.sleep = clock, sleep
        self.max_concurrent, self.min_interval = max(1, max_concurrent), max(0, min_interval)
        self.max_wait = max_wait
        self.deadline = deadline if deadline is not None else float(os.environ.get("LINKEDIN_HTTP_DEADLINE", clock() + 2400))

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
                stop_until = slot.get("stopUntil", 0)
                # A short 429 pause is recoverable. Do not discard every
                # subsequent company/JD before the shared pause can expire.
                # Login/challenge circuits still stop immediately; long rate
                # limits cannot outlive max_wait or the stage deadline below.
                if stop_until > now and slot.get("reason") != "HTTP 429":
                    raise RequestStopped("shared circuit open: " + slot.get("reason", "rate limited"))
                leases = {k: v for k, v in slot.get("leases", {}).items() if v > now}
                slot["leases"] = leases
                delay = max(stop_until, slot.get("cooldownUntil", 0), slot.get("nextRequestAt", 0)) - now
                pacing = min(8, slot.get("minInterval", 0)) if slot.get("paceUntil", 0) > now else 0
                concurrent = 1 if pacing else self.max_concurrent
                if delay <= 0 and len(leases) < concurrent:
                    leases[token] = now + 120
                    slot["nextRequestAt"] = now + max(self.min_interval, pacing)
                    return host, token
                if len(leases) >= concurrent:
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
            if reason == "HTTP 429":
                previous = slot.get("minInterval", 0) if slot.get("paceUntil", 0) > now else 0
                slot["minInterval"] = min(8, max(4, max(self.min_interval, previous) * 1.5))
                slot["paceUntil"] = now + 900
                slot["pacingUpdatedAt"] = now
                slot["healthyResponses"] = 0
            if stop:
                slot["stopUntil"] = max(slot.get("stopUntil", 0), until, now + 60)
                slot["reason"] = reason

    def succeeded(self, url):
        now = self.clock()
        with self.locked() as state:
            slot = state.setdefault(host_key(url), {})
            if slot.get("paceUntil", 0) <= now:
                return
            # Bound old persisted pacing too; sustained successful requests
            # gradually return toward the baseline instead of staying slow.
            slot["minInterval"] = min(8, slot.get("minInterval", self.min_interval))
            slot["pacingUpdatedAt"] = now
            slot["healthyResponses"] = slot.get("healthyResponses", 0) + 1
            if slot["healthyResponses"] >= 5:
                slot["healthyResponses"] = 0
                slot["minInterval"] = max(self.min_interval, slot["minInterval"] - 1)
            slot["nextRequestAt"] = min(slot.get("nextRequestAt", now), now + max(self.min_interval, slot["minInterval"]))


class LinkedInSession(requests.Session):
    def __init__(self, *, attempts=3, coordinator=None, context=None, user_agents=None,
                 linear_backoff=False):
        super().__init__()
        self.attempts = max(1, attempts)
        self.coordinator = coordinator or Coordinator()
        self.context = context or {}
        self.user_agents = tuple(user_agents or ())
        self.linear_backoff = linear_backoff

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
            retry_after = retry_after_seconds(response.headers.get("Retry-After")) if status == 429 or status in (500, 502, 503, 504) else None
            record_event(**self.context, host=host_key(url), status=status, attempt=attempt,
                         outcome="blocked" if blocked else "rate_limited" if status == 429 else "response",
                         retryAfterSeconds=retry_after,
                         elapsedSeconds=round(self.coordinator.clock() - started, 3))
            if blocked:
                self.coordinator.defer(url, 1800, stop=True, reason="login/challenge or HTTP " + str(status))
                response.close()
                raise RequestStopped("LinkedIn blocked/login response", response=response)
            if status != 429 and status not in (500, 502, 503, 504):
                if status == 200:
                    self.coordinator.succeeded(url)
                return response
            delay = retry_after
            if delay is None:
                delay = (min(180, 15 * attempt + random.uniform(1, 8))
                         if self.linear_backoff else
                         min(180, 15 * 2 ** (attempt - 1) + random.uniform(0, 3)))
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
