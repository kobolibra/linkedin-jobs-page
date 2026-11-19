import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import run_company_searches as runner


class RunCompanySearchesTest(unittest.TestCase):
    def test_company_cooldown_never_keeps_the_runner_idle(self):
        calls=[]
        selected={'A':{'canonical':'a','company_id':'1'},'B':{'canonical':'b','company_id':'2'}}
        def run_one(args,key,company,company_id,*,resume=False):
            calls.append((company,resume));path=args.output_dir/f'{key}.json'
            path.write_text(json.dumps({'jobs':[{'sourceJobId':'li-123456789'}],
                'retryAt':2000 if company=='A' else 0,
                'statusSummary':{company+'::CN':'failed@start=10: HTTP 429 query deferred' if company=='A' else 'ok: 1 jobs'}}))
            return key,0,str(path)
        with tempfile.TemporaryDirectory() as tmp,patch.object(runner,'COMPANIES',selected),patch.object(runner,'run_one',side_effect=run_one),patch('run_company_searches.time.time',return_value=1000),patch('sys.argv',['run','--output-dir',tmp,'--max-workers','1']):
            self.assertEqual(runner.main(),0)
            self.assertEqual(calls,[('A',False),('B',False)])
            self.assertEqual(len(json.loads((Path(tmp)/'a.json').read_text())['jobs']),1)

    def test_real_429_yields_other_regions_of_same_company_without_requests(self):
        from fetch_linkedin_requests import main as search
        from linkedin_http import Coordinator,LinkedInSession
        from test_linkedin_http import response
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);now=[0.0]
            coordinator=Coordinator(root/'http',clock=lambda:now[0],sleep=lambda seconds:now.__setitem__(0,now[0]+seconds))
            session=LinkedInSession(coordinator=coordinator);self.addCleanup(session.close)
            argv=['search','--company','HSBC','--location','China','--location','Hong Kong','--location','Singapore','--output',str(root/'out')]
            with patch('fetch_linkedin_requests.LinkedInSession',return_value=session),patch('requests.Session.request',return_value=response(429)) as network,patch('sys.argv',argv):
                self.assertEqual(search(),0)
            got=json.loads((root/'out').read_text())
            self.assertEqual(network.call_count,1)
            self.assertEqual(set(got['statusSummary']),{'HSBC::CN','HSBC::HK','HSBC::SG'})
            self.assertEqual(got['retryAt'],60)
            self.assertEqual(now[0],0)

    def test_recovery_from_empty_first_page_is_a_fresh_complete_query(self):
        from fetch_linkedin_requests import main as search
        from test_linkedin_http import response
        from test_fetch_linkedin_requests import HTML
        session=SimpleNamespace(headers={})
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);output=root/'out'
            output.write_text(json.dumps({'jobs':[],'statusSummary':{'HSBC::CN':'failed@start=0: HTTP 429 company deferred'},'queryStartedAt':{'HSBC::CN':None}}))
            with patch('fetch_linkedin_requests.LinkedInSession',return_value=session),patch.object(session,'get',create=True,side_effect=[response(text=HTML),response(text='<!DOCTYPE html>\n\n<!---->  '),response(text='<!DOCTYPE html>\n\n<!---->  ')]),patch('sys.argv',['search','--company','HSBC','--output',str(output),'--resume']):
                self.assertEqual(search(),0)
            got=json.loads(output.read_text())
            self.assertEqual(got['statusSummary'],{'HSBC::CN':'ok: 1 jobs'})
            self.assertIsNotNone(got['queryStartedAt']['HSBC::CN'])

    def test_company_keys_and_count(self):
        keys = [spec["canonical"].replace(" ", "_") for spec in runner.COMPANIES.values()]
        self.assertEqual(len(keys), 19)
        # Adding a new institution must never displace any of the established 18.
        self.assertEqual(keys[-1], "state_street")
        self.assertEqual(
            keys,
            [
                "hsbc", "standard_chartered", "citi", "jpmorgan_chase",
                "bnp_paribas", "societe_generale", "dbs_bank", "deutsche_bank",
                "goldman_sachs", "blackrock", "bank_of_america", "fidelity_international", "morgan_stanley", "bbva", "natixis", "ubs", "schroders", "invesco",
            ],
        )

    @patch("run_company_searches.subprocess.run")
    def test_orchestrator_preserves_one_output_per_company(self, run):
        def fake_run(command, **kwargs):
            self.assertNotIn('timeout',kwargs)
            self.assertNotIn('capture_output',kwargs)
            self.assertNotIn('LINKEDIN_HTTP_DEADLINE',kwargs['env'])
            self.assertEqual(kwargs['env']['PYTHONUNBUFFERED'],'1')
            output = Path(command[command.index("--output") + 1])
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(json.dumps({"jobs": [], "statusSummary": {}}), encoding="utf-8")
            return type("Completed", (), {"returncode": 0, "stdout": "", "stderr": ""})()

        run.side_effect = fake_run
        with tempfile.TemporaryDirectory() as tmp:
            rc = runner.main.__wrapped__ if hasattr(runner.main, "__wrapped__") else None
            args = [
                "run_company_searches.py", "--output-dir", tmp,
                "--max-workers", "2",
                "--time-budget-seconds", "1",
            ]
            with patch("sys.argv", args):
                self.assertEqual(runner.main(), 0)
            files = sorted(Path(tmp).glob("*.json"))
            self.assertEqual(len(files), 19)
            self.assertEqual({p.stem for p in files}, {
                "state_street", "hsbc", "standard_chartered", "citi", "jpmorgan_chase", "bnp_paribas",
                "societe_generale", "dbs_bank", "deutsche_bank", "goldman_sachs",
                "blackrock", "bank_of_america", "fidelity_international", "morgan_stanley", "bbva", "natixis", "ubs", "schroders", "invesco", "state_street",
            })
            self.assertEqual(run.call_count, 19)

    def test_rate_limited_page_recovery_follows_other_companies_and_is_bounded(self):
        calls = []
        selected = {'A':{'canonical':'a','company_id':'1'}, 'B':{'canonical':'b','company_id':'2'}}
        def run_one(args, key, company, company_id, *, resume=False):
            calls.append((company, resume))
            path = args.output_dir / f'{key}.json'
            status = 'failed@start=10: HTTP 429 query deferred' if company == 'A' else 'ok: 1 jobs'
            path.write_text(json.dumps({'jobs':[{'sourceJobId':'li-123456789'}], 'statusSummary':{company+'::CN':status}}))
            return key, 0, str(path)
        with tempfile.TemporaryDirectory() as tmp, patch.object(runner,'COMPANIES',selected), patch.object(runner,'run_one',side_effect=run_one), patch('sys.argv',['run','--output-dir',tmp,'--max-workers','1']):
            self.assertEqual(runner.main(), 0)
            self.assertEqual(calls, [('A',False),('B',False),('A',True),('A',True)])
            self.assertEqual(len(json.loads((Path(tmp)/'a.json').read_text())['jobs']), 1)


if __name__ == "__main__":
    unittest.main()
