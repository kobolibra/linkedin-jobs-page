import unittest
from datetime import datetime,timezone
from unittest.mock import Mock
from types import SimpleNamespace
from logo_http import RequestPolicy,RateLimitStopped,retry_after_seconds
from jobspy.linkedin_http import Coordinator
import json
import tempfile
from pathlib import Path

def response(status,headers=None):
    return SimpleNamespace(status_code=status,headers=headers or {},url='https://www.linkedin.com/jobs/view/12345',close=Mock())

class HttpTests(unittest.TestCase):
    def test_rss_429_is_deferred_without_sleep_or_another_request(self):
        for headers, pause in (({}, 60), ({'Retry-After':'3600'}, 3600)):
            with self.subTest(headers=headers), tempfile.TemporaryDirectory() as tmp:
                coordinator=Coordinator(Path(tmp)/'state.json',clock=lambda:0,min_interval=0)
                session=Mock();session.get.return_value=response(429,headers);sleep=Mock()
                policy=RequestPolicy(1000,clock=lambda:0,sleep=sleep,jitter=lambda:0,
                                     coordinator=coordinator,defer_on_429=True)
                with self.assertRaises(RateLimitStopped):
                    policy.get(session,'https://www.linkedin.com/jobs/view/12345')
                self.assertEqual(session.get.call_count,1);sleep.assert_not_called()
                session.get.return_value.close.assert_called_once()
                state=json.loads(coordinator.path.read_text())['linkedin.com']
                self.assertEqual(state['consecutive429'],1)
                self.assertGreaterEqual(state['stopUntil'],pause)
                self.assertTrue(policy.events[0]['deferred'])
                self.assertFalse(policy.events[0].get('retried',False))

    def test_retry_after_seconds_and_http_date(self):
        self.assertEqual(retry_after_seconds('3'),3)
        self.assertEqual(retry_after_seconds('Mon, 12 Oct 2026 10:00:03 GMT',datetime(2026,10,12,10,tzinfo=timezone.utc)),3)
        self.assertIsNone(retry_after_seconds('bad'))
    def test_429_waits_for_header_then_succeeds(self):
        sleep=Mock();limited=response(429,{'Retry-After':'3'});ok=response(200)
        session=Mock();session.get.side_effect=[limited,ok]
        policy=RequestPolicy(100,clock=lambda:0,sleep=sleep,jitter=lambda:0)
        self.assertIs(policy.get(session,ok.url),ok);sleep.assert_called_once_with(3);limited.close.assert_called_once()
    def test_persistent_limit_stops_and_does_not_request_again(self):
        session=Mock();session.get.side_effect=[response(429),response(429),response(429)]
        policy=RequestPolicy(1000,clock=lambda:0,sleep=Mock(),jitter=lambda:0)
        with self.assertRaises(RateLimitStopped):policy.get(session,'https://www.linkedin.com/jobs/view/12345')
        self.assertEqual(session.get.call_count,2)
    def test_long_server_wait_does_not_retry_early(self):
        session=Mock();session.get.return_value=response(429,{'Retry-After':'3600'});sleep=Mock()
        with self.assertRaises(RateLimitStopped):RequestPolicy(1000,clock=lambda:0,sleep=sleep).get(session,'https://www.linkedin.com/jobs/view/12345')
        self.assertEqual(session.get.call_count,1);sleep.assert_not_called()

    def test_logo_long_wait_counts_one_actual_429_and_preserves_server_pause(self):
        with tempfile.TemporaryDirectory() as tmp:
            coordinator=Coordinator(Path(tmp)/'state.json',clock=lambda:0,min_interval=0)
            session=Mock();session.get.return_value=response(429,{'Retry-After':'3600'})
            with self.assertRaises(RateLimitStopped):
                RequestPolicy(1000,clock=lambda:0,sleep=Mock(),coordinator=coordinator).get(session,'https://www.linkedin.com/jobs/view/12345')
            state=json.loads(coordinator.path.read_text())['linkedin.com']
            self.assertEqual(state['consecutive429'],1)
            self.assertGreaterEqual(state['stopUntil'],3600)
            self.assertEqual(session.get.call_count,1)

    def test_logo_success_resets_quota_streak_and_uses_shared_fallback_wait(self):
        with tempfile.TemporaryDirectory() as tmp:
            now=[0]
            def sleep(seconds):now[0]+=seconds
            coordinator=Coordinator(Path(tmp)/'state.json',clock=lambda:now[0],sleep=sleep,min_interval=0)
            session=Mock();session.get.side_effect=[response(429),response(200)]
            policy=RequestPolicy(1000,clock=lambda:now[0],sleep=sleep,jitter=lambda:0,coordinator=coordinator)
            self.assertEqual(policy.get(session,'https://www.linkedin.com/jobs/view/12345').status_code,200)
            self.assertEqual(now[0],60)
            self.assertEqual(json.loads(coordinator.path.read_text())['linkedin.com']['consecutive429'],0)

