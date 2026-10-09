import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import requests
from probe_job_liveness import BudgetExhausted, ProbeBudget, SEARCH_URL, main

PAGE = '<link rel="canonical" href="https://www.linkedin.com/jobs/view/{key}"><h1 class="top-card-layout__title">A</h1><div class="show-more-less-html__markup">JD</div><a data-tracking-control-name="public_jobs_apply-link-onsite">Apply</a>'

class BudgetTests(unittest.TestCase):
    def run_probe(self, jobs, session, *args, clock=None):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)
            (p/'jobs').write_text(json.dumps({'jobs':jobs}))
            argv = ['probe','--jobs',str(p/'jobs'),'--output',str(p/'out'),*args]
            with patch('requests.Session',return_value=session), patch('time.sleep'), patch('sys.argv',argv):
                if clock:
                    with patch('time.monotonic',side_effect=clock): main()
                else: main()
            return json.loads((p/'out').read_text())

    def jobs(self, n, region='CN', title='A'):
        return [{'sourceJobId':'li-'+str(700000000+i),'company':'Small Co','location':region,'title':title} for i in range(n)]

    def test_failed_requests_count_and_timeouts_use_remaining_budget(self):
        clock = [0]
        session = Mock()
        session.get.side_effect = requests.Timeout()
        with patch('time.monotonic',side_effect=lambda:clock[0]):
            budget = ProbeBudget(session,1,10)
            clock[0] = 7
            with self.assertRaises(requests.Timeout): budget.get(SEARCH_URL,timeout=20)
            self.assertEqual(session.get.call_args.kwargs['timeout'],3)
            self.assertEqual(budget.requests,1)
            self.assertEqual(budget.date_searches,1)
            with self.assertRaises(BudgetExhausted): budget.get(SEARCH_URL)
        self.assertEqual(session.get.call_count,1)

    def test_exact_request_cap_includes_optional_search_and_keeps_open(self):
        session = Mock()
        def reply(url, **kwargs):
            return Mock(status_code=200,text=PAGE.format(key=url.rsplit('/',1)[-1]))
        session.get.side_effect = reply
        out = self.run_probe(self.jobs(3),session,'--max-http-requests','3')
        self.assertEqual(session.get.call_count,3)
        self.assertEqual(out['stats']['httpRequests'],3)
        self.assertEqual(out['stats']['dateSearchRequests'],1)
        self.assertEqual(out['stats']['probed'],2)
        self.assertEqual([x['result'] for x in out['observations']],['open','open'])
        self.assertFalse(out['stats']['circuitOpen'])
        self.assertEqual(out['stats']['budgetStopReason'],'http_request_budget')

    def test_time_budget_saves_verified_status_and_skips_date_and_later_jobs(self):
        clock = [0]
        session = Mock()
        def reply(url, **kwargs):
            clock[0] = 10
            return Mock(status_code=200,text=PAGE.format(key=url.rsplit('/',1)[-1]))
        session.get.side_effect = reply
        out = self.run_probe(self.jobs(2),session,'--max-seconds','10',clock=lambda:clock[0])
        self.assertEqual(session.get.call_count,1)
        self.assertEqual(out['stats']['probed'],1)
        self.assertEqual(out['observations'][0]['result'],'open')
        self.assertEqual(out['stats']['budgetStopReason'],'time_budget')
        self.assertFalse(out['stats']['circuitOpen'])

    def test_expired_jobs_need_one_request_and_do_not_have_fixed_150_cap(self):
        session = Mock(); session.get.return_value = Mock(status_code=404,text='')
        out = self.run_probe(self.jobs(180),session,'--max-http-requests','180')
        self.assertEqual(out['stats']['probed'],180)
        self.assertEqual(out['stats']['httpRequests'],180)
        self.assertEqual(out['stats']['dateSearchRequests'],0)
        self.assertTrue(all(x['result']=='gone' for x in out['observations']))

    def test_cn_still_uses_http_budget_first(self):
        session = Mock(); session.get.return_value = Mock(status_code=404,text='')
        out = self.run_probe(self.jobs(5,'HK')+self.jobs(5,'CN')+self.jobs(5,'SG'),session,'--max-http-requests','3')
        self.assertEqual([x['location'] for x in out['observations']],['CN']*3)

    def test_optional_job_cap_and_empty_queue_do_not_force_requests(self):
        session = Mock(); session.get.return_value = Mock(status_code=404,text='')
        out = self.run_probe(self.jobs(5),session,'--max-probes','1')
        self.assertEqual(out['stats']['probed'],1)
        self.assertEqual(out['stats']['httpRequests'],1)
        empty = self.run_probe([],session)
        self.assertEqual(empty['stats']['httpRequests'],0)

    def test_budget_exhaustion_cannot_publish_unchecked_negative_observations(self):
        clock = [0]
        session = Mock(); session.get.return_value = Mock(status_code=404,text='')
        def tick():
            clock[0] += 1
            return clock[0]
        out = self.run_probe(self.jobs(3),session,'--max-seconds','1',clock=tick)
        self.assertEqual(session.get.call_count,0)
        self.assertEqual(out['observations'],[])
        self.assertEqual(out['stats']['budgetStopReason'],'time_budget')

if __name__ == '__main__': unittest.main()
