import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fetch_details_parallel import main as details_main
from update_state_street_progress import progress


class StateStreetJdRecoveryTests(unittest.TestCase):
    def test_bounded_cooldown_retries_same_job_and_preserves_progress(self):
        items = [
            {"sourceJobId": "li-4490000001", "link": "https://www.linkedin.com/jobs/view/4490000001",
             "company": "State Street", "location": "CN"},
            {"sourceJobId": "li-4490000002", "link": "https://www.linkedin.com/jobs/view/4490000002",
             "company": "State Street", "location": "HK"}
        ]
        outcomes = iter([
            {"detailStatus": "blocked", "detailRetryable": True, "detailRetryAt": 0},
            {"detailStatus": "ok", "descriptionHtml": "<p>verified first</p>"},
            {"detailStatus": "ok", "descriptionHtml": "<p>verified second</p>"}
        ])
        def fake_one(row, *args, **kwargs):
            return {**row, **next(outcomes)}
        with tempfile.TemporaryDirectory() as temp:
            original, output = Path(temp) / "in.json", Path(temp) / "out.json"
            original.write_text(json.dumps({"jobs": items}))
            argv = ["fetch_details_parallel.py", "--input", str(original), "--output", str(output),
                    "--stop-on-rate-limit", "--continue-after-rate-limit",
                    "--rate-limit-pause-seconds", "1", "--max-rate-limit-pauses", "3"]
            with patch("fetch_details_parallel.one", side_effect=fake_one) as fetch, \
                 patch("fetch_details_parallel.time.sleep") as sleep, \
                 patch("sys.argv", argv):
                self.assertEqual(details_main(), 0)
            self.assertEqual(fetch.call_count, 3)
            sleep.assert_called_once_with(1.0)
            doc = json.loads(output.read_text())
            self.assertEqual(len(doc["jobs"]), 2)
            self.assertTrue(all(item["detailStatus"] == "ok" for item in doc["jobs"]))

    def test_repeated_rate_limit_stops_without_discarding_checkpoint(self):
        item = {"sourceJobId": "li-4490000001", "link": "https://www.linkedin.com/jobs/view/4490000001"}
        with tempfile.TemporaryDirectory() as temp:
            original, output = Path(temp) / "in.json", Path(temp) / "out.json"
            original.write_text(json.dumps({"jobs": [item]}))
            argv = ["fetch_details_parallel.py", "--input", str(original), "--output", str(output),
                    "--stop-on-rate-limit", "--continue-after-rate-limit",
                    "--rate-limit-pause-seconds", "0", "--max-rate-limit-pauses", "2"]
            with patch("fetch_details_parallel.one",
                       side_effect=lambda row, *a, **k: {**row, "detailStatus": "blocked", "detailRetryable": True}) as fetch, \
                 patch("fetch_details_parallel.time.sleep"), patch("sys.argv", argv):
                self.assertEqual(details_main(), 0)
            self.assertEqual(fetch.call_count, 2)
            self.assertEqual(json.loads(output.read_text())["jobs"][0]["detailStatus"], "blocked")

    def test_checkpoint_progress_is_never_misreported_as_published(self):
        search = {"statusSummary": {"State Street::CN": "partial@resumed-end: 2 jobs",
                                    "State Street::HK": "ok: 0 jobs",
                                    "State Street::SG": "ok: 0 jobs"},
                  "jobs": [{"location": "CN"}, {"location": "CN"}]}
        details = {"jobs": [{"location": "CN", "detailStatus": "ok",
                              "descriptionHtml": "<p>verified</p>"},
                             {"location": "CN", "detailStatus": "blocked",
                              "detailRetryAt": 1780000000}]}
        summary = progress(search, details)
        self.assertEqual(summary["jdOk"], 1)
        self.assertEqual(summary["jdMissing"], 1)
        self.assertEqual(summary["regions"]["CN"], 2)
        self.assertTrue(summary["searchComplete"])
        self.assertIn("NOT published", summary["status"])


if __name__ == "__main__":
    unittest.main()
