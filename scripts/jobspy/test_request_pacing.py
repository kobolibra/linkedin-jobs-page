"""Verify callers avoid extra waits while the real transport still paces requests."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fetch_linkedin_requests import main as search_main
from fetch_details_parallel import one
from linkedin_http import Coordinator, LinkedInSession
from test_fetch_linkedin_requests import HTML
from test_linkedin_http import response


class RequestPacingTests(unittest.TestCase):
    def test_complete_search_uses_shared_pacer_without_second_page_wait(self):
        with tempfile.TemporaryDirectory() as tmp:
            now = [0.0]; waits = []; starts = []
            def wait(seconds):
                waits.append(seconds); now[0] += seconds
            coordinator = Coordinator(Path(tmp)/'http.json', clock=lambda:now[0], sleep=wait)
            session = LinkedInSession(coordinator=coordinator)
            self.addCleanup(session.close)
            replies = iter([HTML, '<!DOCTYPE html>\n\n<!---->  ', '<!DOCTYPE html>\n\n<!---->  '])
            def network(method, url, **kwargs):
                starts.append((now[0], kwargs['params']['start']))
                return response(text=next(replies))
            output = Path(tmp)/'jobs.json'
            with patch('fetch_linkedin_requests.LinkedInSession', return_value=session), patch('requests.Session.request', side_effect=network), patch('fetch_linkedin_requests.time.sleep', side_effect=AssertionError('duplicate page wait')), patch.object(sys, 'argv', ['search', '--company', 'HSBC', '--output', str(output), '--delay-min', '2', '--delay-max', '5']):
                self.assertEqual(search_main(), 0)
            self.assertEqual(starts, [(0.0, 0), (3.0, 10), (6.0, 20)])
            self.assertEqual(waits, [3.0, 3.0])
            self.assertEqual(json.loads(output.read_text())['statusSummary'], {'HSBC::CN':'ok: 1 jobs'})

    def test_jd_keeps_markup_and_shared_interval_without_extra_pre_request_wait(self):
        with tempfile.TemporaryDirectory() as tmp:
            now = [0.0]; starts = []
            def wait(seconds): now[0] += seconds
            coordinator = Coordinator(Path(tmp)/'http.json', clock=lambda:now[0], sleep=wait)
            def network(method, url, **kwargs):
                starts.append(now[0])
                html='<h2 class="top-card-layout__title">Analyst</h2><a class="topcard__org-name-link">HSBC</a><div class="show-more-less-html__markup"><p><strong>Risk</strong></p><ul><li>Review reports</li></ul></div>'
                return response(text=html, url=url)
            with patch('requests.Session.request', side_effect=network), patch('fetch_details_parallel.time.sleep', side_effect=AssertionError('duplicate JD wait')):
                results=[one({'link':'https://www.linkedin.com/jobs/view/'+key, 'sourceJobId':'li-'+key, 'company':'HSBC'}, 15, 3, 1, 3, coordinator) for key in ['123456789','987654321']]
            self.assertEqual(starts, [0.0, 3.0])
            for item in results:
                self.assertEqual(item['detailStatus'], 'ok')
                self.assertEqual(item['detailEndpoint'], 'guest')
                self.assertIn('<strong>Risk</strong>', item['descriptionHtml'])
                self.assertIn('<ul><li>Review reports</li></ul>', item['descriptionHtml'])


if __name__ == '__main__': unittest.main()
