"""Single-pass liveness regressions through the real transport, with a virtual clock."""
import contextlib
import io
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


class LivenessSinglePassTests(unittest.TestCase):
    def run_fixture(self, network, *, jobs=None, max_probes=150, max_seconds=900):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp); now=[0.0]; calls=[]; events=[]
            def sleep(seconds): now[0]+=seconds
            coordinator=Coordinator(p/'http',clock=lambda:now[0],sleep=sleep,min_interval=3,
                                    restore_recovery_pacing=False)
            jobs=jobs if jobs is not None else [row(sourceJobId='li-'+key) for key in (A,B)]
            (p/'jobs').write_text(json.dumps({'jobs':jobs}))
            def send(method,url,**kwargs):
                self.assertIn('/jobs/view/',url,'Posting-date network fallback must never run')
                call={'time':now[0],'url':url,'params':kwargs.get('params',{})}
                calls.append(call)
                return network(call,len(calls))
            argv=['probe','--jobs',str(p/'jobs'),'--output',str(p/'out'),'--max-probes',str(max_probes),'--max-seconds',str(max_seconds)]
            with patch('probe_job_liveness.Coordinator',return_value=coordinator),patch('requests.Session.request',side_effect=send),patch('linkedin_http.random.uniform',return_value=0),patch('linkedin_http.record_event',side_effect=lambda **event:events.append(event)),patch.object(sys,'argv',argv),contextlib.redirect_stdout(io.StringIO()) as output:
                main()
            return json.loads((p/'out').read_text()),calls,now[0],events,output.getvalue()

    def open_page(self,call,count):
        return response(text=PAGE.replace(KEY,call['url'].rsplit('/',1)[-1]),url=call['url'])

    def test_view_429_is_not_requeued_and_other_job_still_runs_after_host_pause(self):
        def network(call,count):
            return response(429,url=call['url']) if count==1 else self.open_page(call,count)
        result,calls,_,events,_=self.run_fixture(network)
        self.assertEqual([x['url'].rsplit('/',1)[-1] for x in calls],[A,B])
        self.assertEqual(calls[1]['time'],30) # Shared host pause; no 60s per-query tail.
        self.assertEqual(result['stats']['probed'],2)
        self.assertEqual(result['stats']['open'],1)
        self.assertEqual(result['stats']['unknown'],1)
        self.assertEqual(result['stats']['rateLimitedSkipped'],1)
        self.assertFalse(any(e.get('outcome')=='query_deferred' for e in events))
        self.assertFalse(result['stats']['circuitOpen'])

    def test_server_retry_after_is_host_wide_even_when_switching_jobs(self):
        def network(call,count):
            return response(429,headers={'Retry-After':'120'},url=call['url']) if count==1 else self.open_page(call,count)
        result,calls,_,_,_=self.run_fixture(network)
        self.assertEqual(calls[1]['time'],120)
        self.assertEqual(len(calls),2)
        self.assertEqual(result['stats']['open'],1)

    def test_150_ambiguous_open_pages_end_after_exactly_150_requests(self):
        jobs=[row(sourceJobId='li-'+str(500000000+i)) for i in range(160)]
        result,calls,elapsed,_,log=self.run_fixture(self.open_page,jobs=jobs)
        self.assertEqual(len(calls),150)
        self.assertEqual(len({x['url'] for x in calls}),150)
        self.assertEqual(result['stats']['postingDateSearchRequests'],0)
        self.assertEqual(result['stats']['postingDateSkippedNoEvidence'],150)
        self.assertEqual(result['stats']['open'],150)
        self.assertEqual(elapsed,447) # Healthy transport pacing, not a live-time promise.
        self.assertEqual(sum(line.startswith('liveness ') for line in log.splitlines()),150)
        self.assertEqual(sum('liveness 150/150' in line for line in log.splitlines()),1)
        self.assertNotIn('date attempt',log)

    def test_frequent_nonconsecutive_429s_cannot_create_a_retry_tail(self):
        jobs=[row(sourceJobId='li-'+str(500000000+i)) for i in range(150)]
        def network(call,count):
            return response(429,url=call['url']) if count%5==0 else self.open_page(call,count)
        result,calls,_,events,log=self.run_fixture(network,jobs=jobs)
        self.assertLess(len(calls),150)
        self.assertEqual(len({x['url'] for x in calls}),len(calls))
        self.assertEqual(result['stats']['rateLimitedSkipped'],len(calls)//5)
        self.assertEqual(result['stats']['unknown'],len(calls)//5)
        self.assertEqual(result['stats']['open'],len(calls)-len(calls)//5)
        self.assertTrue(result['stats']['budgetExhausted'])
        self.assertFalse(any(e.get('outcome')=='query_deferred' for e in events))
        self.assertNotIn('liveness 150/150',log)

    def test_later_page_cache_fills_earlier_job_without_extra_requests(self):
        def network(call,count):
            reply=self.open_page(call,count)
            if count==2: reply._content=(reply.text+card(A,'2026-10-01')).encode()
            return reply
        result,calls,_,_,_=self.run_fixture(network)
        self.assertEqual(len(calls),2)
        observed=next(x for x in result['observations'] if x['jobId']==A)
        self.assertEqual(observed['datePosted'],'2026-10-01')
        self.assertEqual(observed['dateSource'],'linkedin-cached-card')
        self.assertEqual(result['stats']['postingDateCacheHits'],1)

    def test_latest_run_first_pass_rate_limit_pattern_cannot_expand_the_job_count(self):
        # Positions observed before the retry/date tail in executor run #104.
        limited={4,6,14,20,29,32,33,37,45,49,55,57,60,66,72,77,97,108,112,113,120,128,130,133,136,139,144,146,149,150}
        jobs=[row(sourceJobId='li-'+str(500000000+i)) for i in range(150)]
        def network(call,count):
            return response(429,url=call['url']) if count in limited else self.open_page(call,count)
        result,calls,elapsed,_,log=self.run_fixture(network,jobs=jobs)
        self.assertLess(len(calls),150)
        self.assertEqual(len({x['url'] for x in calls}),len(calls))
        self.assertLessEqual(elapsed,900)
        self.assertTrue(result['stats']['budgetExhausted'])
        self.assertEqual(result['stats']['rateLimitedSkipped'],sum(n <= len(calls) for n in limited))
        self.assertEqual(result['stats']['unknown'],result['stats']['rateLimitedSkipped'])
        self.assertEqual(result['stats']['postingDateSearchRequests'],0)
        self.assertNotIn('liveness 150/150',log)

    def test_later_conflicting_cached_date_cannot_be_published_as_repost_evidence(self):
        jobs=[row(sourceJobId='li-'+str(500000000+i)) for i in range(3)]
        def network(call,count):
            reply=self.open_page(call,count)
            if count in (1,3): reply._content=(reply.text+card(B,'2026-10-0'+str(count))).encode()
            return reply
        result,calls,_,_,_=self.run_fixture(network,jobs=jobs)
        self.assertEqual(len(calls),3)
        observation=next(x for x in result['observations'] if x['jobId']==B)
        self.assertNotIn('datePosted',observation)

    def test_duplicate_and_invalid_input_does_not_repeat_or_spend_unique_job_places(self):
        jobs=[row(sourceJobId='li-'+A),row(sourceJobId='li-'+A),row(sourceJobId='not-a-job'),row(sourceJobId='li-'+B),None]
        result,calls,_,_,_=self.run_fixture(self.open_page,jobs=jobs,max_probes=2)
        self.assertEqual([x['url'].rsplit('/',1)[-1] for x in calls],[A,B])
        self.assertEqual(result['stats']['probed'],2)

    def test_three_consecutive_429s_keep_existing_breaker_and_preserve_unknowns(self):
        jobs=[row(sourceJobId='li-'+str(500000000+i)) for i in range(6)]
        result,calls,_,_,_=self.run_fixture(lambda call,count:response(429,url=call['url']),jobs=jobs)
        self.assertEqual(len(calls),3)
        self.assertTrue(result['stats']['circuitOpen'])
        self.assertEqual(result['stats']['skippedCircuitOpen'],3)
        self.assertEqual(result['stats']['unknown'],3)
        self.assertEqual(result['stats']['closed'],0)

    def test_liveness_recovery_does_not_accelerate_after_five_healthy_pages(self):
        jobs=[row(sourceJobId='li-'+str(500000000+i)) for i in range(35)]
        def network(call,count):
            return response(429,url=call['url']) if count in (1,12) else self.open_page(call,count)
        result,calls,_,_,_=self.run_fixture(network,jobs=jobs)
        self.assertEqual(result['stats']['probed'],35)
        before=[b['time']-a['time'] for a,b in zip(calls[2:10],calls[3:11])]
        after=[b['time']-a['time'] for a,b in zip(calls[14:-1],calls[15:])]
        self.assertTrue(all(delta==4.5 for delta in before))
        self.assertTrue(all(delta==6 for delta in after))

    def test_liveness_hold_expires_for_next_runner_without_persisting_slow_pacing(self):
        from scraper_health import cooldowns
        with tempfile.TemporaryDirectory() as tmp:
            now=[0.0]
            coordinator=Coordinator(Path(tmp)/'state',clock=lambda:now[0],sleep=lambda s:now.__setitem__(0,now[0]+s),restore_recovery_pacing=False)
            session=LinkedInSession(coordinator=coordinator);self.addCleanup(session.close)
            coordinator.defer('https://www.linkedin.com',30)
            for _ in range(60):
                now[0]+=10
                coordinator.succeeded('https://www.linkedin.com')
                lease=coordinator.acquire('https://www.linkedin.com');coordinator.release(lease)
            state=json.loads(coordinator.path.read_text())
            self.assertEqual(state['linkedin.com']['runtimePacing']['interval'],4.5)
            self.assertEqual(cooldowns(state,now=now[0]),{})


if __name__ == '__main__':unittest.main()
