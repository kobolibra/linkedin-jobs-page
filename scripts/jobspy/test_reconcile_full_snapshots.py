import unittest
from reconcile_full_snapshots import reconcile


class ReconcileTests(unittest.TestCase):
    def test_expire_reactivate_and_preserve_detail(self):
        existing = {
            "jobs": [
                {"sourceJobId": "li-100000001", "company": "Acme", "companyCanonical": "acme", "title": "Old", "descriptionHtml": "<p>JD</p>", "jobStatus": "active"},
                {"sourceJobId": "li-100000002", "company": "Acme", "companyCanonical": "acme", "title": "Gone", "jobStatus": "active"},
                {"sourceJobId": "li-100000003", "company": "Blocked", "companyCanonical": "blocked", "title": "Keep", "jobStatus": "active"},
            ]
        }
        snapshot = {
            "jobs": [{"sourceJobId": "li-100000001", "company": "Acme", "companyCanonical": "acme", "title": "Old v2"}],
            "statusSummary": {"Acme": "ok: 1 jobs", "Blocked": "failed@start=0: HTTP 999"},
            "companies": {"Acme": "ok: 1 jobs", "Blocked": "failed@start=0: HTTP 999"},
        }
        result = reconcile(existing, snapshot, "2026-09-10T00:00:00+00:00")
        by_id = {x["sourceJobId"]: x for x in result["jobs"]}
        self.assertEqual(by_id["li-100000001"]["title"], "Old v2")
        self.assertEqual(by_id["li-100000001"]["descriptionHtml"], "<p>JD</p>")
        self.assertEqual(by_id["li-100000001"]["jobStatus"], "active")
        self.assertEqual(by_id["li-100000002"]["jobStatus"], "expired")
        self.assertEqual(by_id["li-100000002"]["expiredAt"], "2026-09-10T00:00:00+00:00")
        self.assertEqual(by_id["li-100000003"]["jobStatus"], "active")

        snapshot["jobs"].append({"sourceJobId": "li-100000002", "company": "Acme", "companyCanonical": "acme", "title": "Gone"})
        result = reconcile(result, snapshot, "2026-09-11T00:00:00+00:00")
        restored = {x["sourceJobId"]: x for x in result["jobs"]}["li-100000002"]
        self.assertEqual(restored["jobStatus"], "active")
        self.assertNotIn("expiredAt", restored)
        self.assertEqual(result["jobspySnapshot"]["reactivated"], 1)

    def test_failed_company_never_expires(self):
        existing = {"jobs": [{"sourceJobId": "li-100000010", "company": "Acme", "companyCanonical": "acme", "jobStatus": "active"}]}
        snapshot = {"jobs": [], "statusSummary": {"Acme": "failed@start=0: HTTP 999"}, "companies": {"Acme": "failed@start=0: HTTP 999"}}
        result = reconcile(existing, snapshot, "2026-09-10T00:00:00+00:00")
        self.assertEqual(result["jobs"][0]["jobStatus"], "active")
        self.assertEqual(result["jobspySnapshot"]["expired"], 0)

    def test_cn_snapshot_does_not_expire_hk_job(self):
        existing = {"jobs": [
            {"sourceJobId": "li-100000011", "company": "Acme", "companyCanonical": "acme", "location": "CN", "jobStatus": "active"},
            {"sourceJobId": "li-100000012", "company": "Acme", "companyCanonical": "acme", "location": "HK", "jobStatus": "active"},
        ]}
        snapshot = {"scopeLocations": ["CN"], "jobs": [], "statusSummary": {"Acme": "ok: 0 jobs"}, "companies": {"Acme": "ok: 0 jobs"}}
        result = reconcile(existing, snapshot, "2026-09-10T00:00:00+00:00")
        by_id = {x["sourceJobId"]: x for x in result["jobs"]}
        self.assertEqual(by_id["li-100000011"]["jobStatus"], "expired")
        self.assertEqual(by_id["li-100000012"]["jobStatus"], "active")
        self.assertEqual(result["jobspySnapshot"]["scopeLocations"], ["CN"])


if __name__ == "__main__":
    unittest.main()
