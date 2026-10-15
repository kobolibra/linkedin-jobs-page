"""Bounded LinkedIn HTTP policy with coordination across worker processes."""
from __future__ import annotations

import contextlib
import hashlib
import fcntl
import json
import logging
import os
import random
import re
import time
import tempfile
import uuid
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

import requests
from bs4 import BeautifulSoup

LOG = logging.getLogger("linkedin-http")
RATE_LIMIT_COOLDOWN = 60
MAX_CONSECUTIVE_PAGE_429 = 2  # Existing logo collector policy remains unchanged.
MAX_CONSECUTIVE_JOB_429 = 3
RECOVERY_MAX_INTERVAL = 6
RECOVERY_HEALTHY_RESPONSES = 5
RECOVERY_PACING_TTL = 300
GLOBAL_429_BASE = 30
GLOBAL_429_MAX = 120


class RequestStopped(requests.RequestException):
    """A shared cooldown or circuit makes another request unsafe this run."""
    def __init__(self, *args, recoverable=False, retry_at=None, **kwargs):
        self.retry_at = retry_at
        super().__init__(*args, **kwargs)
        self.recoverable = recoverable


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
                 max_concurrent=1, min_interval=3, max_wait=180, deadline=None, interval_jitter=0,
                 restore_recovery_pacing=True):
        self.path = Path(path or os.environ.get("LINKEDIN_HTTP_STATE", str(Path(tempfile.gettempdir()) / "linkedin-http-runtime.json")))
        self.clock, self.sleep = clock, sleep
        self.max_concurrent, self.min_interval = max(1, max_concurrent), max(0, min_interval)
        self.max_wait = max_wait
        self.interval_jitter = max(0, interval_jitter)
        self.recovery_pacing = False
        self.restore_recovery_pacing = restore_recovery_pacing
        # Normal collection completes its work rather than truncating a stage.
        # Explicit caller deadlines remain available for dedicated utilities.
        self.deadline = deadline if deadline is not None else float("inf")

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

    def fallback_429_delay(self, url):
        # Missing Retry-After does not establish a one-minute server embargo.
        # Escalate a short host pause only if distinct requests also keep failing.
        with self.locked() as state:
            streak = state.get(host_key(url), {}).get('consecutive429', 0)
        return min(GLOBAL_429_MAX, GLOBAL_429_BASE * 2 ** min(streak, 2) + random.uniform(0, 2))

    def defer_query(self, url, query, server_delay=0):
        with self.locked() as state:
            slot = state.setdefault(host_key(url), {})
            entry = slot.setdefault('runtimeQueries', {}).setdefault(query, {})
            failures = entry.get('failures', 0) + 1
            pause = max(server_delay, min(180, RATE_LIMIT_COOLDOWN * 2 ** min(failures - 1, 2)))
            entry.update(failures=failures, until=self.clock() + pause)
            return entry['until']

    def acquire(self, url, query=None):
        host = host_key(url)
        token = uuid.uuid4().hex
        while True:
            now = self.clock()
            if now >= self.deadline:
                raise RequestStopped("request time budget exhausted")
            with self.locked() as state:
                slot = state.setdefault(host, {})
                for field in ("paceUntil", "minInterval", "pacingUpdatedAt", "healthyResponses"):
                    slot.pop(field, None)
                stop_until = slot.get("stopUntil", 0)
                # A short 429 pause is recoverable. Do not discard every
                # subsequent company/JD before the shared pause can expire.
                # Login/challenge circuits still stop immediately; long rate
                # limits cannot outlive max_wait or an explicit caller deadline.
                if stop_until > now and slot.get("reason") != "HTTP 429":
                    raise RequestStopped("shared circuit open: " + slot.get("reason", "rate limited"))
                leases = {k: v for k, v in slot.get("leases", {}).items() if v > now}
                slot["leases"] = leases
                query_until = slot.get("runtimeQueries", {}).get(query, {}).get("until", 0) if query else 0
                delay = max(stop_until, slot.get("cooldownUntil", 0), slot.get("nextRequestAt", 0), query_until) - now
                concurrent = self.max_concurrent
                if delay <= 0 and len(leases) < concurrent:
                    leases[token] = now + 120
                    # Recovery pacing is shared by all threads/subprocesses on
                    # this runner, but is excluded from persisted cooldowns.
                    recovery = slot.get("runtimePacing", {})
                    if recovery.get("expiresAt", 0) <= now:
                        slot.pop("runtimePacing", None); recovery = {}
                    interval = max(self.min_interval, recovery.get("interval", 0)) if self.min_interval else 0
                    slot["nextRequestAt"] = now + interval + (random.uniform(0, self.interval_jitter) if self.interval_jitter else 0)
                    return host, token
                if len(leases) >= concurrent:
                    delay = max(delay, min(.25, min(leases.values()) - now))
                if stop_until > now and slot.get("reason") == "HTTP 429":
                    LOG.warning("Shared LinkedIn 429 pause pending: %.1fs remaining", delay)
            self.wait(max(.01, delay))

    def release(self, lease):
        host, token = lease
        with self.locked() as state:
            state.get(host, {}).get("leases", {}).pop(token, None)

    def defer(self, url, seconds, *, stop=False, reason="HTTP 429", observed=True):
        now = self.clock()
        until = now + max(0, seconds)
        with self.locked() as state:
            slot = state.setdefault(host_key(url), {})
            persistent = False
            if reason == "HTTP 429":
                if observed:
                    slot["consecutive429"] = slot.get("consecutive429", 0) + 1
                    if self.recovery_pacing and self.min_interval:
                        pacing = slot.setdefault("runtimePacing", {})
                        interval = max(self.min_interval, pacing.get("interval", self.min_interval))
                        pacing.update(interval=min(max(self.min_interval, RECOVERY_MAX_INTERVAL), interval * 1.5), healthy=0, expiresAt=until + RECOVERY_PACING_TTL)
                        LOG.warning("Shared LinkedIn recovery interval %.2fs; restore gradually after %s healthy responses", pacing["interval"], RECOVERY_HEALTHY_RESPONSES)
                if slot.get("consecutive429", 0) >= 6:
                    persistent = True
                    stop = True
                    reason = "persistent HTTP 429: six consecutive responses"
                    until = max(until, now + 900)
            slot["cooldownUntil"] = max(slot.get("cooldownUntil", 0), until)
            if stop:
                slot["stopUntil"] = max(slot.get("stopUntil", 0), until, now + (0 if reason == "HTTP 429" else 60))
                slot["reason"] = reason
            return persistent

    def succeeded(self, url, *, healthy=True, query=None):
        with self.locked() as state:
            slot = state.setdefault(host_key(url), {})
            slot["consecutive429"] = 0
            if healthy and query:
                slot.get("runtimeQueries", {}).pop(query, None)
            pacing = slot.get("runtimePacing")
            # A single successful response does not establish quota recovery.
            # Error responses break the 429 streak but never accelerate traffic.
            if pacing and not self.restore_recovery_pacing:
                # A single-pass liveness run must not repeatedly accelerate
                # into the same quota. Keep its bounded slower cadence until
                # this stage ends; it is never persisted to the next runner.
                pacing.update(healthy=0, expiresAt=self.clock() + RECOVERY_PACING_TTL)
            elif pacing and healthy:
                pacing["healthy"] = pacing.get("healthy", 0) + 1
                if pacing["healthy"] >= RECOVERY_HEALTHY_RESPONSES:
                    interval = max(self.min_interval, pacing["interval"] / 1.5)
                    if interval <= self.min_interval:
                        slot.pop("runtimePacing", None)
                    else:
                        pacing.update(interval=interval, healthy=0)
                    LOG.info("Shared LinkedIn recovery interval restored to %.2fs", interval)
            elif pacing:
                pacing["healthy"] = 0


