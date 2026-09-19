import json
import tempfile
import unittest
from pathlib import Path
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


if __name__ == "__main__":
    unittest.main()
