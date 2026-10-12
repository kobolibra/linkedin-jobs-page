import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
from deploy_cloudflare import deploy, transient_error

def result(code, text):
    return SimpleNamespace(returncode=code, stdout=text)

class DeploymentTests(unittest.TestCase):
    def test_actual_504_log_is_retryable(self):
        log='\x1b[31m[ERROR]\x1b[0m Received a malformed response from the API\nGET /accounts/***/workers/services/linkedin -> 504 Gateway Timeout'
        self.assertTrue(transient_error(log))

    def test_504_recovers_then_publishes_success_summary(self):
        run=Mock(side_effect=[result(1,'GET /accounts/x -> 504 Gateway Timeout'),result(0,'Deployed linkedin triggers')]);sleep=Mock()
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'summary'
            self.assertEqual(deploy(run=run,sleep=sleep,report=Mock(),summary=path),0)
            self.assertIn('succeeded on attempt 2/3',path.read_text())
        self.assertEqual(run.call_count,2);sleep.assert_called_once_with(30)

    def test_persistent_gateway_error_fails(self):
        run=Mock(return_value=result(1,'HTTP 503 Service Unavailable'));sleep=Mock()
        self.assertEqual(deploy(run=run,sleep=sleep,report=Mock()),1)
        self.assertEqual(run.call_count,3);self.assertEqual([x.args[0] for x in sleep.call_args_list],[30,60])

    def test_authentication_error_fails_without_retry(self):
        for text in ('Authentication error [code: 10000]','HTTP 403 Forbidden','Invalid API Token','HTTP 401 Unauthorized'):
            run=Mock(return_value=result(1,text));sleep=Mock()
            self.assertEqual(deploy(run=run,sleep=sleep,report=Mock()),1)
            run.assert_called_once();sleep.assert_not_called()

    def test_config_error_fails_without_retry(self):
        run=Mock(return_value=result(1,'ParseError in wrangler.jsonc'));sleep=Mock()
        self.assertEqual(deploy(run=run,sleep=sleep,report=Mock()),1)
        run.assert_called_once();sleep.assert_not_called()

    def test_real_200_malformed_api_response_is_retryable(self):
        self.assertTrue(transient_error("Received a malformed response from the API\nPOST /accounts/x/workers/scripts/linkedin/versions -> 200 OK"))

    def test_malformed_response_alone_is_not_retried(self):
        self.assertFalse(transient_error('Received a malformed response from the API'))

    def test_network_timeout_is_bounded(self):
        run=Mock(side_effect=subprocess.TimeoutExpired('wrangler',240));sleep=Mock()
        self.assertEqual(deploy(run=run,sleep=sleep,report=Mock()),124);self.assertEqual(run.call_count,3)

    def test_network_reset_recovers(self):
        run=Mock(side_effect=[result(1,'fetch failed ECONNRESET'),result(0,'Success')])
        self.assertEqual(deploy(run=run,sleep=Mock(),report=Mock()),0)

    def test_immediate_success_has_no_retry(self):
        run=Mock(return_value=result(0,'Success'));sleep=Mock()
        self.assertEqual(deploy(run=run,sleep=sleep,report=Mock()),0)
        run.assert_called_once();sleep.assert_not_called()

if __name__ == '__main__':unittest.main()

class ProcessBudgetTests(unittest.TestCase):
    def test_timeout_kills_descendants_holding_the_output_pipe(self):
        import sys, time
        from deploy_cloudflare import run_command
        command = [sys.executable, '-c', 'import subprocess,time,sys; subprocess.Popen([sys.executable,"-c","import time; time.sleep(30)"]); time.sleep(30)']
        start = time.monotonic()
        with self.assertRaises(subprocess.TimeoutExpired):
            run_command(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=.2)
        self.assertLess(time.monotonic()-start, 3)
