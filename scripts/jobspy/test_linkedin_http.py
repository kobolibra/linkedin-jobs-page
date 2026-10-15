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

    def test_request_fingerprint_tracks_failed_page_without_exposing_query(self):
        self.session.context={'stage':'search','company':'A','region':'CN','pageStart':10}
        events=[]
        with patch('requests.Session.request',side_effect=[response(429,headers={'Retry-After':'2'}),response(),response()]),patch('linkedin_http.record_event',side_effect=lambda **event:events.append(event)):
            with self.assertRaises(RequestStopped):self.session.get('https://www.linkedin.com/jobs/search',params={'start':10,'keywords':'A'})
            self.session.context['retryRound']=1
            self.session.get('https://www.linkedin.com/jobs/search',params={'keywords':'A','start':10})
            self.session.context['pageStart']=20
            self.session.get('https://www.linkedin.com/jobs/search',params={'keywords':'A','start':20})
        responses=[event for event in events if 'status' in event]
        self.assertEqual(responses[0]['requestKey'],responses[1]['requestKey'])
        self.assertNotEqual(responses[1]['requestKey'],responses[2]['requestKey'])
        self.assertEqual(len(responses[0]['requestKey']),24)
        self.assertNotIn('keywords',responses[0]['requestKey'])

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

    def test_rate_limit_shares_wait_without_permanent_slow_pacing(self):
        with patch('requests.Session.request', side_effect=[response(429, headers={'Retry-After':'7'}), response(), response()]) as get:
            self.session.get('https://www.linkedin.com')
            peer=Coordinator(self.coordinator.path,clock=lambda:self.now,sleep=self.coordinator.sleep,min_interval=0,max_concurrent=2,deadline=10000)
            other=LinkedInSession(coordinator=peer);self.addCleanup(other.close)
            other.get('https://linkedin.com/jobs/view/88888888')
            self.assertEqual(get.call_count,3)
        self.assertEqual(self.sleeps,[7])
        state=json.loads(self.coordinator.path.read_text())['linkedin.com']
        self.assertNotIn('minInterval',state)
        self.assertEqual(state['consecutive429'],0)

    def test_successful_responses_reset_actual_quota_failure_streak(self):
        self.coordinator.defer('https://www.linkedin.com',0)
        self.coordinator.defer('https://www.linkedin.com',0)
        self.coordinator.defer('https://www.linkedin.com',0)
        self.assertEqual(json.loads(self.coordinator.path.read_text())['linkedin.com']['consecutive429'],3)
        self.coordinator.succeeded('https://www.linkedin.com')
        self.assertEqual(json.loads(self.coordinator.path.read_text())['linkedin.com']['consecutive429'],0)

    def test_non_rate_limited_404_breaks_consecutive_quota_streak(self):
        self.coordinator.defer('https://www.linkedin.com',0)
        with patch('requests.Session.request',return_value=response(404)):
            self.assertEqual(self.session.get('https://www.linkedin.com').status_code,404)
        self.assertEqual(json.loads(self.coordinator.path.read_text())['linkedin.com']['consecutive429'],0)

    def test_legacy_pacing_is_ignored_and_not_republished_for_next_runner(self):
        from scraper_health import cooldowns
        old={'linkedin.com':{'paceUntil':900,'minInterval':30}}
        self.coordinator.path.write_text(json.dumps(old))
        self.now=100
        peer=Coordinator(self.coordinator.path,clock=lambda:self.now,sleep=self.coordinator.sleep)
        first=peer.acquire('https://www.linkedin.com');peer.release(first)
        second=peer.acquire('https://www.linkedin.com');peer.release(second)
        self.assertEqual(self.sleeps,[3])
        published=cooldowns(old,json.loads(self.coordinator.path.read_text()),now=self.now)
        self.assertEqual(published,{})
        self.coordinator.path.write_text(json.dumps(published))
        self.assertEqual(Coordinator(self.coordinator.path,clock=lambda:self.now).max_concurrent,1)

    def test_legacy_stage_deadline_does_not_truncate_default_collection(self):
        with patch.dict('os.environ',{'LINKEDIN_HTTP_DEADLINE':'123'}):
            peer=Coordinator(self.coordinator.path,clock=lambda:0)
            self.assertEqual(peer.deadline,float('inf'))

    def test_single_quota_failure_is_recoverable_for_next_liveness_probe(self):
        session=LinkedInSession(attempts=1,coordinator=self.coordinator)
        self.addCleanup(session.close)
        with patch('requests.Session.request',return_value=response(429)):
            with self.assertRaises(RequestStopped) as caught:session.get('https://www.linkedin.com')
        self.assertTrue(caught.exception.recoverable)
        self.assertEqual(caught.exception.response.status_code,429)

    def test_six_consecutive_real_429s_across_pages_open_persistent_circuit(self):
        self.session.attempts=6  # Even legacy callers cannot exceed three attempts per page.
        with patch('requests.Session.request',return_value=response(429,headers={'Retry-After':'2'})) as get:
            for _ in range(1):
                with self.assertRaises(RequestStopped) as caught:self.session.get('https://www.linkedin.com')
                self.assertTrue(caught.exception.recoverable)
            with self.assertRaises(RequestStopped) as caught:self.session.get('https://www.linkedin.com')
            self.assertFalse(caught.exception.recoverable)
            peer=LinkedInSession(coordinator=self.coordinator);self.addCleanup(peer.close)
            with self.assertRaises(RequestStopped):peer.get('https://www.linkedin.com')
            self.assertEqual(get.call_count,6)
        state=json.loads(self.coordinator.path.read_text())['linkedin.com']
        self.assertEqual(state['consecutive429'],6)
        self.assertGreaterEqual(state['stopUntil'],self.now+900)

    def test_missing_retry_after_increases_pause_before_third_attempt(self):
        self.session.linear_backoff=True
        self.session.attempts=6
        with patch('requests.Session.request',return_value=response(429)) as get,patch('linkedin_http.random.uniform',return_value=0):
            with self.assertRaises(RequestStopped) as caught:self.session.get('https://www.linkedin.com')
            self.assertEqual(get.call_count,3)
            self.assertTrue(caught.exception.recoverable)
        self.assertEqual(self.sleeps,[30,60])

    def scoped(self, company):
        session = LinkedInSession(coordinator=self.coordinator,
                                  context={'stage':'search','company':company,'region':'CN'})
        self.addCleanup(session.close)
        return session

    def test_deferred_page_yields_to_other_company_then_resumes_same_query(self):
        first, other = self.scoped('A'), self.scoped('B')
        with patch('requests.Session.request', side_effect=[response(429), response(), response()]) as get, patch('linkedin_http.random.uniform', return_value=0):
            with self.assertRaises(RequestStopped) as stopped: first.get('https://www.linkedin.com')
            self.assertTrue(stopped.exception.recoverable)
            self.assertEqual(stopped.exception.retry_at, 60)
            self.assertEqual(self.now, 0)  # No inline retry or blocking sleep.
            other.get('https://www.linkedin.com')
            self.assertEqual(self.now, 30)  # Host pause honored, not the A query pause.
            first.get('https://www.linkedin.com')
            self.assertEqual(self.now, 60)
            self.assertEqual(get.call_count, 3)
        self.assertEqual(json.loads(self.coordinator.path.read_text())['linkedin.com']['runtimeQueries'], {})

    def test_switching_company_never_bypasses_server_retry_after(self):
        first, other = self.scoped('A'), self.scoped('B')
        with patch('requests.Session.request', side_effect=[response(429, headers={'Retry-After':'120'}), response()]):
            with self.assertRaises(RequestStopped): first.get('https://www.linkedin.com')
            other.get('https://www.linkedin.com')
        self.assertEqual(self.sleeps, [120])

    def test_failures_across_companies_escalate_host_pause_and_open_circuit(self):
        sessions = [self.scoped(str(i)) for i in range(7)]
        with patch('requests.Session.request', return_value=response(429)) as get, patch('linkedin_http.random.uniform', return_value=0):
            for index, session in enumerate(sessions):
                with self.assertRaises(RequestStopped) as stopped: session.get('https://www.linkedin.com')
                self.assertEqual(stopped.exception.recoverable, index < 5)
            self.assertEqual(get.call_count, 6)
        self.assertEqual(self.sleeps, [30,60,120,120,120])

    def test_recovery_pacing_is_bounded_and_restored_after_five_healthy_responses(self):
        coordinator = Coordinator(self.coordinator.path, clock=lambda:self.now, sleep=self.coordinator.sleep)
        coordinator.recovery_pacing = True
        for _ in range(4): coordinator.defer('https://www.linkedin.com', 30)
        self.assertEqual(json.loads(coordinator.path.read_text())['linkedin.com']['runtimePacing']['interval'], 6)
        for _ in range(5): coordinator.succeeded('https://www.linkedin.com')
        self.assertEqual(json.loads(coordinator.path.read_text())['linkedin.com']['runtimePacing']['interval'], 4)
        for _ in range(5): coordinator.succeeded('https://www.linkedin.com')
        self.assertNotIn('runtimePacing', json.loads(coordinator.path.read_text())['linkedin.com'])
        # Successful traffic does not erase the observed host cooldown.
        lease = coordinator.acquire('https://www.linkedin.com'); coordinator.release(lease)
        self.assertEqual(self.now, 30)

    def test_default_global_slot_rejects_a_simultaneous_peer_request(self):
        first=Coordinator(self.coordinator.path,clock=lambda:self.now,sleep=self.coordinator.sleep)
        peer=Coordinator(self.coordinator.path,clock=lambda:self.now,sleep=self.coordinator.sleep,deadline=1)
        lease=first.acquire('https://www.linkedin.com')
        with self.assertRaises(RequestStopped):peer.acquire('https://linkedin.com')
        first.release(lease)
        self.assertEqual(first.min_interval,3)

    def test_cooldown_is_visible_before_request_lease_is_released(self):
        observed=[]
        release=self.coordinator.release
        def checking_release(lease):
            state=json.loads(self.coordinator.path.read_text())['linkedin.com']
            observed.append((state.get('cooldownUntil',0),bool(state['leases'])))
            release(lease)
        self.coordinator.release=checking_release
        with patch('requests.Session.request',side_effect=[response(429,headers={'Retry-After':'7'}),response()]):
            self.session.get('https://www.linkedin.com')
        self.assertEqual(observed[0],(7,True))

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
        self.assertEqual(json.loads(self.coordinator.path.read_text())['linkedin.com']['consecutive429'],1)

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

    def test_two_real_processes_share_one_network_slot(self):
        import os
        import subprocess
        import sys
        code = """import json,sys,time
from linkedin_http import Coordinator
c=Coordinator(sys.argv[1],min_interval=.03)
for _ in range(2):
    lease=c.acquire('https://www.linkedin.com')
    start=time.time()
    time.sleep(.05)
    end=time.time()
    c.release(lease)
    print(json.dumps([start,end]),flush=True)
"""
        env={**os.environ,'PYTHONPATH':str(Path(__file__).parent)}
        workers=[subprocess.Popen([sys.executable,'-c',code,str(self.coordinator.path)],
                                 stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env) for _ in range(2)]
        spans=[]
        for worker in workers:
            stdout,stderr=worker.communicate(timeout=10)
            self.assertEqual(worker.returncode,0,stderr)
            spans.extend(json.loads(line) for line in stdout.splitlines())
        self.assertEqual(len(spans),4)
        spans.sort()
        self.assertTrue(all(spans[i][0]>=spans[i-1][1] for i in range(1,len(spans))))

    def test_stale_leases_recover(self):
        self.coordinator.path.write_text(json.dumps({'linkedin.com':{'leases':{'dead':-1}}}))
        lease=self.coordinator.acquire('https://www.linkedin.com');self.coordinator.release(lease)

    def test_corrupted_state_fails_closed(self):
        self.coordinator.path.write_text('bad json')
        with patch('requests.Session.request') as get:
            with self.assertRaises(RequestStopped):self.session.get('https://www.linkedin.com')
            get.assert_not_called()


if __name__ == '__main__':unittest.main()
