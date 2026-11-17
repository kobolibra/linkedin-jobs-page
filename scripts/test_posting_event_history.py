"""Pure new cohorts: repost ignored, expiration retained, deletion subtracted."""
import json
import tempfile
import unittest
from pathlib import Path
from posting_event_history import daily_counts, identity, read_ledger, reconcile

def job(job_id='4489793926', **kw):
    return dict({'link':f'https://www.linkedin.com/jobs/view/{job_id}/', 'firstSeen':'2026-11-01','location':'CN','jobStatus':'active'}, **kw)

class PostingEventsTests(unittest.TestCase):
    def test_repost_expire_delete_and_repeat(self):
        empty={'schemaVersion':'1.0','events':[]}
        initial=reconcile(empty,[job()])
        expected={'2026-11-01':{'CN':1}}
        for changes in [dict(lastRepostedAt='2026-11-14'),dict(jobspyRepost=True,postingLastDate='2026-11-17'),dict(jobStatus='expired',expiredAt='2026-11-17')]:
            self.assertEqual(daily_counts(reconcile(initial,[job(**changes)])),expected)
        self.assertEqual(reconcile(initial,[job(),job()]),initial)
        self.assertEqual(daily_counts(reconcile(initial,[])),{})
    def test_migration_removes_reposts_and_deleted_jobs(self):
        legacy={'schemaVersion':'1.0','events':[
            {'jobId':'ln:4489793926','day':'2026-11-01','region':'CN','kind':'first'},
            {'jobId':'ln:4489793926','day':'2026-11-14','region':'CN','kind':'repost'},
            {'jobId':'ln:123456789','day':'2026-11-02','region':'HK','kind':'first'}]}
        migrated=reconcile(legacy,[job(lastRepostedAt='2026-11-14')])
        self.assertEqual(daily_counts(migrated),{'2026-11-01':{'CN':1}})
        self.assertEqual(reconcile(migrated,[job()]),migrated)
    def test_two_roles_on_same_day_and_expired_role(self):
        result=reconcile({'schemaVersion':'1.0','events':[]},[job(),job('123456789',jobStatus='expired')])
        self.assertEqual(daily_counts(result),{'2026-11-01':{'CN':2}})
    def test_no_manufactured_first_date(self):
        result=reconcile({'schemaVersion':'1.0','events':[]},[job(firstSeen=None,pushTime='2026-11-17',lastRepostedAt='2026-11-17')])
        self.assertEqual(result['events'],[])
        self.assertEqual(identity(job(link='https://cn.linkedin.com/jobs/view/slug-4489793926/')),'ln:4489793926')
    def test_corrupt_ledger_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'ledger.json';path.write_text('{"schemaVersion":"invalid","events":[]}')
            with self.assertRaises(ValueError):read_ledger(path)
