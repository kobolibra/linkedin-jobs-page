import unittest
from prepare_state_street_details import combine

class StateStreetDetailResumeTests(unittest.TestCase):
    def test_retains_only_verified_jd_by_numeric_linkedin_id(self):
        search={"statusSummary":{"State Street::CN":"partial@resumed-end: 2 jobs"},
                "jobs":[{"sourceJobId":"li-4490000001","company":"State Street","title":"Current title"},
                        {"sourceJobId":"li-4490000002","company":"State Street"}]}
        previous={"jobs":[{"sourceJobId":"li-old-job-at-state-street-4490000001",
                           "descriptionHtml":"<p>Verified JD</p>","detailStatus":"ok","title":"Old title"},
                          {"sourceJobId":"li-4490000002","detailStatus":"blocked",
                           "descriptionHtml":"<p>Unverified</p>"}]}
        result=combine(search,previous)
        self.assertEqual(len(result["jobs"]),2)
        self.assertEqual(result["jobs"][0]["title"],"Current title")
        self.assertEqual(result["jobs"][0]["descriptionHtml"],"<p>Verified JD</p>")
        self.assertNotIn("descriptionHtml",result["jobs"][1])
        self.assertEqual(result["statusSummary"],search["statusSummary"])

if __name__ == "__main__":
    unittest.main()
