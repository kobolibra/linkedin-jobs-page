import unittest
from merge_n8n_incremental import merge_documents, normalize_company


class N8nMergeTests(unittest.TestCase):
    def test_new_company_legal_names_normalize_to_tracked_brand(self):
        self.assertEqual(normalize_company("Schroders"), "schroders")
        self.assertEqual(normalize_company("Schroder Investment Management"), "schroders")
        self.assertEqual(normalize_company("Schroders Investment Management"), "schroders")
        self.assertEqual(normalize_company("Invesco"), "invesco")
        self.assertEqual(normalize_company("Invesco Ltd."), "invesco")

    def test_rss_cannot_supply_or_overwrite_final_deletion_check_evidence(self):
        proof={'liveDeletionExpiryAt':'2026-09-01','liveDeletionCheckedAt':'2026-09-16'}
        forged={'sourceJobId':'li-100000001','company':'Acme',**proof}
        added=merge_documents({'jobs':[]},{'jobs':[forged]})['jobs'][0]
        self.assertNotIn('liveDeletionExpiryAt',added)
        self.assertNotIn('liveDeletionCheckedAt',added)
        baseline={'sourceJobId':'li-100000001','company':'Acme','jobStatus':'expired','expiredReason':'linkedin_closed','expiredAt':'2026-10-01'}
        updated=merge_documents({'jobs':[baseline]},{'jobs':[forged]})['jobs'][0]
        self.assertNotIn('liveDeletionCheckedAt',updated)
        baseline.update(proof)
        updated=merge_documents({'jobs':[baseline]},{'jobs':[{**forged,'liveDeletionCheckedAt':'2099-01-01'}]})['jobs'][0]
        self.assertEqual(updated['liveDeletionCheckedAt'],proof['liveDeletionCheckedAt'])

    def test_rss_presence_watermark_uses_observation_not_display_date(self):
        batch = {"generatedAt": "2026-09-21T10:00:00Z", "jobs": [{
            "sourceJobId": "li-100000031", "company": "Acme", "firstSeen": "2026-09-01", "pushTime": "2026-09-02",
        }]}
        result = merge_documents({"jobs": []}, batch)
        self.assertEqual(result["jobs"][0]["rssObservedAt"], batch["generatedAt"])
        older = {"generatedAt": "2026-09-21T12:00:00Z", "jobs": [{
            "sourceJobId": "li-100000031", "observedAt": "2026-09-21T06:00:00Z",
        }]}
        updated = merge_documents(result, older)["jobs"][0]
        self.assertEqual(updated["rssObservedAt"], "2026-09-21T10:00:00Z")
        self.assertEqual(updated["firstSeen"], "2026-09-01")
        self.assertEqual(updated["pushTime"], "2026-09-02")

    def test_existing_rss_observation_does_not_advance_push_time(self):
        baseline = {"jobs": [{"sourceJobId": "li-100000000", "firstSeen": "2026-01-01T00:00:00Z", "pushTime": "2026-02-01T00:00:00Z"}]}
        batch = {"generatedAt": "2026-09-10T08:00:00Z", "jobs": [{"sourceJobId": "li-100000000", "pushTime": "2026-09-10T08:00:00Z"}]}
        row = merge_documents(baseline, batch)["jobs"][0]
        self.assertEqual(row["pushTime"], "2026-02-01T00:00:00Z")

    def test_existing_repost_preserves_history_detail_and_source(self):
        baseline = {"jobs": [{"sourceJobId": "li-100000001", "source": "jobspy", "link": "https://www.linkedin.com/jobs/view/a-100000001", "firstSeen": "2026-01-01T00:00:00Z", "pushTime": "2026-02-01T00:00:00Z", "city": "Shanghai", "descriptionHtml": "<p>JD</p>", "jobStatus": "expired", "expiredAt": "2026-09-01T00:00:00Z"}]}
        batch = {"generatedAt": "2026-09-10T08:00:00Z", "jobs": [{"sourceJobId": "li-100000001", "source": "n8n-rss", "link": "https://www.linkedin.com/jobs/view/a-100000001", "firstSeen": "2026-09-10T08:00:00Z", "pushTime": "2026-09-10T08:00:00Z"}]}
        row = merge_documents(baseline, batch)["jobs"][0]
        self.assertEqual(row["firstSeen"], "2026-01-01T00:00:00Z")
        self.assertEqual(row["pushTime"], "2026-02-01T00:00:00Z")
        self.assertEqual(row["source"], "jobspy")
        self.assertEqual(row["city"], "Shanghai")
        self.assertEqual(row["descriptionHtml"], "<p>JD</p>")
        self.assertEqual(row["jobStatus"], "active")
        self.assertNotIn("expiredAt", row)

    def test_liveness_expired_row_stays_expired_when_rss_reobserves_it(self):
        baseline = {"jobs": [{
            "sourceJobId": "li-100000020", "company": "Small Co", "location": "CN",
            "jobStatus": "expired", "expiredAt": "2026-09-10T00:00:00Z",
            "expiredReason": "linkedin_closed",
        }]}
        batch = {"generatedAt": "2026-09-11T00:00:00Z", "jobs": [{
            "sourceJobId": "li-100000020", "company": "Small Co", "location": "CN",
        }]}
        result = merge_documents(baseline, batch)
        row = result["jobs"][0]
        self.assertEqual(row["jobStatus"], "expired")
        self.assertEqual(row["expiredReason"], "linkedin_closed")
        self.assertEqual(result["n8nIncrementalMerge"]["livenessKeptExpired"], 1)

    def test_empty_values_do_not_erase_existing_fields(self):
        baseline = {"jobs": [{"sourceJobId": "li-100000002", "descriptionHtml": "<p>JD</p>"}]}
        batch = {"generatedAt": "2026-09-10T08:00:00Z", "jobs": [{"sourceJobId": "li-100000002", "descriptionHtml": ""}]}
        self.assertEqual(merge_documents(baseline, batch)["jobs"][0]["descriptionHtml"], "<p>JD</p>")

    def test_blocklist_physically_removes_existing_jobs(self):
        baseline = {"jobs": [
            {"sourceJobId": "li-100000012", "company": "民生通惠资产管理有限公司", "jobStatus": "active"},
            {"sourceJobId": "li-100000013", "company": "HSBC", "jobStatus": "active"},
        ]}
        batch = {
            "generatedAt": "2026-09-10T08:00:00Z",
            "blocklist": ["民生通惠资产管理有限公司"],
            "jobs": [],
        }
        result = merge_documents(baseline, batch)
        self.assertEqual([row["sourceJobId"] for row in result["jobs"]], ["li-100000013"])
        self.assertEqual(result["n8nIncrementalMerge"]["blocklistHardDelete"], 1)

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

    def test_historical_company_aliases_match_salary_rows(self):
        baseline = {"jobs": [
            {"sourceJobId": "li-100000005", "company": "摩根大通亚洲咨询(北京)有限公司", "title": "固收基金经理", "location": "CN"},
            {"sourceJobId": "li-100000006", "company": "Black Rock", "title": "Analyst", "location": "CN"},
            {"sourceJobId": "li-100000007", "company": "BNP", "title": "Head of Legal", "location": "CN"},
        ]}
        batch = {"generatedAt": "2026-09-10T10:00:00Z", "jobs": [], "salaryRows": [
            {"Company": "JPMorgan Chase", "Title": "固收基金经理", "Location": "70-85k·20薪"},
            {"Company": "BlackRock", "Title": "Analyst", "Location": "1-2k"},
            {"Company": "BNP Paribas", "Title": "Head of Legal", "Location": "30-50k"},
        ]}
        result = merge_documents(baseline, batch)
        self.assertEqual([x.get("salary") for x in result["jobs"]], ["70-85k·20薪", "1-2k", "30-50k"])

    def test_unmatched_salary_keeps_existing_value(self):
        baseline = {"jobs": [{
            "sourceJobId": "li-100000008", "company": "HSBC", "title": "Old title", "location": "CN", "salary": "20-30k"
        }]}
        batch = {"generatedAt": "2026-09-10T10:00:00Z", "jobs": [], "salaryRows": [
            {"Company": "HSBC", "Title": "Different title", "Location": "40-50k"}
        ]}
        result = merge_documents(baseline, batch)
        self.assertEqual(result["jobs"][0]["salary"], "20-30k")
        self.assertEqual(result["n8nIncrementalMerge"]["salaryPreserved"], 1)

    def test_title_matching_prefers_full_bilingual_then_english_only(self):
        baseline = {"jobs": [
            {"sourceJobId": "li-100000009", "company": "Standard Chartered", "title": "优先理财经理 Relationship Manager, Priority", "location": "CN"},
            {"sourceJobId": "li-100000010", "company": "HSBC", "title": "FUND ACCOUNTANT(基金会计广州)", "location": "CN"},
        ]}
        batch = {"generatedAt": "2026-09-10T10:00:00Z", "jobs": [], "salaryRows": [
            {"Company": "Standard Chartered", "Title": "优先理财经理 Relationship Manager, Priority", "Location": "15-30k"},
            {"Company": "HSBC", "Title": "FUND ACCOUNTANT ID203488", "Location": "6-9k"},
        ]}
        result = merge_documents(baseline, batch)
        self.assertEqual([x.get("salary") for x in result["jobs"]], ["15-30k", "6-9k"])

    def test_title_matching_falls_back_to_english_only_after_full_miss(self):
        baseline = {"jobs": [{
            "sourceJobId": "li-100000011", "company": "Standard Chartered",
            "title": "优先理财经理 Relationship Manager, Priority", "location": "CN"
        }]}
        batch = {"generatedAt": "2026-09-10T10:00:00Z", "jobs": [], "salaryRows": [
            {"Company": "Standard Chartered", "Title": "Relationship Manager, Priority", "Location": "15-30k"}
        ]}
        result = merge_documents(baseline, batch)
        self.assertEqual(result["jobs"][0]["salary"], "15-30k")


    def test_salary_snapshot_matches_non_target_cn_employers(self):
        baseline = {"jobs": [
            {"sourceJobId": "li-4453438927", "company": "Apex Group Ltd", "title": "Senior Account Manager", "location": "CN"},
            {"sourceJobId": "li-100000019", "company": "Another Employer", "title": "Senior Account Manager", "location": "CN"},
        ]}
        batch = {"jobs": [], "salaryRows": [
            {"Company": "Apex Group Ltd", "Title": "Senior Account Manager", "Location": "20-40k"},
            {"Company": "Another Employer", "Title": "Senior Account Manager", "Location": "30-50k"},
        ]}
        result = merge_documents(baseline, batch)
        self.assertEqual([j.get("salary") for j in result["jobs"]], ["20-40k", "30-50k"])
        self.assertEqual(result["n8nIncrementalMerge"]["salaryMatches"], 2)

    def test_non_target_salary_matching_keeps_region_company_and_title_boundaries(self):
        baseline = {"jobs": [
            {"sourceJobId": "li-100000020", "company": "Apex Group Ltd", "title": "Senior Account Manager", "location": "HK", "salary": "HK existing"},
            {"sourceJobId": "li-100000021", "company": "Apex Group Ltd", "title": "Senior Account Manager", "location": "SG"},
            {"sourceJobId": "li-100000022", "company": "Other Company", "title": "Senior Account Manager", "location": "CN"},
            {"sourceJobId": "li-100000023", "company": "Apex Group Ltd", "title": "Account Manager", "location": "CN", "salary": "10-20k"},
            {"sourceJobId": "li-100000024", "company": "", "title": "Senior Account Manager", "location": "CN"},
        ]}
        batch = {"jobs": [], "salaryRows": [
            {"Company": "Apex Group Ltd", "Title": "Senior Account Manager", "Location": "20-40k"},
            {"Company": "", "Title": "Senior Account Manager", "Location": "99-100k"},
        ]}
        result = merge_documents(baseline, batch)
        self.assertEqual([j.get("salary") for j in result["jobs"]], ["HK existing", None, None, "10-20k", None])
        self.assertEqual(result["n8nIncrementalMerge"]["salaryMatches"], 0)
        self.assertEqual(result["n8nIncrementalMerge"]["salaryPreserved"], 1)

    def test_non_target_salary_retains_existing_title_normalization_and_preservation(self):
        baseline = {"jobs": [
            {"sourceJobId": "li-100000025", "company": " APEX GROUP LTD ", "title": "高级客户经理 Senior Account Manager", "location": "CN"},
            {"sourceJobId": "li-100000026", "company": "Apex Group Ltd", "title": "Unmatched title", "location": "CN", "salary": "15-25k"},
        ]}
        batch = {"jobs": [], "salaryRows": [
            {"Company": "Apex Group Ltd", "Title": "Senior Account Manager", "Location": "20-40k"},
        ]}
        result = merge_documents(baseline, batch)
        self.assertEqual([j.get("salary") for j in result["jobs"]], ["20-40k", "15-25k"])
        self.assertEqual(result["n8nIncrementalMerge"]["salaryMatches"], 1)
        self.assertEqual(result["n8nIncrementalMerge"]["salaryPreserved"], 1)


if __name__ == "__main__":
    unittest.main()
