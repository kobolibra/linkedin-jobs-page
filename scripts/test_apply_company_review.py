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
        for i, row in enumerate(self.snapshot["reviewQueue"], 1):
            row["candidateJobIds"] = row["observedJobIds"] = [str(100000000 + i)]
            row["reviewedJobIds"] = []
            row["observationAt"] = "2026-11-27T03:00:00+00:00"
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
        self.assertEqual(status["reviewQueue"], [])
        self.assertEqual(status["summary"]["deferredCompanies"], 1)
        self.assertFalse(self.plan([self.retail, self.bank, self.unknown]))

    def test_compact_results_match_existing_schema(self):
        compact = [
            {"company": "Retail Co", "decision": "delete", "industry": "Retail",
             "evidence": self.retail["industryEvidence"], "queries": ["Retail Co official"]},
            {"company": "Bank Co", "decision": "protect", "industry": "Banking",
             "employerType": "direct_employer", "evidence": self.bank["industryEvidence"],
             "queries": ["Bank Co official"]},
            {"company": "Unknown Co", "decision": "inconclusive",
             "queries": ["Unknown Co official"], "remainingQuestion": "Exact publisher unconfirmed"},
        ]
        self.assertEqual(self.plan(compact)[rc.TARGET], self.plan([self.retail, self.bank, self.unknown])[rc.TARGET])
        self.assertEqual(self.plan(compact)[rc.BLACKLIST], self.plan([self.retail, self.bank, self.unknown])[rc.BLACKLIST])
        with self.assertRaises(ValueError):
            self.plan([dict(compact[0], employerType="direct_employer")])
        with self.assertRaises(ValueError):
            self.plan([dict(compact[1], evidence=[])])

    def test_old_industry_note_does_not_authorize_unrelated_deletion(self):
        self.files[rc.INDUSTRIES] = json.dumps({"Old Fintech": "Financial technology"})
        self.files[rc.daily_paths(DAY)[0]] = json.dumps({
            "target_companies": [{"company": "Old Fintech", "reason": "Financial technology"}],
            "excluded_companies": []})
        changes = self.plan([self.retail])
        self.assertNotIn("Old Fintech", changes[rc.TARGET])
        self.assertIn("Retail Co", changes[rc.TARGET])

    def test_prepare_combines_report_and_checkpoint_without_deletion(self):
        changes = apply.plan_prepare(self.files.get, self.snapshot, [], DAY)
        self.assertIn(rc.daily_paths(DAY)[0], changes)
        self.assertIn(apply.queue.STATUS_PATH, changes)
        self.assertNotIn(rc.TARGET, changes)
        self.assertNotIn(rc.BLACKLIST, changes)

    def test_prepare_maintains_only_confirmed_ledger_history(self):
        old = "2026-01-01"
        self.files[rc.BLACKLIST] = json.dumps([self.bank["protectedRecord"]])
        self.files[rc.TARGET] += f"Old Retail\tRetail\t{old}\t{old}\n"
        self.files[rc.EXCLUDED] += f"Bank Co\t{rc.REASON}\t{old}\t{old}\n"
        self.files[rc.INDUSTRIES] = json.dumps({"Old Retail": "Retail", "Old Fintech": "Financial technology"})
        self.files[rc.daily_paths(DAY)[0]] = json.dumps({
            "target_companies": [{"company": "Old Retail", "reason": "Retail"},
                                 {"company": "Old Fintech", "reason": "Financial technology"}],
            "excluded_companies": [{"company": "Bank Co", "reason": rc.REASON}]})
        changes = apply.plan_prepare(self.files.get, self.snapshot, [], DAY)
        self.assertIn(f"Old Retail\tRetail\t{old}\t{DAY}", changes[rc.TARGET])
        self.assertIn(f"Bank Co\t{rc.REASON}\t{old}\t{DAY}", changes[rc.EXCLUDED])
        self.assertNotIn("Old Fintech", changes[rc.TARGET])
        self.assertNotIn(rc.BLACKLIST, changes)

    def test_remaining_snapshot_only_keeps_original_unreviewed_listings(self):
        state = {}
        self.files.update(apply.plan_review(self.files.get, self.snapshot, [], DAY, worklist=state))
        state["reviewQueue"][0]["reviewedJobIds"] = state["reviewQueue"][0]["candidateJobIds"]
        state["reviewQueue"][1]["candidateJobIds"] = ["999999999"]
        names = {r["company"] for r in state["reviewQueue"][:2]}
        result = apply.remaining_snapshot(self.snapshot, state)
        self.assertEqual({row["company"] for row in result["reviewQueue"]},
                         {r["company"] for r in self.snapshot["reviewQueue"]} - names)
        self.assertEqual(result["summary"]["reviewQueue"], 1)

    def test_receipt_immediately_moves_inconclusive_to_waiting(self):
        state = {}
        self.files.update(apply.plan_review(self.files.get, self.snapshot, [self.unknown], DAY, worklist=state))
        result = apply.remaining_snapshot(self.snapshot, state)
        self.assertEqual(result["summary"]["reviewQueue"], 2)
        self.assertEqual(result["summary"]["deferredCompanies"], 1)
        self.assertEqual([row["company"] for row in result["deferredObservations"]], ["Unknown Co"])
        self.assertNotIn("Unknown Co", {row["company"] for row in result["reviewQueue"]})
        self.assertFalse(apply.plan_review(self.files.get, result, [], DAY))

    def test_verified_crypto_company_is_target_not_protected(self):
        crypto = dict(self.retail, industry="加密货币交易所",
                      industryEvidence=[{"url": "https://example.com/about",
                                         "note": "Confirmed cryptocurrency exchange"}])
        changes = self.plan([crypto])
        self.assertIn("Retail Co\t加密货币交易所\t", changes[rc.TARGET])
        self.assertNotIn(rc.norm("Retail Co"), rc.protected_names(
            json.loads(changes.get(rc.BLACKLIST, self.files[rc.BLACKLIST]))))
        self.assertEqual(json.loads(changes[rc.INDUSTRIES])["Retail Co"], "加密货币交易所")

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

    def test_deferred_state_checkpoint_and_concurrent_new_job_are_not_lost(self):
        self.files.update(self.plan([self.unknown]))
        status = json.loads(self.files[apply.queue.STATUS_PATH])
        old = next(r for r in status["companies"] if r["company"] == "Unknown Co")
        self.assertEqual(old["reviewedJobIds"], ["100000003"])
        self.assertNotIn("Unknown Co", {r["company"] for r in status["reviewQueue"]})
        # A later checkpoint sees a new job while an old run still has its
        # previous queue. That old run cannot mark the new ID investigated.
        newer = copy.deepcopy(self.snapshot)
        row = next(r for r in newer["reviewQueue"] if r["company"] == "Unknown Co")
        row.update(candidateJobIds=["100000004"], observedJobIds=["100000003", "100000004"],
                   reviewedJobIds=["100000003"], observationAt="2026-11-27T04:00:00+00:00")
        self.files.update(apply.plan_review(self.files.get, newer, [], DAY))
        self.files.update(self.plan([self.unknown]))
        status = json.loads(self.files[apply.queue.STATUS_PATH])
        row = next(r for r in status["reviewQueue"] if r["company"] == "Unknown Co")
        self.assertEqual(row["candidateJobIds"], ["100000004"])
        self.assertEqual(row["reviewedJobIds"], ["100000003"])
        self.files.update(apply.plan_review(self.files.get, newer, [self.unknown], DAY))
        status = json.loads(self.files[apply.queue.STATUS_PATH])
        self.assertNotIn("Unknown Co", {r["company"] for r in status["reviewQueue"]})
        row = next(r for r in status["companies"] if r["company"] == "Unknown Co")
        self.assertEqual(row["reviewedJobIds"], ["100000003", "100000004"])

    def test_deferred_observation_is_persisted_but_cannot_be_researched(self):
        snapshot = copy.deepcopy(self.snapshot)
        row = snapshot["reviewQueue"].pop()
        row.update(candidateJobIds=[], observedJobIds=[], reviewedJobIds=[])
        snapshot["deferredObservations"] = [row]
        self.files.update(apply.plan_review(self.files.get, snapshot, [], DAY))
        status = json.loads(self.files[apply.queue.STATUS_PATH])
        self.assertEqual(status["summary"]["deferredCompanies"], 1)
        self.assertIn("Unknown Co", {r["company"] for r in status["companies"]})
        with self.assertRaisesRegex(ValueError, "not in this run"):
            apply.plan_review(self.files.get, snapshot, [self.unknown], DAY)

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
