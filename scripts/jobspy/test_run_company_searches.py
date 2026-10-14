import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import run_company_searches as runner


class RunCompanySearchesTest(unittest.TestCase):
    def test_company_keys_and_count(self):
        keys = [spec["canonical"].replace(" ", "_") for spec in runner.COMPANIES.values()]
        self.assertEqual(len(keys), 16)
        self.assertEqual(
            keys,
            [
                "hsbc", "standard_chartered", "citi", "jpmorgan_chase",
                "bnp_paribas", "societe_generale", "dbs_bank", "deutsche_bank",
                "goldman_sachs", "blackrock", "bank_of_america", "fidelity_international", "morgan_stanley", "bbva", "natixis", "ubs",
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
            self.assertEqual(len(files), 16)
            self.assertEqual({p.stem for p in files}, {
                "hsbc", "standard_chartered", "citi", "jpmorgan_chase", "bnp_paribas",
                "societe_generale", "dbs_bank", "deutsche_bank", "goldman_sachs",
                "blackrock", "bank_of_america", "fidelity_international", "morgan_stanley", "bbva", "natixis", "ubs",
            })
            self.assertEqual(run.call_count, 16)

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
