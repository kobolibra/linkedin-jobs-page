"""Archived one-off backfill progress checks; never alter daily JobSpy fetcher."""
import unittest
from update_state_street_progress import progress


class StateStreetCheckpointTests(unittest.TestCase):
    def test_progress_requires_cn_jd_only(self):
        search = {
            "statusSummary": {"State Street::CN": "partial@resumed-end: 2 jobs",
                              "State Street::HK": "ok: 1 jobs",
                              "State Street::SG": "ok: 1 jobs"},
            "jobs": [{"location": "CN"}, {"location": "CN"},
                     {"location": "HK"}, {"location": "SG"}],
        }
        details = {"jobs": [
            {"location": "CN", "detailStatus": "ok", "descriptionHtml": "<p>JD</p>"},
            {"location": "CN", "detailStatus": "blocked", "detailRetryAt": 1780000000},
            {"location": "HK", "detailStatus": "ok", "descriptionHtml": "<p>obsolete HK JD</p>"},
            {"location": "SG"},
        ]}
        result = progress(search, details)
        self.assertEqual(result["jdOk"], 1)
        self.assertEqual(result["jdTotal"], 2)
        self.assertEqual(result["jdMissing"], 1)
        self.assertEqual(result["jdNotApplicable"], 2)
        self.assertEqual(result["jdBlocked"], 1)
        self.assertEqual(result["regions"], {"CN": 2, "HK": 1, "SG": 1})
        self.assertTrue(result["searchComplete"])
        self.assertIn("NOT published", result["status"])

    def test_full_cn_jd_coverage_is_complete_without_hk_sg_descriptions(self):
        search = {"statusSummary": {"State Street::" + region: "ok: 1 jobs"
                                   for region in ("CN", "HK", "SG")},
                  "jobs": [{"location": region} for region in ("CN", "HK", "SG")]}
        details = {"jobs": [
            {"location": "CN", "detailStatus": "ok", "descriptionHtml": "<p>JD</p>"},
            {"location": "HK"}, {"location": "SG"}]}
        result = progress(search, details)
        self.assertEqual((result["jdOk"], result["jdTotal"], result["jdMissing"]), (1, 1, 0))
        self.assertEqual(result["jdNotApplicable"], 2)


if __name__ == "__main__":
    unittest.main()
