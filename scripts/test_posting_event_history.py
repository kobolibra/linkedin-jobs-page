"""Immutable publication-event tests: repost, closure, deletion and replay."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[0]))
from posting_event_history import daily_counts, identity, read_ledger, reconcile


def job(job_id="4489793926", **kw):
    base = {"link": f"https://www.linkedin.com/jobs/view/{job_id}/",
            "firstSeen": "2026-11-01", "location": "CN",
            "postingLastDate": "2026-11-01", "jobStatus": "active"}
    return {**base, **kw}


class PostingEventsTests(unittest.TestCase):
    def test_first_repost_and_closed_role_keep_historical_counts(self):
        ledger = read_ledger(Path("/nonexistent/posting-events-ledger-test.json"))
        initial = reconcile(ledger, [job()])
        self.assertEqual(daily_counts(initial), {"2026-11-01": {"CN": 1}})
        reposted = reconcile(initial, [job(lastRepostedAt="2026-11-14", postingLastDate="2026-11-14")])
        self.assertEqual(daily_counts(reposted), {
            "2026-11-01": {"CN": 1}, "2026-11-14": {"CN": 1}})
        self.assertEqual(len(reconcile(reposted, [job(lastRepostedAt="2026-11-14")])["events"]), 2)
        closed = reconcile(reposted, [job(jobStatus="expired", firstSeen="2026-11-01",
                                        lastRepostedAt="2026-11-14", expiredAt="2026-11-16")])
        self.assertEqual(daily_counts(closed), daily_counts(reposted))
        deleted = reconcile(closed, [])
        self.assertEqual(daily_counts(deleted), daily_counts(reposted),
                         "physical canonical deletion must never erase old bars")
        rerun = reconcile(deleted, [job(postingLastDate="2026-11-20",
                                        lastRepostedAt="2026-11-20")])
        self.assertEqual(daily_counts(rerun)["2026-11-01"]["CN"], 1)
        self.assertEqual(daily_counts(rerun)["2026-11-14"]["CN"], 1)
        self.assertEqual(daily_counts(rerun)["2026-11-20"]["CN"], 1)

    def test_bare_newer_source_date_and_rss_observation_are_not_reposts(self):
        first = reconcile({"schemaVersion": "1.0", "events": []}, [job()])
        self.assertEqual(len(reconcile(first, [job(postingLastDate="2026-11-13",
                                                    pushTime="2026-11-13")])["events"]), 1)
        self.assertEqual(len(reconcile(first, [job(postingLastDate="2026-11-13",
                                                    rssObservedAt="2026-11-16")])["events"]), 1)
        confirmed = reconcile(first, [job(postingLastDate="2026-11-13", jobspyRepost=True)])
        self.assertEqual(len(confirmed["events"]), 2)

    def test_multiple_same_day_roles_are_separate_and_region_is_immutable(self):
        initial = reconcile({"schemaVersion": "1.0", "events": []}, [
            job("123456789", location="HK"), job("999999999", location="SG")])
        self.assertEqual(daily_counts(initial)["2026-11-01"], {"HK": 1, "SG": 1})
        moved = reconcile(initial, [job("123456789", firstSeen="2026-11-04",
                                         location="CN", postingLastDate="2026-11-04")])
        self.assertEqual(daily_counts(moved), daily_counts(initial),
                         "historical event day and region cannot migrate")

    def test_ledger_validation_rejects_duplicate_or_corrupt_history(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "history.json"
            item = {"jobId": "ln:123456789", "day": "2026-11-01",
                    "region": "HK", "kind": "first"}
            path.write_text(json.dumps({"schemaVersion": "1.0", "events": [item, item]}))
            with self.assertRaises(ValueError):
                read_ledger(path)
            path.write_text('{"schemaVersion":"invalid","events":[]}')
            with self.assertRaises(ValueError):
                read_ledger(path)

    def test_missing_first_seen_never_invents_age_or_original_event(self):
        empty = {"schemaVersion": "1.0", "events": []}
        self.assertEqual(len(reconcile(empty, [job(firstSeen=None, pushTime="2026-11-17")])["events"]), 0)
        self.assertEqual(identity(job(sourceJobId="li-4489793926")), "ln:4489793926")
        self.assertEqual(identity(job(link="https://www.linkedin.com/jobs/view/cfo-financial-reporting-vp-4489793926/")), "ln:4489793926")


if __name__ == "__main__":
    unittest.main()
