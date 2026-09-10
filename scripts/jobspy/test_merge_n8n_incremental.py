import unittest
from merge_n8n_incremental import merge_documents


class N8nMergeTests(unittest.TestCase):
    def test_existing_repost_preserves_history_detail_and_source(self):
        baseline = {"jobs": [{"sourceJobId": "li-100000001", "source": "jobspy", "link": "https://www.linkedin.com/jobs/view/a-100000001", "firstSeen": "2026-01-01T00:00:00Z", "pushTime": "2026-02-01T00:00:00Z", "city": "Shanghai", "descriptionHtml": "<p>JD</p>", "jobStatus": "expired", "expiredAt": "2026-09-01T00:00:00Z"}]}
        batch = {"generatedAt": "2026-09-10T08:00:00Z", "jobs": [{"sourceJobId": "li-100000001", "source": "n8n-rss", "link": "https://www.linkedin.com/jobs/view/a-100000001", "firstSeen": "2026-09-10T08:00:00Z", "pushTime": "2026-09-10T08:00:00Z"}]}
        row = merge_documents(baseline, batch)["jobs"][0]
        self.assertEqual(row["firstSeen"], "2026-01-01T00:00:00Z")
        self.assertEqual(row["pushTime"], "2026-09-10T08:00:00Z")
        self.assertEqual(row["source"], "jobspy")
        self.assertEqual(row["city"], "Shanghai")
        self.assertEqual(row["descriptionHtml"], "<p>JD</p>")
        self.assertEqual(row["jobStatus"], "active")
        self.assertNotIn("expiredAt", row)

    def test_empty_values_do_not_erase_existing_fields(self):
        baseline = {"jobs": [{"sourceJobId": "li-100000002", "descriptionHtml": "<p>JD</p>"}]}
        batch = {"generatedAt": "2026-09-10T08:00:00Z", "jobs": [{"sourceJobId": "li-100000002", "descriptionHtml": ""}]}
        self.assertEqual(merge_documents(baseline, batch)["jobs"][0]["descriptionHtml"], "<p>JD</p>")

    def test_wip_salary_snapshot_matches_existing_cn_jobs(self):
        baseline = {"jobs": [{"sourceJobId": "li-100000003", "company": "HSBC", "title": "Branch VRM Shanghai SHA Sub-branch", "location": "CN"}]}
        batch = {"generatedAt": "2026-09-10T08:00:00Z", "jobs": [], "salaryRows": [{"Company": "HSBC", "Title": "Branch VRM Shanghai SHA", "Location": "20-30k"}]}
        result = merge_documents(baseline, batch)
        self.assertEqual(result["jobs"][0]["salary"], "20-30k")
        self.assertEqual(result["n8nIncrementalMerge"]["salaryMatches"], 1)

    def test_salary_snapshot_matches_jpmorgan_chase_without_space(self):
        baseline = {"jobs": [{
            "sourceJobId": "li-100000004",
            "company": "JPMorganChase",
            "companyCanonical": "jpmorgan chase",
            "title": "Asset Management - Middle Office Head - Vice President",
            "location": "CN",
        }]}
        batch = {"generatedAt": "2026-09-10T10:00:00Z", "jobs": [], "salaryRows": [{
            "Company": "JPMorgan Chase",
            "Title": "Asset Management - Middle Office Head - Vice President",
            "Location": "21-30k",
        }]}
        result = merge_documents(baseline, batch)
        self.assertEqual(result["jobs"][0]["salary"], "21-30k")


if __name__ == "__main__":
    unittest.main()
