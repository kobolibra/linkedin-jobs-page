"""HTTP retries coordinated with the LinkedIn search/detail request policy."""
import random
import time
from urllib.parse import urlsplit

import requests
from jobspy.linkedin_http import (
    MAX_CONSECUTIVE_PAGE_429, RATE_LIMIT_COOLDOWN, RequestStopped,
    record_event, retry_after_seconds,
)


class CollectionStopped(ValueError):
    pass


class RateLimitStopped(requests.HTTPError):
    pass


class RequestPolicy:
    def __init__(self, deadline, attempts=3, base_delay=15, max_delay=120,
                 clock=time.monotonic, sleep=time.sleep, jitter=None, coordinator=None,
                 defer_on_429=False):
        self.deadline = deadline
        self.attempts = max(1, attempts)
        self.base_delay, self.max_delay = base_delay, max_delay
        self.coordinator, self.clock, self.sleep = coordinator, clock, sleep
        self.jitter = jitter or (lambda: random.uniform(0, 3))
        self.events, self.last = [], None
        self.defer_on_429 = defer_on_429

    def wait(self, seconds):
        if seconds > self.max_delay or self.clock() + seconds >= self.deadline:
            raise CollectionStopped('server wait exceeds collection budget')
        if seconds:
            self.sleep(seconds)

    def get(self, session, url):
        consecutive_429 = 0
        for attempt in range(1, self.attempts + 1):
            if self.clock() >= self.deadline:
                raise CollectionStopped('collection time budget exhausted')
            lease = None
            try:
                if self.coordinator:
                    lease = self.coordinator.acquire(url)
                response = session.get(url, timeout=(15, 15), stream=True)
                status = response.status_code
                value = response.headers.get('Retry-After')
                seconds = retry_after_seconds(value) if status in (429, 500, 502, 503, 504) else None
                record_event(stage='logos', host=urlsplit(url).hostname, status=status, attempt=attempt,
                             outcome='rate_limited' if status == 429 else 'response', retryAfterSeconds=seconds)
                if self.coordinator:
                    if status in (401, 403, 999):
                        self.coordinator.defer(url, 1800, stop=True, reason='HTTP ' + str(status))
                    elif status != 429:
                        self.coordinator.succeeded(url)
                self.last = {'requestUrl': url.split('?')[0], 'finalUrl': response.url.split('?')[0],
                             'status': status, 'contentType': response.headers.get('Content-Type', ''), 'attempt': attempt}
                if value:
                    self.last['retryAfter'] = value
                if status not in (429, 500, 502, 503, 504):
                    return response
                consecutive_429 = consecutive_429 + 1 if status == 429 else 0
                exhausted = attempt == self.attempts or consecutive_429 >= MAX_CONSECUTIVE_PAGE_429
                if seconds is None:
                    seconds = (RATE_LIMIT_COOLDOWN + self.jitter() if status == 429 else
                               min(self.max_delay, self.base_delay * 2 ** (attempt - 1) + self.jitter()))
                event = dict(self.last, waitSeconds=seconds)
                self.events.append(event)
                response.close()
                persistent = False
                if self.coordinator and status == 429:
                    persistent = self.coordinator.defer(url, seconds, stop=exhausted or self.defer_on_429)
                if status == 429 and self.defer_on_429:
                    event['deferred'] = True
                    raise RateLimitStopped(
                        f'RSS logo HTTP 429 deferred to the next publication; cooldown {seconds:.1f}s',
                        response=response,
                    )
                if persistent or exhausted:
                    if status == 429:
                        raise RateLimitStopped('HTTP 429 request deferred after repeated rate limit', response=response)
                    raise requests.HTTPError('transient HTTP retry budget exhausted', response=response)
            except RequestStopped as exc:
                raise RateLimitStopped(str(exc), response=exc.response) from exc
            finally:
                if lease:
                    self.coordinator.release(lease)
            try:
                self.wait(seconds)
            except CollectionStopped as cause:
                if status == 429:
                    if self.coordinator:
                        self.coordinator.defer(url, seconds, stop=True, observed=False)
                    raise RateLimitStopped(str(cause), response=response) from cause
                raise
            event['retried'] = True
        raise CollectionStopped('request budget exhausted')

