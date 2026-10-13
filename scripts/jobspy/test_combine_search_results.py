import json
import tempfile
import unittest
from pathlib import Path

from combine_search_results import combine
from reconcile_full_snapshots import reconcile
from scraper_health import alerts


def job(number):
    return {'sourceJobId':f'li-{number}','link':f'https://www.linkedin.com/jobs/view/{number}',
            'title':'Analyst','company':'HSBC','requestedCompany':'HSBC','location':'CN','jobStatus':'active'}


class CombineTests(unittest.TestCase):
    def test_partial_verified_rows_publish_without_expiring_unobserved_jobs(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'hsbc.json'
            path.write_text(json.dumps({'jobs':[job(12345678)],'statusSummary':{'HSBC::CN':'failed@start=10: HTTP 429'}}))
            snapshot,publishable,_=combine(tmp,'cn')
            self.assertTrue(publishable)
            result=reconcile({'jobs':[job(12345678),job(87654321)]},snapshot,'2026-10-13T00:00:00Z')
            self.assertEqual([x['jobStatus'] for x in result['jobs']],['active','active'])
            self.assertTrue(alerts({'task':'jobs','queries':snapshot['statusSummary']})[0])

    def test_failed_empty_search_does_not_replace_last_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp)/'hsbc.json').write_text(json.dumps({'jobs':[],'statusSummary':{'HSBC::CN':'failed: blocked'}}))
            _,publishable,_=combine(tmp,'cn')
            self.assertFalse(publishable)

    def test_invalid_identity_cannot_make_a_complete_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            item=job(12345678);item['sourceJobId']='li-87654321'
            (Path(tmp)/'hsbc.json').write_text(json.dumps({'jobs':[item],'statusSummary':{'HSBC::CN':'ok: 1 jobs'}}))
            doc,publishable,_=combine(tmp,'cn')
            self.assertFalse(publishable)
            self.assertNotIn('HSBC::CN',doc['statusSummary'])


if __name__=='__main__':
    unittest.main()
