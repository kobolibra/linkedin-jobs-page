import unittest
from posting_event_history import reconcile, daily_counts

class PostingHistoryRegression(unittest.TestCase):
    def test_close_delete_repost_and_repeat_preserve_old_days(self):
        job = {"link":"https://www.linkedin.com/jobs/view/4459179721","location":"CN","firstSeen":"2026-08-26","postingLastDate":"2026-10-29","lastRepostedAt":"2026-10-29"}
        ledger = reconcile({"schemaVersion":"1.0","events":[]}, [job])
        counts = daily_counts(ledger)
        self.assertEqual(counts, {"2026-08-26":{"CN":1},"2026-10-29":{"CN":1}})
        for rows in ([dict(job,jobStatus="expired")], [], [job,job]):
            self.assertEqual(reconcile(ledger, rows),ledger)
        advanced = reconcile(ledger,[dict(job,postingLastDate="2026-11-17",lastRepostedAt="2026-11-17")])
        self.assertEqual(daily_counts(advanced),dict(counts, **{"2026-11-17":{"CN":1}}))
        self.assertEqual(reconcile(advanced,[job]),advanced)
    def test_unverified_newer_date_does_not_create_repost(self):
        job={"link":"https://www.linkedin.com/jobs/view/4459179721","firstSeen":"2026-08-26","postingLastDate":"2026-10-29","location":"CN"}
        ledger=reconcile({"schemaVersion":"1.0","events":[]},[job])
        self.assertEqual(len(ledger["events"]),1)
