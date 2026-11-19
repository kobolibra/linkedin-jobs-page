"""Partial newest-first discovery must retain new jobs and protect older jobs."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from combine_search_results import combine
from fetch_linkedin_requests import main
from linkedin_http import RequestStopped
from reconcile_full_snapshots import reconcile
import run_company_searches as runner
from test_linkedin_http import response


class ListingPriorityTests(unittest.TestCase):
    def test_latest_request_order_and_partial_results_survive_publication(self):
        def card(job_id, day):
            return f'<div class="base-search-card"><a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/{job_id}">Job</a><h4 class="base-search-card__subtitle"><a>HSBC</a></h4><h3 class="base-search-card__title">Analyst</h3><span class="job-search-card__location">Shanghai, China</span><time datetime="{day}"></time></div>'
        class Session:
            def __init__(self): self.headers = {}; self.params = []
            def get(self, url, **kwargs):
                self.params.append(dict(kwargs['params']))
                if len(self.params) == 1:
                    return response(text=card('700000001','2026-10-14')+card('700000002','2026-10-13'),url=url)
                raise RequestStopped('HTTP 429 page deferred; retry on a later run')
        session = Session()
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)/'hsbc.json'
            with patch('fetch_linkedin_requests.LinkedInSession', return_value=session), patch.object(sys,'argv',['search','--company','HSBC','--output',str(output)]):
                self.assertEqual(main(),0)
            snapshot,publishable,_ = combine(tmp,'cn')
            self.assertTrue(publishable)
            self.assertEqual(len(snapshot['jobs']),2)
            self.assertTrue(snapshot['statusSummary']['HSBC::CN'].startswith('failed@start=10:'))
            old={'sourceJobId':'li-888888888','link':'https://www.linkedin.com/jobs/view/888888888','company':'HSBC','requestedCompany':'HSBC','location':'CN','title':'Existing job','jobStatus':'active'}
            merged = reconcile({'jobs':[old]},snapshot,json.loads(output.read_text())['generatedAt'])
            self.assertEqual({x['sourceJobId'] for x in merged['jobs']},{'li-888888888','li-700000001','li-700000002'})
            self.assertTrue(all(x['jobStatus']=='active' for x in merged['jobs']))
            self.assertEqual(merged['jobspySnapshot']['expired'],0)
        self.assertEqual([x['start'] for x in session.params],[0,10])
        self.assertTrue(all(x['sortBy']=='DD' and x['f_C']=='1241' and x['location']=='China' for x in session.params))

    def test_resume_keeps_verified_prefix_and_skips_completed_region(self):
        def job(key, region):
            return {'sourceJobId':'li-'+key,'link':'https://www.linkedin.com/jobs/view/'+key,'requestedCompany':'HSBC','company':'HSBC','location':region,'title':'Analyst'}
        class Session:
            def __init__(self): self.headers={}; self.params=[]
            def get(self,url,**kwargs):
                self.params.append(dict(kwargs['params']))
                if len(self.params)==1:
                    html='<div class="base-search-card"><a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/700000002">Job</a><h4 class="base-search-card__subtitle"><a>HSBC</a></h4><h3 class="base-search-card__title">Analyst</h3><span class="job-search-card__location">Shanghai, China</span></div>'
                else: html='<!DOCTYPE html>\n\n<!---->  '
                return response(text=html,url=url)
        session=Session()
        with tempfile.TemporaryDirectory() as tmp:
            output=Path(tmp)/'hsbc.json'
            hk=job('700000003','HK')
            output.write_text(json.dumps({'jobs':[job('700000001','CN'),hk],'statusSummary':{'HSBC::CN':'failed@start=10: HTTP 429 page deferred','HSBC::HK':'ok: 1 jobs'}}))
            argv=['search','--company','HSBC','--location','China','--location','Hong Kong','--output',str(output),'--resume']
            with patch('fetch_linkedin_requests.LinkedInSession',return_value=session),patch.object(sys,'argv',argv): self.assertEqual(main(),0)
            result=json.loads(output.read_text())
            self.assertEqual({x['sourceJobId'] for x in result['jobs']},{'li-700000001','li-700000002','li-700000003'})
            self.assertEqual(next(x for x in result['jobs'] if x['location']=='HK'),hk)
            self.assertEqual(result['statusSummary'],{'HSBC::CN':'partial@resumed-end: 2 jobs','HSBC::HK':'ok: 1 jobs'})
            snapshot,publishable,_=combine(tmp,'expanded')
            self.assertTrue(publishable)
            old=job('888888888','CN');old['jobStatus']='active'
            merged=reconcile({'jobs':[old]},snapshot,json.loads(output.read_text())['generatedAt'])
            self.assertEqual(next(x for x in merged['jobs'] if x['sourceJobId']=='li-888888888')['jobStatus'],'active')
            self.assertFalse(output.with_suffix('.json.tmp').exists())
        self.assertEqual([x['start'] for x in session.params],[10,20,30])
        self.assertTrue(all(x['location']=='China' and x['sortBy']=='DD' for x in session.params))

    def test_recovery_pass_runs_after_all_companies_and_preserves_checkpoint(self):
        calls=[]
        def network(command,**kwargs):
            output=Path(command[command.index('--output')+1])
            company=command[command.index('--company')+1]
            resuming='--resume' in command; calls.append((company,resuming))
            if resuming:
                self.assertTrue(output.exists())
                report=json.loads(output.read_text()); self.assertEqual(len(report['jobs']),1)
                report['statusSummary']={company+'::CN':'ok: 1 jobs'}
            else:
                report={'jobs':[{'sourceJobId':'li-700000001'}] if company=='HSBC' else [],'statusSummary':{company+'::CN':('failed@start=10: HTTP 429 page deferred' if company=='HSBC' else 'failed@start=0: HTTP 503' if company=='Citi' else 'ok: 1 jobs')}}
            output.write_text(json.dumps(report))
            return type('Completed',(),{'returncode':0,'stdout':'','stderr':''})()
        with tempfile.TemporaryDirectory() as tmp,patch('run_company_searches.subprocess.run',side_effect=network),patch.object(sys,'argv',['runner','--output-dir',tmp,'--max-workers','1']):
            self.assertEqual(runner.main(),0)
        initial_count = len(runner.COMPANIES) - 1  # State Street gated before historical initialization
        self.assertEqual(len(calls), initial_count + 1)
        self.assertTrue(all(not resume for _,resume in calls[:initial_count]))
        self.assertEqual(calls[-1],('HSBC',True))


if __name__ == '__main__': unittest.main()