class LinkedInSession(requests.Session):
    def __init__(self, *, attempts=3, coordinator=None, context=None, user_agents=None,
                 linear_backoff=False, defer_queries=True):
        super().__init__()
        self.attempts = max(1, attempts)
        self.coordinator = coordinator or Coordinator()
        self.coordinator.recovery_pacing = True
        self.context = context or {}
        self.user_agents = tuple(user_agents or ())
        self.linear_backoff = linear_backoff
        self.defer_queries = defer_queries

    def request(self, method, url, **kwargs):
        kwargs.setdefault("timeout", (10, 20))
        kwargs.setdefault("allow_redirects", False)
        consecutive_429 = 0
        stage = self.context.get('stage')
        query = (f"search:{self.context.get('company')}::{self.context.get('region')}" if stage == 'search' and self.context.get('company')
                 else f"liveness:{self.context.get('endpoint', 'view')}:{self.context.get('jobId')}" if stage == 'liveness' and self.context.get('jobId')
                 else f"job:{self.context.get('jobId')}" if stage == 'details' and self.context.get('jobId') else None)
        if not self.defer_queries:
            query = None
        prepared = requests.Request(method, url, params=kwargs.get('params')).prepare().url
        parts = urlsplit(prepared)
        canonical = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(sorted(parse_qsl(parts.query, keep_blank_values=True))), ''))
        request_key = hashlib.sha256((method.upper() + '\0' + canonical).encode()).hexdigest()[:24]
        for attempt in range(1, self.attempts + 1):
            if self.user_agents:
                self.headers["User-Agent"] = self.user_agents[(attempt - 1) % len(self.user_agents)]
            lease = self.coordinator.acquire(url, query=query)
            started = self.coordinator.clock()
            response = None
            try:
                try:
                    response = super().request(method, url, **kwargs)
                except requests.RequestException as exc:
                    record_event(**self.context, host=host_key(url), status=0, attempt=attempt, requestKey=request_key,
                                 outcome="network_error", error=type(exc).__name__)
                    if attempt == self.attempts:
                        raise
                if response is not None:
                    status = response.status_code
                    blocked = status in (401, 403, 999)
                    if host_key(url) == "linkedin.com" and status == 200:
                        blocked = blocked or block_page(response.text, response.url)
                    if status in (301, 302, 303, 307, 308):
                        blocked = blocked or block_page("", response.headers.get("Location", ""))
                    retry_after = (retry_after_seconds(response.headers.get("Retry-After"))
                                   if status in (429, 500, 502, 503, 504) else None)
                    rate_limit_delay = (retry_after if retry_after is not None else self.coordinator.fallback_429_delay(url)) if status == 429 else None
                    record_event(**self.context, host=host_key(url), status=status, attempt=attempt, requestKey=request_key,
                                 outcome="blocked" if blocked else "rate_limited" if status == 429 else "response",
                                 retryAfterSeconds=retry_after,
                                 cooldownSeconds=rate_limit_delay, cooldownSource=("server" if retry_after is not None else "client") if status == 429 else None,
                                 elapsedSeconds=round(self.coordinator.clock() - started, 3))
                    if blocked:
                        self.coordinator.defer(url, 1800, stop=True, reason="login/challenge or HTTP " + str(status))
                        response.close()
                        raise RequestStopped("LinkedIn blocked/login response", response=response)
                    if status != 429:
                        consecutive_429 = 0
                        self.coordinator.succeeded(url, healthy=200 <= status < 300, query=query)
                    if status not in (429, 500, 502, 503, 504):
                        return response
                    delay = rate_limit_delay if status == 429 else retry_after
                    if delay is None:
                        if self.linear_backoff:
                            delay = min(180, 15 * attempt + random.uniform(1, 8))
                        else:
                            delay = min(180, 15 * 2 ** (attempt - 1) + random.uniform(0, 3))
                    response.close()
                    if status == 429:
                        consecutive_429 += 1
                        exhausted = attempt == self.attempts or consecutive_429 >= MAX_CONSECUTIVE_JOB_429
                        persistent = self.coordinator.defer(url, delay, stop=exhausted and not query)
                        LOG.warning("LinkedIn %s %s::%s start=%s: HTTP 429 attempt=%s/%s; minimum shared pause=%.1fs; %s",
                                    self.context.get("stage", "request"), self.context.get("company", "unknown"),
                                    self.context.get("region", "unknown"), self.context.get("pageStart", "unknown"),
                                    attempt, self.attempts, max(900, delay) if persistent else delay,
                                    "persistent quota circuit opened" if persistent else "query deferred for later recovery" if query else "page deferred after repeated rate limit" if exhausted else "retry after pause")
                        if persistent:
                            raise RequestStopped("persistent LinkedIn rate limit; shared circuit opened", response=response)
                        if query:
                            retry_at = self.coordinator.defer_query(url, query, server_delay=delay)
                            record_event(**self.context, outcome="query_deferred", retryAt=retry_at)
                            LOG.info("Defer %s until %.3f; verified prefix is retained and other work can proceed after the shared pause", query, retry_at)
                            raise RequestStopped("HTTP 429 query deferred; resume after other work", response=response,
                                                 recoverable=delay <= self.coordinator.max_wait, retry_at=retry_at)
                        if exhausted:
                            raise RequestStopped("HTTP 429 page deferred; retry on a later run", response=response,
                                                 recoverable=delay <= self.coordinator.max_wait)
                    if attempt == self.attempts:
                        response.raise_for_status()
            finally:
                # Publish a server pause BEFORE freeing the request slot, so a
                # waiting process cannot slip a request into that pause.
                self.coordinator.release(lease)
            if response is None:
                self.coordinator.wait(min(60, 5 * 2 ** (attempt - 1) + random.uniform(0, 2)))
                continue
            try:
                self.coordinator.wait(delay)
            except RequestStopped:
                if status == 429:
                    self.coordinator.defer(url, delay, stop=True, observed=False)
                raise
        raise RequestStopped("HTTP retry budget exhausted")
