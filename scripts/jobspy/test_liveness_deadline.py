"""A liveness-only deadline must yield usable partial results and normal success."""
import json
import signal
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch, Mock

from linkedin_http import Coordinator
from probe_job_liveness import main, wall_clock_limit, LivenessBudgetExpired
import test_liveness_retry_queue as queue_tests
from test_posting_dates import row, PAGE, KEY
from test_linkedin_http import response


class DeadlineTests(unittest.TestCase):
    def test_cooldown_crossing_deadline_yields_without_sending_the_next_request(self):
        fixture=queue_tests.LivenessSinglePassTests()
        def network(call,count):
            return response(429,headers={'Retry-After':'120'},url=call['url'])
        result,calls,elapsed,_,_=fixture.run_fixture(network,max_seconds=10)
        self.assertEqual(len(calls),1)
        self.assertLessEqual(elapsed,10)
        self.assertEqual(result['stats']['probed'],1)
        self.assertEqual(result['stats']['unknown'],1)
        self.assertTrue(result['stats']['budgetExhausted'])
        self.assertFalse(result['stats']['circuitOpen'])
        self.assertEqual(result['stats']['skippedBudget'],1)

    def test_inflight_request_is_interrupted_and_completed_results_still_return_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/'jobs').write_text(json.dumps({'jobs':[row(sourceJobId='li-500000000'),row(sourceJobId='li-500000001')]}))
            def reply(url,**kwargs):
                if url.endswith('500000001'): time.sleep(2)
                return Mock(status_code=200,text=PAGE.replace(KEY,url.rsplit('/',1)[-1]))
            session=Mock();session.get.side_effect=reply
            argv=['probe','--jobs',str(root/'jobs'),'--output',str(root/'out'),'--max-seconds','.05']
            handler=signal.getsignal(signal.SIGALRM);started=time.monotonic()
            with patch('probe_job_liveness.LinkedInSession',return_value=session),patch.object(sys,'argv',argv):
                self.assertIsNone(main()) # CLI exits 0 and the next workflow step can run.
            self.assertLess(time.monotonic()-started,1)
            got=json.loads((root/'out').read_text())
            self.assertEqual(got['stats']['probed'],1)
            self.assertTrue(got['stats']['budgetExhausted'])
            self.assertNotIn('error',got['stats'])
            self.assertEqual(got['observations'][0]['result'],'open')
            self.assertEqual(signal.getsignal(signal.SIGALRM),handler)
            self.assertEqual(signal.getitimer(signal.ITIMER_REAL),(0,0))
            session.close.assert_called_once()

    def test_deadline_during_state_flush_cannot_corrupt_shared_cooldown_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            state=Path(tmp)/'state'
            coordinator=Coordinator(state,deadline=time.time()+1)
            dump=json.dump
            def slow_dump(value,handle):
                time.sleep(.04)
                return dump(value,handle)
            with self.assertRaises(LivenessBudgetExpired),wall_clock_limit(.01),patch('linkedin_http.json.dump',side_effect=slow_dump):
                with coordinator.locked() as value: value['verified']='preserved'
            self.assertEqual(json.loads(state.read_text()),{'verified':'preserved'})


if __name__=='__main__':unittest.main()
