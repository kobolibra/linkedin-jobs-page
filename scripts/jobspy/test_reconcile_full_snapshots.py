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

    def test_new_job_gets_observation_push_time_and_posting_first_seen(self):
        existing = {"jobs": []}
        snapshot = {
            "scopeLocations": ["CN"],
            "jobs": [{
                "sourceJobId": "li-100000013",
                "company": "Acme",
                "companyCanonical": "acme",
                "datePosted": "2026-09-01",
                "jobspyFirstSeen": "2026-08-28",
            }],
            "statusSummary": {"acme": "ok: 1 jobs"},
            "companies": {"acme": "ok: 1 jobs"},
        }
        result = reconcile(existing, snapshot, "2026-09-10T02:00:00+00:00")
        row = result["jobs"][0]
        self.assertEqual(row["pushTime"], "2026-09-10T02:00:00+00:00")
        self.assertEqual(row["firstSeen"], "2026-08-28")

    def test_earlier_jobspy_date_posted_backfills_first_seen(self):
        existing = {"jobs": [{
            "sourceJobId": "li-100000014",
            "company": "Acme",
            "companyCanonical": "acme",
            "firstSeen": "2026-09-05T00:00:00+00:00",
            "pushTime": "2026-09-06T00:00:00+00:00",
        }]}
        snapshot = {
            "jobs": [{
                "sourceJobId": "li-100000014",
                "company": "Acme",
                "companyCanonical": "acme",
                "datePosted": "2026-09-01T00:00:00+00:00",
            }],
            "statusSummary": {"acme": "ok: 1 jobs"},
            "companies": {"acme": "ok: 1 jobs"},
        }
        result = reconcile(existing, snapshot, "2026-09-10T02:00:00+00:00")
        row = result["jobs"][0]
        self.assertEqual(row["firstSeen"], "2026-09-01T00:00:00+00:00")
        self.assertEqual(row["pushTime"], "2026-09-06T00:00:00+00:00")

    def test_jobspy_repost_within_24_hours_uses_date_posted(self):
        existing = {"jobs": [{
            "sourceJobId": "li-100000015", "company": "Acme", "companyCanonical": "acme",
            "firstSeen": "2026-08-01T00:00:00+00:00", "pushTime": "2026-09-01T00:00:00+00:00",
        }]}
        snapshot = {"jobs": [{
            "sourceJobId": "li-100000015", "company": "Acme", "companyCanonical": "acme",
            "datePosted": "2026-09-10", "jobspyRepost": True,
        }], "statusSummary": {"acme": "ok: 1 jobs"}, "companies": {"acme": "ok: 1 jobs"}}
        # datePosted without a clock is treated as 2026-09-10 00:00 Beijing;
        # 03:00 UTC is 11:00 Beijing and is inside the 24-hour rule.
        row = reconcile(existing, snapshot, "2026-09-10T03:00:00+00:00")["jobs"][0]
        self.assertEqual(row["pushTime"], "2026-09-10")

    def test_jobspy_repost_at_exactly_24_hours_is_accepted(self):
        existing = {"jobs": [{
            "sourceJobId": "li-100000017", "company": "Acme", "companyCanonical": "acme",
            "firstSeen": "2026-08-01T00:00:00+00:00", "pushTime": "2026-09-01T00:00:00+00:00",
        }]}
        snapshot = {"jobs": [{
            "sourceJobId": "li-100000017", "company": "Acme", "companyCanonical": "acme",
            "datePosted": "2026-09-10", "jobspyRepost": True,
        }], "statusSummary": {"acme": "ok: 1 jobs"}, "companies": {"acme": "ok: 1 jobs"}}
        # 2026-09-10 16:00 UTC = 2026-09-11 00:00 Beijing: exactly 24 hours.
        row = reconcile(existing, snapshot, "2026-09-10T16:00:00+00:00")["jobs"][0]
        self.assertEqual(row["pushTime"], "2026-09-10")

    def test_jobspy_repost_after_24_hours_is_rejected(self):
        existing = {"jobs": [{
            "sourceJobId": "li-100000018", "company": "Acme", "companyCanonical": "acme",
            "firstSeen": "2026-08-01T00:00:00+00:00", "pushTime": "2026-09-01T00:00:00+00:00",
        }]}
        snapshot = {"jobs": [{
            "sourceJobId": "li-100000018", "company": "Acme", "companyCanonical": "acme",
            "datePosted": "2026-09-10", "jobspyRepost": True,
        }], "statusSummary": {"acme": "ok: 1 jobs"}, "companies": {"acme": "ok: 1 jobs"}}
        row = reconcile(existing, snapshot, "2026-09-10T16:01:00+00:00")["jobs"][0]
        self.assertEqual(row["pushTime"], "2026-09-01T00:00:00+00:00")

    def test_future_jobspy_date_posted_is_rejected(self):
        existing = {"jobs": [{
            "sourceJobId": "li-100000019", "company": "Acme", "companyCanonical": "acme",
            "firstSeen": "2026-08-01T00:00:00+00:00", "pushTime": "2026-09-01T00:00:00+00:00",
        }]}
        snapshot = {"jobs": [{
            "sourceJobId": "li-100000019", "company": "Acme", "companyCanonical": "acme",
            "datePosted": "2026-09-11", "jobspyRepost": True,
        }], "statusSummary": {"acme": "ok: 1 jobs"}, "companies": {"acme": "ok: 1 jobs"}}
        row = reconcile(existing, snapshot, "2026-09-10T12:00:00+00:00")["jobs"][0]
        self.assertEqual(row["pushTime"], "2026-09-01T00:00:00+00:00")

    def test_normal_jobspy_reobservation_does_not_advance_push_time(self):
        existing = {"jobs": [{
            "sourceJobId": "li-100000016", "company": "Acme", "companyCanonical": "acme",
            "firstSeen": "2026-08-01T00:00:00+00:00", "pushTime": "2026-09-01T00:00:00+00:00",
        }]}
        snapshot = {"jobs": [{
            "sourceJobId": "li-100000016", "company": "Acme", "companyCanonical": "acme",
            "datePosted": "2026-08-25",
        }], "statusSummary": {"acme": "ok: 1 jobs"}, "companies": {"acme": "ok: 1 jobs"}}
        row = reconcile(existing, snapshot, "2026-09-10T22:00:00+00:00")["jobs"][0]
        self.assertEqual(row["pushTime"], "2026-09-01T00:00:00+00:00")


if __name__ == "__main__":
    unittest.main()
