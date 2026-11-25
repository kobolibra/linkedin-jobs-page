import copy
import unittest

from company_identity import ALIASES
from cross_id_reposts import reconcile
from merge_n8n_incremental import merge_documents
from publish_backfill import enrich
from reconcile_full_snapshots import reconcile as reconcile_snapshot


def listing(job_id, started, closed=None, **fields):
    row = {
        "sourceJobId": "li-" + job_id,
        "company": "Citi",
        "title": "Advisory Sales - Equity Brokerage",
        "location": "CN",
        "city": "Shanghai",
        "firstSeen": started,
        "datePosted": started,
        "pushTime": started,
        "jobStatus": "expired" if closed else "active",
    }
    if closed:
        row["expiredAt"] = closed
    row.update(fields)
    return row


class CrossIdRepostsTests(unittest.TestCase):
    def test_citi_history_uses_local_dates_and_starts_new_chain_after_gap(self):
        first_chain = [
            listing("4482515166", "2026-10-28", "2026-10-28T21:42:19Z"),
            listing("4483899555", "2026-10-28", "2026-11-05T03:36:39Z"),
            listing("4485550888", "2026-11-04", "2026-11-06T03:36:42Z"),
            listing("4486921470", "2026-11-05", "2026-11-18T21:44:37Z"),
            listing("4491859685", "2026-11-19", "2026-11-19T15:37:42Z"),
        ]
        restart = listing("4492601518", "2026-11-23", "2026-11-24T03:39:24Z")
        active = listing("4494081522", "2026-11-24")
        original = [*first_chain, restart, active]
        doc = {"jobs": list(reversed(original)), "count": len(original)}
        reconcile(doc, "2026-11-25")

        self.assertEqual(doc["jobs"], [active, first_chain[-1]])
        self.assertEqual(doc["count"], 2)
        self.assertEqual(first_chain[-1]["rolePostDate"], "2026-10-28")
        self.assertEqual(first_chain[-1]["expiredAt"], "2026-11-19T15:37:42Z")
        self.assertEqual(active["rolePostDate"], "2026-11-23")
        self.assertEqual(active["datePosted"], "2026-11-24")
        self.assertEqual(active["crossIdRepost"], {
            "rootId": "4492601518", "previousId": "4492601518",
            "postDate": "2026-11-23", "pending": False,
        })
        self.assertEqual(doc["supersededLinkedInIds"], [
            "4482515166", "4483899555", "4485550888", "4486921470", "4492601518",
        ])
        before = copy.deepcopy(doc)
        reconcile(doc, "2026-11-25")
        self.assertEqual(doc, before)

    def test_pending_active_rows_revert_if_the_older_listing_closes_too_late(self):
        earlier = listing("4000000000", "2026-11-01", pushTime="2026-11-07")
        later = listing("4000000001", "2026-11-11")
        doc = {"jobs": [earlier, later], "count": 2}
        reconcile(doc, "2026-11-11")
        self.assertEqual([row["rolePostDate"] for row in doc["jobs"]], ["2026-11-01"] * 2)
        self.assertTrue(later["crossIdRepost"]["pending"])
        self.assertEqual([row["jobStatus"] for row in doc["jobs"]], ["active"] * 2)
        reconcile(doc, "2026-11-12")
        self.assertTrue(later["crossIdRepost"]["pending"])

        earlier.update(jobStatus="expired", expiredAt="2026-11-12T16:01:00Z")
        reconcile(doc, "2026-11-13")
        self.assertEqual(doc["jobs"], [earlier, later])
        self.assertNotIn("crossIdRepost", later)
        self.assertNotIn("rolePostDate", earlier)
        self.assertEqual(earlier["pushTime"], "2026-11-07")

    def test_citi_next_day_repost_cleans_closed_rows_and_inherits_the_earliest_date(self):
        title = "Sales Trader – Equity Brokerage"
        earlier = listing("4486920504", "2026-11-05", "2026-11-18T15:36:10Z", title=title,
                          rolePostDate="2026-10-28", crossIdRepost={
                              "rootId": "4482516146", "previousId": "4485554793",
                              "postDate": "2026-10-28", "pending": False,
                          })
        later = listing("4491853888", "2026-11-19", "2026-11-19T15:37:42Z", title=title,
                        pushTime="2026-11-18T21:44:37Z", postingLastDate="2026-11-19")
        doc = {"jobs": [later, earlier], "supersededLinkedInIds": ["4482516146", "4485554793"]}
        reconcile(doc, "2026-11-25")

        self.assertEqual(doc["jobs"], [later])
        self.assertEqual(doc["supersededLinkedInIds"], ["4482516146", "4485554793", "4486920504"])
        self.assertEqual(later["rolePostDate"], "2026-10-28")
        self.assertEqual(later["crossIdRepost"]["previousId"], "4486920504")
        self.assertEqual(later["jobStatus"], "expired")
        self.assertEqual(later["expiredAt"], "2026-11-19T15:37:42Z")
        self.assertEqual(later["pushTime"], "2026-11-18T21:44:37Z")
        before = copy.deepcopy(doc)
        reconcile(doc, "2026-11-25")
        self.assertEqual(doc, before)

    def test_each_allowed_offset_can_join_two_previously_reconciled_cycles(self):
        for closed in ("2026-11-05", "2026-11-06", "2026-11-07"):
            with self.subTest(closed=closed):
                older = listing("4000000001", "2026-11-03", closed, crossIdRepost={
                    "rootId": "4000000000", "previousId": "4000000000",
                    "postDate": "2026-11-01", "pending": False,
                })
                newer = listing("4000000003", "2026-11-11", "2026-11-12", crossIdRepost={
                    "rootId": "4000000002", "previousId": "4000000002",
                    "postDate": "2026-11-06", "pending": False,
                })
                doc = {"jobs": [older, newer], "supersededLinkedInIds": ["4000000000", "4000000002"]}
                reconcile(doc, "2026-11-25")

                self.assertEqual(doc["jobs"], [newer])
                self.assertEqual(newer["crossIdRepost"], {
                    "rootId": "4000000000", "previousId": "4000000002",
                    "postDate": "2026-11-01", "pending": False,
                })
                self.assertEqual(doc["supersededLinkedInIds"], ["4000000000", "4000000001", "4000000002"])

    def test_jpmorgan_spelling_variants_share_one_closed_recruitment_cycle(self):
        title = "China Securities Company - Global Employee Lifecycle & Access Management(GLAM) Relationship Specialist"
        older = listing("4484452096", "2026-10-28", "2026-11-24T21:46:30Z",
                        company="JPMorganChase", companyCanonical="jpmorgan chase", title=title,
                        pushTime="2026-11-19")
        newer = listing("4494434290", "2026-11-25", "2026-11-25T06:47:01Z",
                        company="JPMorgan Chase", title=title, pushTime="2026-11-25T03:43:57Z")
        doc = {"jobs": [newer, older], "count": 2}
        reconcile(doc, "2026-11-25")

        self.assertEqual(doc["jobs"], [newer])
        self.assertEqual(doc["supersededLinkedInIds"], ["4484452096"])
        self.assertEqual(newer["rolePostDate"], "2026-10-28")
        self.assertEqual(newer["pushTime"], "2026-11-25T03:43:57Z")
        self.assertEqual(newer["expiredAt"], "2026-11-25T06:47:01Z")

    def test_shared_company_aliases_work_even_without_jobspy_metadata(self):
        for alias, company in ALIASES.items():
            with self.subTest(alias=alias):
                older = listing("4000000000", "2026-11-01", "2026-11-11", company=alias)
                newer = listing("4000000001", "2026-11-11", company=company)
                doc = {"jobs": [older, newer]}
                reconcile(doc, "2026-11-12")
                self.assertEqual(doc["jobs"], [newer])
                self.assertEqual(newer["rolePostDate"], "2026-11-01")

    def test_stale_retry_cannot_restore_an_expired_overlap_window(self):
        earlier = listing("4000000000", "2026-11-01")
        later = listing("4000000001", "2026-11-11")
        doc = {"jobs": [earlier, later]}
        reconcile(doc, "2026-11-11")
        self.assertTrue(later["crossIdRepost"]["pending"])
        reconcile(doc, "2026-11-13")
        self.assertNotIn("crossIdRepost", later)
        reconcile(doc, "2026-11-11")
        self.assertNotIn("crossIdRepost", later)
        self.assertEqual([row["jobStatus"] for row in doc["jobs"]], ["active"] * 2)

    def test_same_numeric_id_cannot_be_its_own_replacement(self):
        earlier = listing("4000000000", "2026-11-01", "2026-11-11")
        later = listing("4000000000", "2026-11-11", sourceJobId="li-citi-4000000000")
        doc = {"jobs": [earlier, later], "count": 2}
        before = copy.deepcopy(doc)
        reconcile(doc, "2026-11-11")
        self.assertEqual(doc, before)

    def test_same_day_observation_times_take_priority_over_id_order(self):
        earlier = listing("4000000001", "2026-11-10T17:00:00Z", "2026-11-11T06:00:00Z")
        later = listing("4000000000", "2026-11-11T05:00:00Z")
        doc = {"jobs": [later, earlier]}
        reconcile(doc, "2026-11-11")
        self.assertEqual(doc["jobs"], [later])
        self.assertEqual(later["crossIdRepost"]["previousId"], "4000000001")

    def test_only_same_title_company_city_within_one_day(self):
        for updates, close in (
            ({"title": "Advisory Sales - Equity Broker"}, "2026-11-11"),
            ({"company": "HSBC"}, "2026-11-11"),
            ({"city": "Beijing"}, "2026-11-11"),
            ({"city": "", "locationRaw": "China"}, "2026-11-11"),
            ({"location": "HK"}, "2026-11-11"),
            ({}, "2026-11-09"),
            ({}, "2026-11-13"),
        ):
            with self.subTest(updates=updates, close=close):
                earlier = listing("4000000000", "2026-11-01", close)
                later = listing("4000000001", "2026-11-11", **updates)
                doc = {"jobs": [earlier, later], "count": 2}
                before = copy.deepcopy(doc)
                reconcile(doc, "2026-11-14")
                self.assertEqual(doc, before)

    def test_deleted_id_cannot_return_via_rss_jobspy_or_historical_backfill(self):
        earlier = listing("4000000000", "2026-11-01", "2026-11-11")
        later = listing("4000000001", "2026-11-11", city="", locationRaw="Shanghai, Shanghai, China")
        canonical = {"jobs": [earlier, later], "count": 2}
        reconcile(canonical, "2026-11-11")
        self.assertEqual(canonical["jobs"], [later])
        stale = {**earlier, "sourceJobId": "li-citi-4000000000", "jobStatus": "active"}
        snapshot = {"jobs": [stale], "scopeLocations": ["CN"]}
        for result in (merge_documents(canonical, {"jobs": [stale]}),
                       reconcile_snapshot(canonical, snapshot, "2026-11-12T01:00:00Z"),
                       enrich(canonical, [stale])):
            self.assertEqual([row["sourceJobId"] for row in result["jobs"]], ["li-4000000001"])


if __name__ == "__main__":
    unittest.main()
