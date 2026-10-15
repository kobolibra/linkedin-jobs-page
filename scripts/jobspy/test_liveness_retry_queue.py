"""Exercise the real shared transport with a virtual clock; no external requests."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from linkedin_http import Coordinator, LinkedInSession
from probe_job_liveness import main
from test_linkedin_http import response
from test_posting_dates import PAGE, KEY, card, row

A, B = '500000000', '500000001'


class LivenessQueueTests(unittest.TestCase):
    def run_fixture(self, network, *, dates=False, max_probes=150):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp); now=[0.0]; calls=[]
            def sleep(seconds): now[0]+=seconds
            coordinator=Coordinator(p/'http',clock=lambda:now[0],sleep=sleep,min_interval=2.25,interval_jitter=.5)
            jobs=[row(sourceJobId='li-'+key,title='Analyst' if dates else '') for key in (A,B)]
            (p/'jobs').write_text(json.dumps({'jobs':jobs}))
            def send(method,url,**kwargs):
                call={'time':now[0],'url':url,'params':kwargs.get('params',{})}
                calls.append(call)
                return network(call,len(calls))
            argv=['probe','--jobs',str(p/'jobs'),'--output',str(p/'out'),'--max-probes',str(max_probes)]
            with patch('probe_job_liveness.Coordinator',return_value=coordinator),patch('requests.Session.request',side_effect=send),patch('linkedin_http.random.uniform',side_effect=lambda low,high:(low+high)/2),patch.object(sys,'argv',argv):
                main()
            return json.loads((p/'out').read_text()),calls,now[0]

    def test_view_429_moves_to_other_job_then_retries_without_duplicate_observations(self):
        def network(call,count):
            if count==1:return response(429,url=call['url'])
            return response(text=PAGE.replace(KEY,call['url'].rsplit('/',1)[-1]),url=call['url'])
        result,calls,_=self.run_fixture(network)
        self.assertEqual([x['url'].rsplit('/',1)[-1] for x in calls],[A,B,A])
        self.assertGreaterEqual(calls[1]['time'],30)
        self.assertLess(calls[1]['time'],60)
        self.assertGreaterEqual(calls[2]['time'],60)
        self.assertEqual(result['stats']['probed'],2)
        self.assertEqual(result['stats']['open'],2)
        self.assertEqual(result['stats']['unknown'],0)

    def test_server_retry_after_is_host_wide_even_when_switching_jobs(self):
        def network(call,count):
            if count==1:return response(429,headers={'Retry-After':'120'},url=call['url'])
            return response(text=PAGE.replace(KEY,call['url'].rsplit('/',1)[-1]),url=call['url'])
        result,calls,_=self.run_fixture(network)
        self.assertGreaterEqual(calls[1]['time'],120)
        self.assertEqual(result['stats']['open'],2)

    def test_date_retry_reuses_view_and_another_query_can_resolve_its_cache_early(self):
        date_calls=[]
        def network(call,count):
            if '/jobs/view/' in call['url']:
                return response(text=PAGE.replace(KEY,call['url'].rsplit('/',1)[-1]),url=call['url'])
            date_calls.append(call)
            if len(date_calls)==1:return response(429,url=call['url'])
            return response(text=card(A)+card(B),url=call['url'])
        result,calls,elapsed=self.run_fixture(network,dates=True)
        self.assertEqual(sum('/jobs/view/' in x['url'] for x in calls),2)
        self.assertEqual(len(date_calls),2)
        self.assertEqual(result['stats']['open'],2)
        self.assertEqual(result['stats']['postingDates'],2)
        self.assertEqual(result['stats']['postingDateSearchCacheHits'],1)
        self.assertLess(elapsed,60)  # Cached evidence never waits for a query retry.

    def test_exhausted_date_retry_preserves_open_result_and_is_bounded(self):
        date_calls=[]
        def network(call,count):
            if '/jobs/view/' in call['url']:
                return response(text=PAGE.replace(KEY,call['url'].rsplit('/',1)[-1]),url=call['url'])
            date_calls.append(call)
            if len(date_calls)==2:return response(text='<main>No exact ID</main>',url=call['url'])
            return response(429,url=call['url'])
        result,calls,_=self.run_fixture(network,dates=True)
        self.assertEqual(len(date_calls),4) # A three times, B once.
        self.assertEqual(sum('/jobs/view/' in x['url'] for x in calls),2)
        self.assertEqual(result['stats']['open'],2)
        self.assertEqual(result['stats']['rateLimitedExhausted'],1)
        self.assertEqual(result['stats']['unknown'],0)

    def test_normal_randomized_interval_has_bounded_cost_and_preserves_exclusion(self):
        with tempfile.TemporaryDirectory() as tmp:
            now=[0.0]; starts=[]
            coordinator=Coordinator(Path(tmp)/'http',clock=lambda:now[0],sleep=lambda s:now.__setitem__(0,now[0]+s),min_interval=2.25,interval_jitter=.5)
            session=LinkedInSession(coordinator=coordinator);self.addCleanup(session.close)
            def send(*args,**kwargs):starts.append(now[0]);return response()
            with patch('requests.Session.request',side_effect=send),patch('linkedin_http.random.uniform',return_value=.25):
                for _ in range(187):session.get('https://www.linkedin.com/jobs/view/123456789')
            self.assertEqual(starts[-1],465) # 7m45 vs 9m18 with fixed 3s.
            self.assertTrue(all(2.25<=b-a<=2.75 for a,b in zip(starts,starts[1:])))
            self.assertEqual(coordinator.max_concurrent,1)


if __name__ == '__main__':unittest.main()
