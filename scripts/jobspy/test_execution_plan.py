import os
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from execution_plan import execution_plan, main, run_created_at
from urllib.error import URLError


class ExecutionPlanTests(unittest.TestCase):
    def test_all_four_batches_override_legacy_scope_and_choose_liveness(self):
        for utc,hour,scope,live in [('21','05','expanded','false'),('03','11','cn','true'),('09','17','expanded','false'),('15','23','cn','true')]:
            with self.subTest(hour=hour):
                plan=execution_plan(f'2026-10-14T{utc}:16:03Z',manual_scope='cn' if scope=='expanded' else 'expanded')
                self.assertEqual(plan['scope'],scope)
                self.assertEqual(plan['probe_liveness'],live)
                self.assertIn('T'+hour+':16:',plan['batch_bjt'])
        self.assertTrue(execution_plan('2026-10-14T21:16:03Z')['batch_bjt'].startswith('2026-10-15'))

    def test_delayed_dispatch_near_batch_keeps_expected_plan(self):
        self.assertEqual(execution_plan('2026-10-14T22:30:00Z')['scope'],'expanded')
        self.assertEqual(execution_plan('2026-10-14T03:45:00Z')['probe_liveness'],'true')

    def test_explicit_manual_run_keeps_scope_and_previous_probe_behavior(self):
        self.assertEqual(execution_plan(None,daily=False,manual_scope='cn'),{'scope':'cn','probe_liveness':'true','batch_bjt':'manual'})
        self.assertEqual(execution_plan(None,daily=False,manual_scope='expanded')['scope'],'expanded')

    def test_missing_or_naive_timestamp_does_not_guess_a_batch(self):
        for value in ('bad','2026-10-14T21:16:03'):
            with self.assertRaises(ValueError):execution_plan(value)

    def test_api_uses_creation_time_not_delayed_job_start_and_retries_transport_error(self):
        env={'GITHUB_REPOSITORY':'kobolibra/linkedin-jobs-executor','GITHUB_RUN_ID':'123','GITHUB_TOKEN':'test-only'}
        body=b'{"created_at":"2026-10-14T21:16:03Z","run_started_at":"2026-10-15T03:16:03Z"}'
        with patch.dict(os.environ,env),patch('execution_plan.urlopen',side_effect=[URLError('temporary'),io.BytesIO(body)]) as get,patch('execution_plan.time.sleep') as sleep:
            self.assertEqual(run_created_at(),'2026-10-14T21:16:03Z')
            self.assertEqual(get.call_count,2)
            self.assertEqual(get.call_args.args[0].full_url,'https://api.github.com/repos/kobolibra/linkedin-jobs-executor/actions/runs/123')
            sleep.assert_called_once_with(1)

    def test_manual_cli_does_not_require_github_api(self):
        with patch('execution_plan.run_created_at') as api,patch.object(sys,'argv',['plan','--daily-plan','false','--scope','expanded']),patch.dict(os.environ,{'GITHUB_OUTPUT':''}):
            self.assertEqual(main(),0)
            api.assert_not_called()

    def test_cli_uses_api_creation_timestamp_and_exports_exact_plan(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'out'
            with patch.dict(os.environ,{'GITHUB_OUTPUT':str(path)}),patch('execution_plan.run_created_at',return_value='2026-10-14T21:16:03Z') as created,patch.object(sys,'argv',['plan','--daily-plan','true','--scope','cn']):
                self.assertEqual(main(),0)
                created.assert_called_once()
            self.assertEqual(path.read_text(),'scope=expanded\nprobe_liveness=false\nbatch_bjt=2026-10-15T05:16:00+08:00\n')
