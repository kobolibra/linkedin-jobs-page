"""Bounded HTTP retries with site-wide stopping when a rate limit persists."""
import random, time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlsplit
import requests

class CollectionStopped(ValueError):
    pass

class RateLimitStopped(requests.HTTPError):
    pass

def retry_after_seconds(value, now=None):
    value=str(value or '').strip()
    if value.isdigit(): return int(value)
    try:
        when=parsedate_to_datetime(value)
        if when.tzinfo is None: when=when.replace(tzinfo=timezone.utc)
        return max(0,(when-(now or datetime.now(timezone.utc))).total_seconds())
    except (ValueError,TypeError,OverflowError): return None

class RequestPolicy:
    def __init__(self, deadline, attempts=3, base_delay=15, max_delay=120, clock=time.monotonic, sleep=time.sleep, jitter=None):
        self.deadline=deadline;self.attempts=max(1,attempts);self.base_delay=base_delay;self.max_delay=max_delay
        self.clock=clock;self.sleep=sleep;self.jitter=jitter or (lambda:random.uniform(0,3));self.events=[];self.last=None
    def wait(self, seconds):
        if seconds>self.max_delay or self.clock()+seconds>=self.deadline: raise CollectionStopped('server wait exceeds collection budget')
        if seconds: self.sleep(seconds)
    def get(self, session, url):
        for attempt in range(1,self.attempts+1):
            if self.clock()>=self.deadline: raise CollectionStopped('collection time budget exhausted')
            response=session.get(url,timeout=(15,15),stream=True)
            self.last={'requestUrl':url.split('?')[0],'finalUrl':response.url.split('?')[0],'status':response.status_code,'contentType':response.headers.get('Content-Type',''),'attempt':attempt}
            value=response.headers.get('Retry-After')
            if value: self.last['retryAfter']=value
            if response.status_code not in (429,500,502,503,504): return response
            event=dict(self.last);self.events.append(event)
            response.close()
            if attempt==self.attempts:
                error=RateLimitStopped('HTTP 429 retry budget exhausted',response=response) if response.status_code==429 else requests.HTTPError('transient HTTP retry budget exhausted',response=response)
                raise error
            seconds=retry_after_seconds(value)
            if seconds is None: seconds=min(self.max_delay,self.base_delay*2**(attempt-1)+self.jitter())
            event['waitSeconds']=seconds
            try: self.wait(seconds)
            except CollectionStopped as cause:
                if response.status_code==429: raise RateLimitStopped(str(cause),response=response) from cause
                raise
            event['retried']=True
        raise CollectionStopped('request budget exhausted')
