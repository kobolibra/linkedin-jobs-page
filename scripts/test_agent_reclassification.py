import importlib.util
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import reclassify


SCRIPT = Path(__file__).resolve().parents[1] / "auto-daily-companies.py"
spec = importlib.util.spec_from_file_location("auto_daily_companies", SCRIPT)
daily = importlib.util.module_from_spec(spec)
spec.loader.exec_module(daily)


class AgentReclassificationTests(unittest.TestCase):
    def test_verified_financial_companies_leave_target_history(self):
        stamp = "2026-11-23"
        fake_existing = {
            f"reports/today-companies-{stamp}.json": json.dumps({
                "target_companies": [{"company": "Parich Group Limited", "reason": "待查证"},
                                     {"company": "Fano (Fano Labs)", "reason": "AI"}],
                "excluded_companies": []}),
            "reports/cumulative-target-companies.tsv": (
                "公司名\t备注\t首次出现\t最近出现\n"
                "Breeze\t待查证\t2026-11-22\t2026-11-22\n"
                "Parich Group Limited\t待查证\t2026-11-23\t2026-11-23\n"),
            "reports/cumulative-excluded-companies.tsv": (
                "公司名\t排除原因\t首次出现\t最近出现\n"),
        }
        published = {}

        def record(path, body, message):
            published[path] = body
            return True

        rows = {"date": stamp,
                "target_companies": [{"company": "兴业数字金融服务(上海)股份有限公司", "reason": "待查证"}],
                "excluded_companies": [], "total_target": 1, "total_excluded": 0,
                "total_today_jobs": 1, "total_all_jobs": 1}
        blacklist = ["Parich Group Limited", "兴业数字金融服务(上海)股份有限公司", "Breeze"]
        with patch.object(daily, "FINANCIAL_BLACKLIST", set(blacklist)), \
             patch.object(daily, "download_file_from_github",
                          side_effect=lambda path: fake_existing.get(path)), \
             patch.object(daily, "push_file_to_github", side_effect=record):
            daily.push_daily_report_to_github(rows, stamp)

        published_json = json.loads(published[f"reports/today-companies-{stamp}.json"])
        self.assertEqual([x["company"] for x in published_json["target_companies"]],
                         ["Fano (Fano Labs)"])
        self.assertEqual({x["company"] for x in published_json["excluded_companies"]},
                         {"Parich Group Limited", "兴业数字金融服务(上海)股份有限公司"})
        # Daily output is provisional. Only the verification command owns the ledgers.
        self.assertEqual(set(published), {
            f"reports/today-companies-{stamp}.json",
            f"reports/today-target-companies-{stamp}.tsv",
            f"reports/today-excluded-companies-{stamp}.tsv",
        })
        files = {**fake_existing, **published}
        argv = ["reclassify.py", "--date", stamp, "--finalize", "--blacklist", *blacklist]
        with patch.object(sys, "argv", argv), \
             patch.object(reclassify, "load_cfg", return_value=("", "test/repo", "main", "")), \
             patch.object(reclassify, "Repo", autospec=True) as repo_cls, \
             patch.object(reclassify, "apply_local", return_value=0):
            repo = repo_cls.return_value
            repo.get.side_effect = lambda path: (files.get(path), None)

            def write_file(path, text, sha, message, dry):
                files[path] = text

            repo.put.side_effect = write_file
            reclassify.main()

        cumulative_targets = files["reports/cumulative-target-companies.tsv"]
        self.assertIn("Fano (Fano Labs)", cumulative_targets)
        self.assertNotIn("Parich Group Limited", cumulative_targets)
        self.assertNotIn("兴业数字金融服务(上海)股份有限公司", cumulative_targets)
        self.assertNotIn("Breeze", cumulative_targets)
        cumulative_excluded = files["reports/cumulative-excluded-companies.tsv"]
        self.assertIn("Parich Group Limited", cumulative_excluded)
        self.assertIn("兴业数字金融服务(上海)股份有限公司", cumulative_excluded)


if __name__ == "__main__":
    unittest.main()
