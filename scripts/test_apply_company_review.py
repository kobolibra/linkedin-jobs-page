import copy
import json
import unittest
from scripts import apply_company_review as apply
import reclassify as rc

DAY = "2026-11-27"

class AtomicReviewTests(unittest.TestCase):
    def setUp(self):
        self.files = {rc.BLACKLIST: "[]", rc.INDUSTRIES: "{}",
                      rc.TARGET: "公司名\t备注\t首次出现\t最近出现\n",
                      rc.EXCLUDED: "公司名\t排除原因\t首次出现\t最近出现\n"}
        self.snapshot = {"sourceCommit": "a"*40, "summary": {}, "reviewQueue": [
            {"company": "Retail Co", "firstQueuedOn": DAY, "observedFirstOn": "2026-07-03",
             "observedLastOn": "2026-08-03", "historicalPendingDates": ["2026-08-03"],
             "sourceStatuses": ["historical_pending"], "activeJobsForKey": 0, "websiteJobsForKey": 0},
            {"company": "Bank Co", "firstQueuedOn": DAY, "sourceStatuses": ["staging_not_canonical"]},
            {"company": "Unknown Co", "firstQueuedOn": DAY, "sourceStatuses": ["unlisted"]}]}
        self.files[rc.daily_paths("2026-08-03")[0]] = json.dumps({"target_companies":
            [{"company":"Retail Co","reason":"待查证"}],"excluded_companies":[]})
        self.retail = {"company":"Retail Co","investigationStatus":"verified","protectionDecision":"delete",
                       "identityStatus":"confirmed","industry":"Retail","industryEvidence":[{"url":"https://example.com/about","note":"Retail"}],
                       "queries":["Retail Co official"]}
        self.bank = {"company":"Bank Co","investigationStatus":"verified","protectionDecision":"protect",
                     "identityStatus":"confirmed","industry":"Banking","industryEvidence":[{"url":"https://example.com/bank","note":"Banking"}],
                     "queries":["Bank Co official"],"employerType":"direct_employer",
                     "protectedRecord":{"company":"Bank Co","employerType":"direct_employer",
                      "evidence":{"url":"https://example.com/bank","reviewedOn":DAY,"note":"Banking"}}}
        self.unknown = {"company":"Unknown Co","investigationStatus":"inconclusive","protectionDecision":"undetermined",
                        "queries":["Unknown Co official"],"remainingQuestion":"Exact publisher unconfirmed"}

    def plan(self, results):
        return apply.plan_review(self.files.get, self.snapshot, results, DAY)

    def test_requester_exclusion_blocks_stale_queue_results(self):
        self.files[rc.TARGET] += "Retail Co\t用户指定排除（不再核验）\t2026-11-27\t2026-11-27\n"
        with self.assertRaisesRegex(ValueError, "not in this run"):
            self.plan([self.retail])
        self.files.update(self.plan([]))
        status = json.loads(self.files[apply.queue.STATUS_PATH])
        self.assertNotIn("Retail Co", {r["company"] for r in status["companies"]})

    def test_checkpoint_preserves_new_observation_before_research(self):
        self.files.update(self.plan([]))
        status = json.loads(self.files[apply.queue.STATUS_PATH])
        self.assertEqual(status["summary"]["reviewQueue"], 3)
        self.assertEqual(status["summary"]["queueByStatus"], {"not_started":3})
        self.assertFalse(self.plan([]))

    def test_historical_and_staging_decisions_atomic_and_idempotent(self):
        changes = self.plan([self.retail, self.bank, self.unknown])
        self.assertIn(rc.TARGET, changes)
        self.assertIn(rc.BLACKLIST, changes)
        self.assertIn(rc.INDUSTRIES, changes)
        self.assertIn(rc.EXCLUDED, changes)
        self.assertIn(apply.queue.STATUS_PATH, changes)
        self.assertIn("Retail Co\tRetail\t2026-07-03\t2026-08-03", changes[rc.TARGET])
        self.assertIn("Bank Co", changes[rc.EXCLUDED])
        self.assertIn("Retail", changes[rc.daily_paths("2026-08-03")[0]])
        self.files.update(changes)
        status = json.loads(self.files[apply.queue.STATUS_PATH])
        self.assertEqual([x["company"] for x in status["reviewQueue"]], ["Unknown Co"])
        self.assertFalse(self.plan([self.retail, self.bank, self.unknown]))

    def test_reject_unobserved_duplicate_and_unverified_delete(self):
        for bad in ([dict(self.retail, company="Other")],
                    [self.retail, dict(self.retail, company="Ｒｅｔａｉｌ Co")],
                    [dict(self.retail, industryEvidence=[])],
                    [dict(self.retail, identityStatus="unresolved")],
                    [dict(self.retail, investigationStatus="inconclusive",remainingQuestion="unclear")],
                    [dict(self.retail, industryEvidence=[{"url":"not a url","note":"x"}])]):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                self.plan(bad)

    def test_protected_veto_and_existing_type_correction(self):
        self.files[rc.BLACKLIST] = json.dumps([self.bank["protectedRecord"]])
        with self.assertRaisesRegex(ValueError, "Protected employer"):
            self.plan([dict(self.retail,company="Bank Co")])
        correction = copy.deepcopy(self.bank)
        correction["employerType"] = correction["protectedRecord"]["employerType"] = "recruitment_agency"
        with self.assertRaisesRegex(ValueError, "reviewed PR"):
            self.plan([correction])

    def test_concurrent_verified_status_never_downgraded(self):
        self.files.update(self.plan([self.retail]))
        with self.assertRaisesRegex(ValueError, "verified decision"):
            self.plan([dict(self.unknown,company="Retail Co")])
        self.assertIn("Retail Co", self.files[rc.TARGET])
        self.files.update(self.plan([self.bank]))
        self.assertIn("Retail Co", self.files[rc.TARGET])
        self.assertIn("Bank Co", self.files[rc.EXCLUDED])

if __name__ == "__main__":
    unittest.main()
