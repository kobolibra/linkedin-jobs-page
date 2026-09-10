import unittest
from reconcile_full_snapshots import reconcile


class ReconcileTests(unittest.TestCase):
    def test_expire_reactivate_and_preserve_detail(self):
        existing = {
            "jobs": [
                {"sourceJobId": "li-100000001", "company": "Acme", "companyCanonical": "acme", "title": "Old", "descriptionHtml": "<p>JD</p>", "jobStatus": "active"},
                {"sourceJobId": "li-100000002", "company": "Acme", "companyCanonical": "acme", "title": "Gone", "firstSeen": "2026-09-01T00:00:00+00:00", "jobStatus": "active", "missingSnapshotCount": 1},
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

    def test_new_job_is_not_expired_by_one_transient_miss(self):
        existing = {"jobs": [{"sourceJobId": "li-100000020", "company": "Acme", "companyCanonical": "acme", "firstSeen": "2026-09-10T00:00:00+00:00", "jobStatus": "active"}]}
        snapshot = {"jobs": [], "statusSummary": {"Acme": "ok: 0 jobs"}, "companies": {"Acme": "ok: 0 jobs"}}
        result = reconcile(existing, snapshot, "2026-09-10T02:30:00+00:00")
        row = result["jobs"][0]
        self.assertEqual(row["jobStatus"], "active")
        self.assertEqual(row["missingSnapshotCount"], 0)
        self.assertEqual(result["jobspySnapshot"]["graceRecovered"], 1)

    def test_old_job_requires_two_successful_misses(self):
        existing = {"jobs": [{"sourceJobId": "li-100000021", "company": "Acme", "companyCanonical": "acme", "firstSeen": "2026-09-01T00:00:00+00:00", "jobStatus": "active"}]}
        snapshot = {"jobs": [], "statusSummary": {"Acme": "ok: 0 jobs"}, "companies": {"Acme": "ok: 0 jobs"}}
        first = reconcile(existing, snapshot, "2026-09-10T02:30:00+00:00")
        self.assertEqual(first["jobs"][0]["jobStatus"], "active")
        self.assertEqual(first["jobs"][0]["missingSnapshotCount"], 1)
        second = reconcile(first, snapshot, "2026-09-10T08:30:00+00:00")
        self.assertEqual(second["jobs"][0]["jobStatus"], "expired")
        self.assertEqual(second["jobs"][0]["missingSnapshotCount"], 2)

    def test_detail_page_active_overrides_search_snapshot_miss(self):
        existing = {"jobs": [{"sourceJobId": "li-100000022", "company": "Acme", "companyCanonical": "acme", "firstSeen": "2026-09-01T00:00:00+00:00", "jobStatus": "active", "missingSnapshotCount": 1}]}
        snapshot = {"jobs": [], "statusSummary": {"Acme": "ok: 53 jobs"}, "companies": {"Acme": "ok: 53 jobs"}}
        verification = {"active": [{"sourceJobId": "100000022", "reason": "detail_page_open"}], "closed": []}
        result = reconcile(existing, snapshot, "2026-09-10T02:30:00+00:00", verification)
        self.assertEqual(result["jobs"][0]["jobStatus"], "active")
        self.assertEqual(result["jobs"][0]["lastVerifiedStatus"], "active_detail_page")


if __name__ == "__main__":
    unittest.main()
