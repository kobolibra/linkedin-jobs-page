import unittest
from posting_event_history import reconcile, daily_counts
class PureNewRegression(unittest.TestCase):
    def test_old_repost_never_adds_to_recent_window(self):
        jobs=[{'link':'https://www.linkedin.com/jobs/view/4459179721','location':'CN','firstSeen':'2026-08-26','postingLastDate':'2026-11-17','lastRepostedAt':'2026-11-17'},
              {'link':'https://www.linkedin.com/jobs/view/4489793926','location':'CN','firstSeen':'2026-11-17','jobStatus':'expired'}]
        ledger=reconcile({'schemaVersion':'1.0','events':[]},jobs)
        self.assertEqual(daily_counts(ledger),{'2026-08-26':{'CN':1},'2026-11-17':{'CN':1}})
        removed=reconcile(ledger,jobs[:1])
        self.assertEqual(daily_counts(removed),{'2026-08-26':{'CN':1}})
