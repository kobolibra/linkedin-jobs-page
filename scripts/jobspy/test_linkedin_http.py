import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import requests
from linkedin_http import Coordinator, LinkedInSession, RequestStopped, retry_after_seconds


def response(status=200, text="<main>ok</main>", headers=None, url="https://www.linkedin.com/jobs/view/123456789"):
    result = requests.Response()
    result.status_code = status
    result._content = text.encode()
    result.url = url
    result.headers.update(headers or {})
    result.close = lambda: None
    return result


class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.now = 0.0
        self.sleeps = []
        def sleep(seconds):
            self.sleeps.append(seconds)
            self.now += seconds
        self.coordinator = Coordinator(Path(self.tmp.name)/'http.json', clock=lambda: self.now,
                                       sleep=sleep, min_interval=0, max_concurrent=2, deadline=10000)
        self.session = LinkedInSession(coordinator=self.coordinator)
        self.addCleanup(self.session.close)

    def test_retry_after_then_success(self):
        with patch('requests.Session.request', side_effect=[response(429, headers={'Retry-After':'7'}), response()]) as get:
            self.assertEqual(self.session.get('https://www.linkedin.com').status_code, 200)
            self.assertEqual(get.call_count, 2)
        self.assertEqual(self.sleeps, [7])

    def test_exhausted_429_pauses_peers_then_allows_recovery(self):
        with patch('requests.Session.request', return_value=response(429, headers={'Retry-After':'2'})) as get:
            with self.assertRaises(RequestStopped): self.session.get('https://www.linkedin.com')
            self.assertEqual(get.call_count, 3)
        stopped=json.loads(self.coordinator.path.read_text())['linkedin.com']['stopUntil']
        peer=LinkedInSession(coordinator=self.coordinator);self.addCleanup(peer.close)
        with patch('requests.Session.request',return_value=response()) as get:
            self.assertEqual(peer.get('https://linkedin.com/jobs/view/777777777').status_code,200)
            self.assertGreaterEqual(self.now,stopped)
            self.assertEqual(get.call_count,1)

    def test_shared_429_pause_longer_than_stage_budget_sends_no_request(self):
        self.coordinator.defer('https://www.linkedin.com',120,stop=True)
        self.coordinator.deadline=100
        with patch('requests.Session.request') as get:
            with self.assertRaises(RequestStopped):self.session.get('https://www.linkedin.com')
            get.assert_not_called()
        self.assertEqual(self.sleeps,[])

    def test_explicit_long_server_pause_is_not_bypassed_by_peers(self):
        self.coordinator.defer('https://www.linkedin.com',3600,stop=True)
        with patch('requests.Session.request') as get:
            with self.assertRaises(RequestStopped):self.session.get('https://www.linkedin.com')
            get.assert_not_called()
        self.assertEqual(self.sleeps,[])

    def test_rate_limit_keeps_slower_pacing_after_recovery_and_shares_it(self):
        with patch('requests.Session.request', side_effect=[response(429, headers={'Retry-After':'7'}), response(), response()]) as get:
            self.session.get('https://www.linkedin.com')
            peer=Coordinator(self.coordinator.path,clock=lambda:self.now,sleep=self.coordinator.sleep,min_interval=0,max_concurrent=2,deadline=10000)
            other=LinkedInSession(coordinator=peer);self.addCleanup(other.close)
            other.get('https://linkedin.com/jobs/view/88888888')
            self.assertEqual(get.call_count,3)
        self.assertEqual(self.sleeps,[7,4])
        state=json.loads(self.coordinator.path.read_text())['linkedin.com']
        self.assertEqual(state['minInterval'],4)
        self.coordinator.defer('https://www.linkedin.com',2)
        self.assertEqual(json.loads(self.coordinator.path.read_text())['linkedin.com']['minInterval'],6)

    def test_successful_responses_gradually_restore_pacing(self):
        self.coordinator.defer('https://www.linkedin.com',0)
        self.coordinator.defer('https://www.linkedin.com',0)
        self.coordinator.defer('https://www.linkedin.com',0)
        self.assertEqual(json.loads(self.coordinator.path.read_text())['linkedin.com']['minInterval'],8)
        for _ in range(5):self.coordinator.succeeded('https://www.linkedin.com')
        self.assertEqual(json.loads(self.coordinator.path.read_text())['linkedin.com']['minInterval'],7)

    def test_recovered_pacing_survives_health_publish_and_next_runner(self):
        from scraper_health import cooldowns
        old={'linkedin.com':{'paceUntil':900,'minInterval':30}}
        self.coordinator.path.write_text(json.dumps(old))
        self.now=100
        for _ in range(5):self.coordinator.succeeded('https://www.linkedin.com')
        runtime=json.loads(self.coordinator.path.read_text())
        published=cooldowns(old,cooldowns(runtime,now=self.now),now=self.now)
        self.assertEqual(published['linkedin.com']['minInterval'],7)
        self.coordinator.path.write_text(json.dumps(published))
        peer=Coordinator(self.coordinator.path,clock=lambda:self.now,sleep=self.coordinator.sleep,min_interval=2.5,deadline=10000)
        first=peer.acquire('https://www.linkedin.com');peer.release(first)
        second=peer.acquire('https://www.linkedin.com');peer.release(second)
        self.assertEqual(self.sleeps,[7])

    def test_stage_deadline_is_shared_by_new_coordinators(self):
        with patch.dict('os.environ',{'LINKEDIN_HTTP_DEADLINE':'123'}):
            peer=Coordinator(self.coordinator.path,clock=lambda:0)
            self.assertEqual(peer.deadline,123)

    def test_search_retains_legacy_linear_retry_timing(self):
        self.session.linear_backoff=True
        self.session.attempts=6
        with patch('requests.Session.request',return_value=response(429)),patch('linkedin_http.random.uniform',return_value=1):
            with self.assertRaises(RequestStopped):self.session.get('https://www.linkedin.com')
        self.assertEqual(self.sleeps,[16,31,46,61,76])

    def test_linear_retry_still_honors_server_retry_after(self):
        self.session.linear_backoff=True
        with patch('requests.Session.request',side_effect=[response(429,headers={'Retry-After':'100'}),response()]):
            self.session.get('https://www.linkedin.com')
        self.assertEqual(self.sleeps,[100])

    def test_long_wait_is_not_shortened_and_persists(self):
        with patch('requests.Session.request', return_value=response(429, headers={'Retry-After':'3600'})) as get:
            with self.assertRaises(RequestStopped): self.session.get('https://www.linkedin.com')
            self.assertEqual(get.call_count, 1)
        self.assertEqual(self.sleeps, [])
        self.assertGreaterEqual(json.loads(self.coordinator.path.read_text())['linkedin.com']['stopUntil'],3600)

    def test_http_date_and_invalid_retry_after(self):
        from datetime import datetime,timezone
        self.assertEqual(retry_after_seconds('Mon, 12 Oct 2026 10:00:03 GMT',datetime(2026,10,12,10,tzinfo=timezone.utc)),3)
        self.assertIsNone(retry_after_seconds('bad'))

    def test_403_is_not_retried(self):
        with patch('requests.Session.request', return_value=response(403)) as get:
            with self.assertRaises(RequestStopped): self.session.get('https://www.linkedin.com')
            self.assertEqual(get.call_count, 1)

    def test_200_login_opens_shared_circuit(self):
        with patch('requests.Session.request', return_value=response(text='<form class="login__form">')) as get:
            with self.assertRaises(RequestStopped): self.session.get('https://www.linkedin.com')
            with self.assertRaises(RequestStopped): self.session.get('https://www.linkedin.com')
            self.assertEqual(get.call_count, 1)

    def test_readable_jd_with_signin_modal_and_recaptcha_config_is_not_blocked(self):
        html='<div data-recaptcha-v3-integration-lix-value="enabled"><div class="show-more-less-html__markup">Analyse risk and prepare business reports.</div><form><input name="session_key"></form></div>'
        with patch('requests.Session.request', return_value=response(text=html)):
            self.assertEqual(self.session.get('https://www.linkedin.com/jobs/view/123456789').status_code,200)
        self.assertNotIn('stopUntil',json.loads(self.coordinator.path.read_text())['linkedin.com'])

    def test_actual_checkpoint_url_remains_blocked_even_with_job_markup(self):
        html='<div class="show-more-less-html__markup">Example content</div>'
        with patch('requests.Session.request', return_value=response(text=html,url='https://www.linkedin.com/checkpoint/challenge')):
            with self.assertRaises(RequestStopped):self.session.get('https://www.linkedin.com/jobs/view/123456789')

    def test_404_is_returned_without_retry(self):
        with patch('requests.Session.request', return_value=response(404)) as get:
            self.assertEqual(self.session.get('https://www.linkedin.com').status_code,404)
            self.assertEqual(get.call_count,1)

    def test_503_has_bounded_retries(self):
        with patch('requests.Session.request', return_value=response(503)) as get:
            with self.assertRaises(requests.HTTPError):self.session.get('https://www.linkedin.com')
            self.assertEqual(get.call_count,3)

    def test_network_error_has_bounded_retries(self):
        with patch('requests.Session.request', side_effect=requests.ConnectionError) as get:
            with self.assertRaises(requests.ConnectionError):self.session.get('https://www.linkedin.com')
            self.assertEqual(get.call_count,3)

    def test_separate_coordinators_share_lease_limit_and_release(self):
        peer=Coordinator(self.coordinator.path,clock=lambda:self.now,sleep=self.coordinator.sleep,min_interval=0,max_concurrent=2,deadline=1)
        first=self.coordinator.acquire('https://www.linkedin.com')
        second=peer.acquire('https://linkedin.com')
        with self.assertRaises(RequestStopped):peer.acquire('https://www.linkedin.com')
        peer.release(second)
        third=self.coordinator.acquire('https://www.linkedin.com')
        self.coordinator.release(first);self.coordinator.release(third)
        self.assertFalse(json.loads(self.coordinator.path.read_text())['linkedin.com']['leases'])

    def test_stale_leases_recover(self):
        self.coordinator.path.write_text(json.dumps({'linkedin.com':{'leases':{'dead':-1}}}))
        lease=self.coordinator.acquire('https://www.linkedin.com');self.coordinator.release(lease)

    def test_corrupted_state_fails_closed(self):
        self.coordinator.path.write_text('bad json')
        with patch('requests.Session.request') as get:
            with self.assertRaises(RequestStopped):self.session.get('https://www.linkedin.com')
            get.assert_not_called()


if __name__ == '__main__':unittest.main()
