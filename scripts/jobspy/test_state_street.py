import unittest
from fetch_linkedin_requests import COMPANIES, company_match
from validate_state_street_backfill import validate

class StateStreetTests(unittest.TestCase):
    def test_both_ids_and_names(self):
        self.assertEqual(COMPANIES["State Street"]["company_id"],"1767,1089754")
        for name in ("State Street","State Street Investment Management","State Street Global Advisors"):
            self.assertTrue(company_match(name,"State Street"))
        self.assertFalse(company_match("Citi","State Street"))
    def test_three_regions_and_every_jd_required(self):
        doc={"statusSummary":{"State Street::"+r:"ok: 1 jobs" for r in ("CN","HK","SG")},
             "jobs":[{"location":r,"detailStatus":"ok","descriptionHtml":"<p>JD</p>"} for r in ("CN","HK","SG")]}
        self.assertEqual(len(validate(doc,True)),3)
        doc["jobs"][0]["descriptionHtml"]=""
        with self.assertRaises(ValueError):validate(doc,True)
        doc["statusSummary"]["State Street::HK"]="partial@start=25"
        with self.assertRaises(ValueError):validate(doc)

    def test_historical_push_time_opt_in_is_state_street_only(self):
        from publish_backfill import enrich
        source={"sourceJobId":"li-4492028185","company":"State Street","requestedCompany":"State Street","datePosted":"2026-11-10","fetchedAt":"2026-11-19T05:00:00Z"}
        self.assertEqual(enrich({"jobs":[]},[source],state_street_post_date=True)["jobs"][0]["pushTime"],"2026-11-10")
        self.assertEqual(enrich({"jobs":[]},[source])["jobs"][0]["pushTime"],source["fetchedAt"])
        other=dict(source,sourceJobId="li-4492028186",company="Citi",requestedCompany="Citi")
        self.assertEqual(enrich({"jobs":[]},[other],state_street_post_date=True)["jobs"][0]["pushTime"],source["fetchedAt"])
        old=dict(source,pushTime="2026-11-08",firstSeen="2026-11-01",jobStatus="expired")
        kept=enrich({"jobs":[old]},[source],state_street_post_date=True)["jobs"][0]
        self.assertEqual((kept["pushTime"],kept["firstSeen"],kept["jobStatus"]),("2026-11-08","2026-11-01","expired"))
