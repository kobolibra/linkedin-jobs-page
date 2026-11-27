import json
import tempfile
import unittest
from pathlib import Path

from scripts import company_review_queue as queue


class CompanyReviewQueueTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "reports").mkdir()
        (self.root / "data/n8n").mkdir(parents=True)
        self.write("jobs.json", {"jobs": [
            {"company": "High Impact", "jobStatus": "active"},
            {"company": "Known Ordinary", "jobStatus": "active"},
        ]})
        self.write("jobs-index.json", {"jobs": [
            {"company": "High Impact", "jobStatus": "active", "location": "HK", "title": "Analyst",
             "link": "https://hk.linkedin.com/jobs/view/1"},
            {"company": "High Impact", "jobStatus": "active", "location": "HK", "title": "Engineer",
             "link": "https://hk.linkedin.com/jobs/view/2"},
        ]})
        self.write("financial_blacklist.json", [{"company": "Protected Unknown", "employerType": "unknown"}])
        self.write("company_industries.json", {})
        (self.root / "reports/cumulative-target-companies.tsv").write_text("公司名\t备注\t首次出现\t最近出现\n", encoding="utf-8")
        (self.root / "reports/cumulative-excluded-companies.tsv").write_text("公司名\t排除原因\t首次出现\t最近出现\n", encoding="utf-8")
        self.write("data/n8n/rss-latest.json", {"jobs": []})

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, name, data):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data), encoding="utf-8")

    def test_discovers_current_and_historical_gaps_in_impact_order(self):
        self.write("reports/today-companies-2026-11-20.json", {
            "date": "2026-11-20",
            "target_companies": [{"company": "Expired Pending", "reason": "待查证"}],
        })
        companies, report = queue.discover(self.root)
        names = [row["company"] for row in report["reviewQueue"]]
        self.assertEqual(names[0], "High Impact")
        self.assertIn("Protected Unknown", names)
        self.assertIn("Expired Pending", names)
        self.assertIn("Known Ordinary", names)
        self.assertEqual(report["reviewQueue"][0]["websiteJobsForKey"], 2)
        self.assertEqual(report["summary"]["queueByStatus"], {"not_started": 4})

    def test_requester_excluded_company_not_reopened(self):
        (self.root / "reports/cumulative-target-companies.tsv").write_text(
            "公司名\t备注\t首次出现\t最近出现\nHigh Impact\t用户指定排除（不再核验）\t2026-11-27\t2026-11-27\n",
            encoding="utf-8")
        self.write("data/n8n/rss-latest.json", {"jobs": [{"company": "HIGH IMPACT"}]})
        self.write(queue.STATUS_PATH, {"companies": [
            {"company": "High Impact", "investigationStatus": "inconclusive"}]})
        self.write("reports/today-companies-2026-11-20.json", {
            "target_companies": [{"company": "High Impact", "reason": "待查证"}]})
        companies, report = queue.discover(self.root)
        self.assertNotIn("High Impact", {r["company"] for r in companies})
        self.assertNotIn("High Impact", {r["company"] for r in report["reviewQueue"]})

    def test_fixed_jobspy_snapshot_is_not_a_review_source(self):
        self.write("data/jobspy/incremental/latest.json", {"jobs": [
            {"company": "JobSpy Fixed Company", "jobStatus": "active"}]})
        self.write("data/n8n/rss-latest.json", {"jobs": [
            {"company": "RSS New Company", "jobStatus": "active"}]})
        _, report = queue.discover(self.root)
        names = {row["company"] for row in report["reviewQueue"]}
        self.assertIn("RSS New Company", names)
        self.assertNotIn("JobSpy Fixed Company", names)

    def test_confirmed_protected_employer_is_not_reopened_by_rss_staging(self):
        self.write("financial_blacklist.json", [{
            "company": "Confirmed Bank", "employerType": "direct_employer",
            "evidence": {"url": "https://example.com", "reviewedOn": "2026-11-26",
                         "note": "Confirmed bank"}}])
        self.write("data/n8n/rss-latest.json", {"jobs": [
            {"company": "Ｃｏｎｆｉｒｍｅｄ Bank", "jobStatus": "active"}]})
        _, report = queue.discover(self.root)
        self.assertNotIn("Ｃｏｎｆｉｒｍｅｄ Bank",
                         {row["company"] for row in report["reviewQueue"]})

    def test_unresolved_progress_survives_job_expiry(self):
        self.write(queue.STATUS_PATH, {"companies": [{
            "company": "Old Investigation", "investigationStatus": "not_started",
            "protectionDecision": "undetermined", "firstQueuedOn": "2026-11-01",
        }, {
            "company": "Unfinalized Delete", "investigationStatus": "verified",
            "protectionDecision": "delete", "industryEvidence": [{"url": "https://example.com", "note": "Retail"}],
            "firstQueuedOn": "2026-11-01",
        }]})
        _, report = queue.discover(self.root)
        row = next(row for row in report["reviewQueue"] if row["company"] == "Old Investigation")
        self.assertEqual(row["sourceStatuses"], ["carry_forward"])
        self.assertEqual(row["firstQueuedOn"], "2026-11-01")
        self.assertIn("Unfinalized Delete", {row["company"] for row in report["reviewQueue"]})

    def test_apply_and_resolve_delete_requires_industry_and_evidence(self):
        companies, report = queue.discover(self.root)
        result = {
            "company": "Known Ordinary", "investigationStatus": "verified",
            "protectionDecision": "delete", "industry": "Retail",
            "industryEvidence": [{"url": "https://example.com/about", "note": "Retail business"}],
            "queries": ["Known Ordinary official retail"],
        }
        companies = queue.apply_results(companies, [result])
        records = {}
        targets = {queue.norm("Known Ordinary"): ["Known Ordinary", "Retail", "2026-11-26", "2026-11-26"]}
        self.assertFalse(queue.resolved(next(row for row in companies if row["company"] == "Known Ordinary"), records, {}, targets, {}))
        self.assertTrue(queue.resolved(next(row for row in companies if row["company"] == "Known Ordinary"), records,
                                       {queue.norm("Known Ordinary"): "Retail"}, targets, {}))
        self.assertFalse(queue.resolved(next(row for row in companies if row["company"] == "Known Ordinary"), records,
                                        {queue.norm("Known Ordinary"): "Retail"}, {}, {}))
        with self.assertRaises(ValueError):
            queue.apply_results(companies, [{**result, "industryEvidence": []}])

    def test_verified_protection_requires_typed_evidence_record(self):
        companies, _ = queue.discover(self.root)
        base = {
            "company": "Protected Unknown", "investigationStatus": "verified",
            "protectionDecision": "protect", "employerType": "recruitment_platform",
            "queries": ["Protected Unknown official platform"],
        }
        with self.assertRaises(ValueError):
            queue.apply_results(companies, [base])
        record = {"company": "Protected Unknown", "employerType": "recruitment_platform",
                  "evidence": {"url": "https://example.com", "reviewedOn": "2026-11-26", "note": "Job aggregation"}}
        updated = queue.apply_results(companies, [{**base, "protectedRecord": record}])
        row = next(row for row in updated if row["company"] == "Protected Unknown")
        excluded = {queue.norm("Protected Unknown"): ["Protected Unknown", "protected", "2026-11-26", "2026-11-26"]}
        self.assertTrue(queue.resolved(row, {queue.norm("Protected Unknown"): record}, {}, {}, excluded))
        self.assertFalse(queue.resolved(row, {queue.norm("Protected Unknown"): record}, {}, {}, {}))


if __name__ == "__main__":
    unittest.main()
