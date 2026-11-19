import copy
import unittest
from repair_state_street_history import authoritative_rows, is_state, replace


class RepairStateStreetHistoryTests(unittest.TestCase):
    def source(self, key, region, date, **fields):
        return {
            "sourceJobId": "li-" + key, "link": "https://www.linkedin.com/jobs/view/" + key,
            "company": "State Street", "companyCanonical": "state street",
            "requestedCompany": "State Street", "location": region, "title": "Role",
            "datePosted": date, "fetchedAt": "2026-11-19T08:00:00Z",
            **fields,
        }

    def test_replaces_entire_old_company_with_source_dated_cn_only_records(self):
        source = [
            self.source("4490000001", "CN", "2026-10-20",
                        detailStatus="ok", descriptionHtml="<p>CN JD</p>"),
            self.source("4490000002", "HK", "2026-11-11",
                        detailStatus="ok", descriptionHtml="<p>Forbidden HK JD</p>",
                        detailFetchedAt="2026-11-19T08:00:00Z",
                        detailAttempts=[{"status": 200}]),
            self.source("4490000003", "SG", "2026-09-01",
                        detailStatus="ok", descriptionText="Forbidden SG JD",
                        jdDiffHtml="Secret stale diff"),
        ]
        expected = {"CN": 1, "HK": 1, "SG": 1}
        original = copy.deepcopy(source)
        rows = authoritative_rows({"jobs": source}, expected=expected)
        self.assertEqual(source, original, "Historical evidence must not be mutated")
        self.assertEqual([r["pushTime"] for r in rows],
                         ["2026-10-20", "2026-11-11", "2026-09-01"])
        self.assertTrue(all(r["firstSeen"] == r["datePosted"] for r in rows))
        self.assertEqual(rows[0]["descriptionHtml"], "<p>CN JD</p>")
        for row in rows[1:]:
            self.assertFalse(any(key.startswith(("detail", "jdDiff")) for key in row))
            self.assertNotIn("descriptionHtml", row)
            self.assertNotIn("descriptionText", row)
        unaffected = {"sourceJobId": "li-3300000001", "company": "HSBC", "firstSeen": "2026-04-01"}
        old_current = self.source("4490000001", "CN", "2026-11-19",
                                  descriptionHtml="<p>Old JD</p>")
        obsolete = self.source("4480000000", "HK", "2026-09-01")
        canonical = {"schemaVersion": "1.1",
                     "jobs": [unaffected, old_current, obsolete], "count": 3}
        updated, summary = replace(canonical, rows)
        self.assertEqual(len(updated["jobs"]), 4)
        self.assertEqual(updated["jobs"][0], unaffected)
        self.assertEqual(updated["jobs"][1:], rows)
        self.assertEqual(sum(is_state(r) for r in updated["jobs"]), 3)
        self.assertEqual(summary["removedObsoleteStateStreet"], 1)
        self.assertEqual(summary["replacedExistingStateStreet"], 1)
        self.assertEqual(summary["newStateStreet"], 2)
        self.assertEqual(canonical["count"], 3)
        self.assertEqual(canonical["jobs"][1]["descriptionHtml"], "<p>Old JD</p>")

    def test_rejects_missing_cn_jd_and_duplicate_or_invalid_posted_date(self):
        cn = self.source("4490000001", "CN", "2026-11-10")
        with self.assertRaisesRegex(ValueError, "Missing verified CN JD"):
            authoritative_rows({"jobs": [cn]}, expected={"CN": 1})
        cn["descriptionHtml"], cn["detailStatus"] = "<p>JD</p>", "ok"
        with self.assertRaisesRegex(ValueError, "duplicate"):
            authoritative_rows({"jobs": [cn, cn]}, expected={"CN": 2})
        cn["datePosted"] = "2026-11-31"
        with self.assertRaises(ValueError):
            authoritative_rows({"jobs": [cn]}, expected={"CN": 1})

    def test_does_not_overwrite_other_employer_with_same_linkedin_id(self):
        cn = self.source("4490000001", "CN", "2026-11-10",
                         detailStatus="ok", descriptionHtml="<p>JD</p>")
        rows = authoritative_rows({"jobs": [cn]}, expected={"CN": 1})
        with self.assertRaisesRegex(ValueError, "another employer"):
            replace({"jobs": [{"sourceJobId": "li-4490000001", "company": "Citi"}]}, rows)


if __name__ == "__main__":
    unittest.main()
