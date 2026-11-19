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
