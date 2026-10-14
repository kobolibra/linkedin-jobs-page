"""Rate-limit recovery uses real shared transport and a virtual clock."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from linkedin_http import Coordinator, LinkedInSession
from scraper_health import cooldowns, initialize_runtime
from test_linkedin_http import response
from test_fetch_linkedin_requests import HTML
from fetch_linkedin_requests import main as search_main


class RateRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)/'runtime.json'
        self.now = 0.0; self.waits = []
        def wait(seconds): self.waits.append(seconds); self.now += seconds
        self.coordinator = Coordinator(self.path, clock=lambda:self.now, sleep=wait)
        self.session = LinkedInSession(coordinator=self.coordinator)
        self.addCleanup(self.session.close)

    def slot(self): return json.loads(self.path.read_text())['linkedin.com']

    def test_third_attempt_can_complete_page_after_two_rate_limits(self):
        with patch('requests.Session.request', side_effect=[response(429), response(429), response()]) as network, patch('linkedin_http.random.uniform', return_value=0):
            self.assertEqual(self.session.get('https://www.linkedin.com/jobs/search').status_code, 200)
        self.assertEqual(network.call_count, 3)
        self.assertEqual(self.waits, [30, 60])
        self.assertEqual(self.slot()['runtimePacing']['interval'], 6)

    def test_one_success_does_not_restore_full_speed_for_peer(self):
        with patch('requests.Session.request', side_effect=[response(429), response()]), patch('linkedin_http.random.uniform', return_value=0):
            self.session.get('https://www.linkedin.com/jobs/search')
        peer = Coordinator(self.path, clock=lambda:self.now, sleep=self.coordinator.sleep)
        lease = peer.acquire('https://www.linkedin.com/jobs/view/123456789'); peer.release(lease)
        self.assertEqual(self.now, 34.5)
        self.assertEqual(self.slot()['runtimePacing']['interval'], 4.5)

    def test_interleaved_successes_do_not_erase_repeated_rate_limits(self):
        with patch('requests.Session.request', side_effect=[response(429), response(), response(), response(429), response()]), patch('linkedin_http.random.uniform', return_value=0):
            for _ in range(3): self.session.get('https://www.linkedin.com/jobs/search')
        self.assertEqual(self.slot()['runtimePacing']['interval'], 6)
        self.assertEqual(self.slot()['consecutive429'], 0)

    def test_pacing_is_capped_and_recovers_after_sustained_healthy_responses(self):
        for _ in range(3): self.coordinator.defer('https://www.linkedin.com', 0)
        self.assertEqual(self.slot()['runtimePacing']['interval'], 6)
        for _ in range(4): self.coordinator.succeeded('https://www.linkedin.com')
        self.assertEqual(self.slot()['runtimePacing']['interval'], 6)
        self.coordinator.succeeded('https://www.linkedin.com', healthy=False)
        for expected in [4, None]:
            for _ in range(5): self.coordinator.succeeded('https://www.linkedin.com')
            if expected is None: self.assertNotIn('runtimePacing', self.slot())
            else: self.assertEqual(self.slot()['runtimePacing']['interval'], expected)

    def test_server_retry_after_remains_authoritative_on_each_attempt(self):
        with patch('requests.Session.request', side_effect=[response(429, headers={'Retry-After':'7'}), response(429, headers={'Retry-After':'11'}), response()]):
            self.assertEqual(self.session.get('https://www.linkedin.com/jobs/search').status_code, 200)
        self.assertEqual(self.waits, [7, 11])

    def test_recovery_pacing_does_not_leak_into_future_runners(self):
        self.coordinator.defer('https://www.linkedin.com', 60)
        self.assertIn('runtimePacing', self.slot())
        persisted = Path(self.tmp.name)/'persisted.json'
        persisted.write_text(json.dumps(cooldowns(json.loads(self.path.read_text()), now=0)))
        fresh = Path(self.tmp.name)/'fresh.json'
        initialize_runtime(persisted, fresh, now=0)
        data = json.loads(fresh.read_text())['linkedin.com']
        self.assertEqual(data['cooldownUntil'], 60)
        self.assertNotIn('runtimePacing', data)
        self.assertNotIn('leases', data)

    def test_recovered_search_page_can_reach_verified_end_without_losing_jobs(self):
        output = Path(self.tmp.name)/'jobs.json'
        end = '<!DOCTYPE html>\n\n<!---->  '
        replies = [response(text=HTML), response(429, headers={'Retry-After':'7'}), response(429, headers={'Retry-After':'7'}), response(text=end), response(text=end)]
        with patch('fetch_linkedin_requests.LinkedInSession', return_value=self.session), patch('requests.Session.request', side_effect=replies) as network, patch.object(sys, 'argv', ['search', '--company', 'HSBC', '--output', str(output)]):
            self.assertEqual(search_main(), 0)
            self.assertIn('failed@start=10', json.loads(output.read_text())['statusSummary']['HSBC::CN'])
            with patch.object(sys, 'argv', ['search', '--company', 'HSBC', '--output', str(output), '--resume']):
                self.assertEqual(search_main(), 0)
                self.assertIn('failed@start=10', json.loads(output.read_text())['statusSummary']['HSBC::CN'])
                self.assertEqual(search_main(), 0)
        self.assertEqual(network.call_count, 5)
        self.assertEqual([call.kwargs['params']['start'] for call in network.call_args_list], [0,10,10,10,20])
        result = json.loads(output.read_text())
        self.assertEqual(result['count'], 1)
        self.assertEqual(result['statusSummary'], {'HSBC::CN':'partial@resumed-end: 1 jobs'})


if __name__ == '__main__': unittest.main()
