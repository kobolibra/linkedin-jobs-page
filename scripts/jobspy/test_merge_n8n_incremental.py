import unittest
from merge_n8n_incremental import merge_documents


class N8nMergeTests(unittest.TestCase):
    def test_existing_rss_repost_preserves_first_seen_and_advances_push_time(self):
        baseline = {"jobs": [{"sourceJobId": "li-100000001", "link": "https://www.linkedin.com/jobs/view/a-100000001", "firstSeen": "2026-01-01T00:00:00Z", "pushTime": "2026-02-01T00:00:00Z", "jobStatus": "expired", "expiredAt": "2026-09-01T00:00:00Z"}]}
        batch = {"generatedAt": "2026-09-10T08:00:00Z", "jobs": [{"sourceJobId": "li-100000001", "link": "https://www.linkedin.com/jobs/view/a-100000001", "firstSeen": "2026-09-10T08:00:00Z", "pushTime": "2026-09-10T08:00:00Z"}]}
        row = merge_documents(baseline, batch)["jobs"][0]
        self.assertEqual(row["firstSeen"], "2026-01-01T00:00:00Z")
        self.assertEqual(row["pushTime"], "2026-09-10T08:00:00Z")
        self.assertEqual(row["jobStatus"], "active")
        self.assertNotIn("expiredAt", row)

    def test_empty_values_do_not_erase_existing_fields(self):
        baseline = {"jobs": [{"sourceJobId": "li-100000002", "link": "https://www.linkedin.com/jobs/view/a-100000002", "firstSeen": "2026-01-01T00:00:00Z", "descriptionHtml": "<p>JD</p>"}]}
        batch = {"generatedAt": "2026-09-10T08:00:00Z", "jobs": [{"sourceJobId": "li-100000002", "descriptionHtml": ""}]}
        row = merge_documents(baseline, batch)["jobs"][0]
        self.assertEqual(row["descriptionHtml"], "<p>JD</p>")


if __name__ == "__main__":
    unittest.main()
