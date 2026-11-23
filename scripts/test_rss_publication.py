import json
import tempfile
import unittest
import subprocess
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace

from rss_publication import capture, merge, read_target_history, filter_target_history
from company_logos import collect, apply
import test_company_logos


class RssPublicationTests(unittest.TestCase):
    def write(self, root, path, doc):
        target=root/path;target.parent.mkdir(parents=True,exist_ok=True)
        if str(path) == 'data/n8n/rss-latest.json':
            history=root/'reports/cumulative-target-companies.tsv'
            history.parent.mkdir(parents=True,exist_ok=True)
            if not history.exists():
                history.write_text('公司名\t备注\t首次出现\t最近出现\n',encoding='utf-8')
        blacklist=root/'financial_blacklist.json'
        if not blacklist.exists():
            blacklist.write_text('[]',encoding='utf-8')
        target.write_text(json.dumps(doc),encoding='utf-8')
        return target

    def job(self, job_id, company='Existing', **extra):
        return {'sourceJobId':'li-'+job_id,'link':'https://www.linkedin.com/jobs/view/'+job_id,
                'company':company,'location':'CN','title':'Analyst','jobStatus':'active',**extra}

    def test_new_rss_company_is_in_logo_input_before_frontend_payload_is_built(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);inputs=root/'inputs';out=root/'merged.json'
            old=self.job('100000001');new=self.job('100000002','New Company')
            self.write(root,'jobs.json',{'jobs':[old]})
            self.write(root,'data/n8n/rss-latest.json',{'jobs':[new]})
            asset='a'*24+'.svg'
            self.write(root,'data/company-logos/state.json',{'existing':{'status':'ready','asset':asset}})
            cached=root/'assets/company-logos'/asset;cached.parent.mkdir(parents=True,exist_ok=True)
            cached.write_bytes(test_company_logos.LogosTests().svg())
            capture(root,inputs);merge(root,inputs,out)
            args=SimpleNamespace(jobs=str(out),state=str(root/'data/company-logos/state.json'),
                mode='rss',output=str(root/'logos'),limit=1000,delay=0)
            url='https://static.licdn.com/aero-v1/sc/h/aajlclc14rr2scznz5qm2rj9u'
            fixture=test_company_logos.LogosTests()
            with patch('company_logos.fetch_bytes',side_effect=[fixture.html('New Company',url).encode(),fixture.svg()]) as fetch:
                collect(args)
            self.assertEqual(fetch.call_count,2)
            manifest=root/'company-logos.json'
            apply(SimpleNamespace(apply=args.output,state=args.state,assets=str(root/'assets/company-logos'),manifest=str(manifest)))
            self.assertIn('new company',json.loads(manifest.read_text()))
            state=json.loads(Path(args.state).read_text())
            self.assertEqual(state['new company']['status'],'ready')
            self.assertEqual(state['new company']['imageKind'],'placeholder')
            builder=Path(__file__).resolve().parent/'jobspy/build_frontend_payload.py'
            subprocess.run([sys.executable,str(builder),'--source',str(out),'--index',str(root/'index.json'),
                '--details',str(root/'details.json'),'--boilerplate',str(root/'boilerplate.json')],check=True,capture_output=True)
            index=json.loads((root/'index.json').read_text())
            self.assertEqual(index['companyLogos']['new company'],json.loads(manifest.read_text())['new company'])
            args.mode='rss'
            with patch('company_logos.fetch_bytes') as fetch:collect(args)
            fetch.assert_not_called()

    def test_publication_retry_uses_frozen_rss_and_preserves_newer_canonical_jobs(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);inputs=root/'inputs';out=root/'merged.json'
            original=self.job('100000001');a=self.job('100000002','A');b=self.job('100000003','B')
            self.write(root,'jobs.json',{'jobs':[original]})
            self.write(root,'data/n8n/rss-latest.json',{'jobs':[a]})
            capture(root,inputs);merge(root,inputs,out)
            self.write(root,'data/n8n/rss-latest.json',{'jobs':[b]})
            retained=self.job('100000004','Retained')
            self.write(root,'jobs.json',{'jobs':[original,retained]})
            merge(root,inputs,out)
            self.assertEqual({x['sourceJobId'] for x in json.loads(out.read_text())['jobs']},
                {'li-100000001','li-100000002','li-100000004'})

    def test_completed_jobspy_and_liveness_are_merged_without_altering_source_snapshots(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);inputs=root/'inputs';out=root/'merged.json'
            now=datetime.now(timezone.utc).isoformat()
            target=self.job('100000001','HSBC',companyCanonical='hsbc',descriptionHtml='<p><strong>Keep JD</strong></p>')
            other=self.job('100000002','Other')
            self.write(root,'jobs.json',{'jobs':[target,other]})
            self.write(root,'data/n8n/rss-latest.json',{'jobs':[]})
            search=self.write(root,'data/jobspy/incremental/search_combined.json',{
                'jobs':[{**target,'title':'Updated'}],'scopeLocations':['CN'],'statusSummary':{'HSBC::CN':'ok: 1 jobs'}})
            marker=root/'data/jobspy/incremental/latest.completed_at';marker.write_text(now)
            self.write(root,'data/jobspy/incremental/liveness.json',{'schemaVersion':'1.1','mode':'job-liveness',
                'scopeLocations':['CN'],'observedAt':now,'observations':[{'jobId':'100000002','result':'closed','checkedAt':now}]})
            before=search.read_bytes();capture(root,inputs)
            self.write(root,'data/jobspy/incremental/search_combined.json',{'jobs':[self.job('100000003','HSBC')]})
            merge(root,inputs,out)
            rows={x['sourceJobId']:x for x in json.loads(out.read_text())['jobs']}
            self.assertEqual(rows['li-100000001']['title'],'Updated')
            self.assertEqual(rows['li-100000001']['descriptionHtml'],target['descriptionHtml'])
            self.assertEqual(rows['li-100000002']['jobStatus'],'expired')
            self.assertNotIn('li-100000003',rows)
            self.assertEqual((inputs/'jobspy.json').read_bytes(),before)

    def test_rss_cleanup_keeps_fifteen_days_and_requires_a_terminal_final_check(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); inputs=root/'inputs'; output=root/'out.json'
            now=datetime.now(timezone.utc)
            rows=[self.job('100000001',jobStatus='expired',expiredReason='linkedin_closed',expiredAt=(now-timedelta(days=14)).isoformat()),
                  self.job('100000002',jobStatus='expired',expiredReason='linkedin_removed',expiredAt=(now-timedelta(days=16)).isoformat()),
                  self.job('100000003',jobStatus='expired',expiredReason='linkedin_closed',expiredAt=(now-timedelta(days=16)).isoformat()),
                  self.job('100000004','HSBC',companyCanonical='hsbc',jobStatus='expired',expiredReason='linkedin_closed',expiredAt=(now-timedelta(days=16)).isoformat())]
            self.write(root,'jobs.json',{'jobs':rows})
            self.write(root,'data/n8n/rss-latest.json',{'jobs':[]})
            self.write(root,'data/jobspy/incremental/liveness.json',{'schemaVersion':'1.1','mode':'job-liveness','scopeLocations':['CN'],'observations':[
                {'jobId':key,'result':result,'checkedAt':now.isoformat()} for key,result in [('100000001','closed'),('100000002','closed'),('100000003','unknown'),('100000004','closed')]]})
            capture(root,inputs);merge(root,inputs,output)
            self.assertEqual({item['sourceJobId'] for item in json.loads(output.read_text())['jobs']},{'li-100000001','li-100000003','li-100000004'})

    def test_publication_uses_listing_times_and_accepts_partial_liveness_after_deadline(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);inputs=root/'inputs';output=root/'out.json'
            start='2026-10-15T03:16:00Z';page='2026-10-15T03:17:00Z';rss='2026-10-15T03:25:00Z';finish='2026-10-15T03:35:00Z'
            current=self.job('100000001','HSBC',rssObservedAt=rss,title='Current title',descriptionHtml='<p><strong>Current JD</strong></p>')
            new_rss=self.job('100000002','HSBC',rssObservedAt=rss,firstSeen='2026-01-01')
            old_missing=self.job('100000003','HSBC',firstSeen='2026-01-01')
            checked=self.job('100000004','Other');not_checked=self.job('100000005','Other')
            self.write(root,'jobs.json',{'jobs':[current,new_rss,old_missing,checked,not_checked]})
            self.write(root,'data/n8n/rss-latest.json',{'generatedAt':finish,'jobs':[]})
            self.write(root,'data/jobspy/incremental/search_combined.json',{
                'jobs':[self.job('100000001','HSBC',title='Old title',descriptionHtml='<p>Old JD</p>',jobspyFetchedAt=page)],
                'scopeLocations':['CN'],'statusSummary':{'HSBC::CN':'ok: 1 jobs'},'companies':{'HSBC::CN':'ok: 1 jobs'},
                'queryStartedAt':{'HSBC::CN':start}})
            (root/'data/jobspy/incremental/latest.completed_at').write_text(finish)
            self.write(root,'data/jobspy/incremental/liveness.json',{
                'schemaVersion':'1.1','mode':'job-liveness','scopeLocations':['CN'],'stats':{'budgetExhausted':True},
                'observedAt':finish,'observations':[{'jobId':'100000004','result':'closed','checkedAt':finish}]})
            capture(root,inputs);merge(root,inputs,output)
            got=json.loads(output.read_text());items={row['sourceJobId']:row for row in got['jobs']}
            self.assertEqual(items['li-100000001']['title'],'Current title')
            self.assertEqual(items['li-100000001']['descriptionHtml'],current['descriptionHtml'])
            self.assertEqual(items['li-100000002']['jobStatus'],'active')
            self.assertEqual(items['li-100000003']['jobStatus'],'expired')
            self.assertEqual(items['li-100000004']['jobStatus'],'expired')
            self.assertEqual(items['li-100000005']['jobStatus'],'active')

    def test_tampered_or_invalid_inputs_fail_before_publication(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);inputs=root/'inputs'
            self.write(root,'data/n8n/rss-latest.json',{'invalid':True})
            with self.assertRaises(ValueError):capture(root,inputs)
            self.write(root,'data/n8n/rss-latest.json',{'jobs':[]});capture(root,inputs)
            (inputs/'rss.json').write_text('{"jobs": [{}]}')
            with self.assertRaises(ValueError):merge(root,inputs,root/'out.json')

    def test_target_history_hard_deletes_existing_and_new_jobs_without_touching_n8n_blocklist(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);inputs=root/'inputs';out=root/'out.json'
            history=root/'reports/cumulative-target-companies.tsv'
            existing_target=self.job('100000001','  SLB  ')
            new_target=self.job('100000002','slb')
            allowed=self.job('100000003','SLB Energy')
            bank=self.job('100000004','HSBC')
            blocked=self.job('100000005','Google Sheet Blocked')
            self.write(root,'jobs.json',{'jobs':[existing_target,allowed,bank,blocked]})
            self.write(root,'data/n8n/rss-latest.json',{
                'blocklist':['Google Sheet Blocked'],
                'jobs':[new_target, self.job('100000006','Fresh Allowed')]})
            history.write_text('公司名\t备注\t首次出现\t最近出现\nSLB\t能源\t2026-11-21\t2026-11-21\n',encoding='utf-8')
            capture(root,inputs);merge(root,inputs,out)
            got=json.loads(out.read_text(encoding='utf-8'))
            self.assertEqual({row['sourceJobId'] for row in got['jobs']},
                             {'li-100000003','li-100000004','li-100000006'})
            self.assertEqual(got['count'],3)
            self.assertEqual(got['n8nIncrementalMerge']['blocklistHardDelete'],1)

    def test_target_history_refreshes_on_publication_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);inputs=root/'inputs';out=root/'out.json'
            history=root/'reports/cumulative-target-companies.tsv'
            self.write(root,'jobs.json',{'jobs':[self.job('100000001','Previously Allowed')]})
            self.write(root,'data/n8n/rss-latest.json',{'jobs':[]})
            capture(root,inputs);merge(root,inputs,out)
            self.assertEqual(len(json.loads(out.read_text())['jobs']),1)
            history.write_text('公司名\t备注\t首次出现\t最近出现\nPreviously Allowed\t待查证\t2026-11-21\t2026-11-21\n',encoding='utf-8')
            merge(root,inputs,out)
            self.assertEqual(json.loads(out.read_text())['jobs'],[])

    def test_target_history_missing_or_corrupt_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);inputs=root/'inputs';out=root/'out.json'
            history=root/'reports/cumulative-target-companies.tsv'
            self.write(root,'jobs.json',{'jobs':[self.job('100000001')]})
            self.write(root,'data/n8n/rss-latest.json',{'jobs':[]})
            capture(root,inputs)
            history.unlink()
            with self.assertRaises(FileNotFoundError):merge(root,inputs,out)
            history.write_text('公司名\t备注\nBad\tbroken\tunexpected\n')
            with self.assertRaises(ValueError):merge(root,inputs,out)

    def test_target_history_does_not_read_excluded_company_history(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);inputs=root/'inputs';out=root/'out.json'
            self.write(root,'jobs.json',{'jobs':[self.job('100000001','HSBC')]})
            self.write(root,'data/n8n/rss-latest.json',{'jobs':[]})
            (root/'reports/cumulative-excluded-companies.tsv').write_text(
                '公司名\t排除原因\t首次出现\t最近出现\nHSBC\t金融\t2026-11-21\t2026-11-21\n')
            capture(root,inputs);merge(root,inputs,out)
            self.assertEqual(len(json.loads(out.read_text())['jobs']),1)

    def test_reclassified_financial_companies_are_recovered_and_not_deleted(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);inputs=root/'inputs';out=root/'jobs.json.out'
            history=root/'reports/cumulative-target-companies.tsv'
            original=self.job('100000011','Parich Group Limited',firstSeen='2026-11-22')
            n8n_blocked=self.job('100000012','Breeze')
            target=self.job('100000013','Fano (Fano Labs)')
            self.write(root,'jobs.json',{'jobs':[]})
            self.write(root,'data/n8n/rss-latest.json',{'jobs':[target],
                'blocklist':['Breeze']})
            history.write_text('公司名\t备注\t首次出现\t最近出现\n'
                               'Parich Group Limited\t待查证\t2026-11-23\t2026-11-23\n'
                               'Breeze\t待查证\t2026-11-22\t2026-11-22\n'
                               'Fano (Fano Labs)\tAI\t2026-11-23\t2026-11-23\n')
            self.write(root,'financial_blacklist.json',['Parich Group Limited','Breeze'])
            self.write(root,'data/target-filter-quarantine.json',
                       {'schemaVersion':'1.0','jobs':[original,n8n_blocked]})
            capture(root,inputs)
            merge(root,inputs,out,root/'data/target-filter-quarantine.json')
            doc=json.loads(out.read_text())
            self.assertEqual([job['sourceJobId'] for job in doc['jobs']],['li-100000011'])
            self.assertEqual(doc['jobs'][0]['firstSeen'],'2026-11-22')
            self.assertEqual(doc['n8nIncrementalMerge']['blocklistHardDelete'],1)
            saved=json.loads((root/'data/target-filter-quarantine.json').read_text())['jobs']
            self.assertEqual([job['company'] for job in saved],['Fano (Fano Labs)'])

    def test_after_verification_can_restore_job_deleted_by_earlier_run(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);inputs=root/'inputs';out=root/'out.json'
            old=self.job('100000021','Parich Group Limited',firstSeen='2026-11-22')
            self.write(root,'jobs.json',{'jobs':[old]})
            self.write(root,'data/n8n/rss-latest.json',{'jobs':[]})
            (root/'reports/cumulative-target-companies.tsv').write_text(
                '公司名\t备注\t首次出现\t最近出现\n'
                'Parich Group Limited\t待查证\t2026-11-23\t2026-11-23\n')
            quarantine=root/'data/target-filter-quarantine.json'
            capture(root,inputs);merge(root,inputs,out,quarantine)
            self.assertEqual(json.loads(out.read_text())['jobs'],[])
            self.assertEqual(len(json.loads(quarantine.read_text())['jobs']),1)
            self.write(root,'jobs.json',{'jobs':[]})
            self.write(root,'financial_blacklist.json',['Parich Group Limited'])
            merge(root,inputs,out,quarantine)
            result=json.loads(out.read_text())
            self.assertEqual([j['company'] for j in result['jobs']],['Parich Group Limited'])
            self.assertEqual(result['jobs'][0]['firstSeen'],'2026-11-22')
            self.assertEqual(json.loads(quarantine.read_text())['jobs'],[])

    def test_missing_financial_verification_data_blocks_publication(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);inputs=root/'inputs';out=root/'out.json'
            self.write(root,'jobs.json',{'jobs':[self.job('100000021')]})
            self.write(root,'data/n8n/rss-latest.json',{'jobs':[]})
            capture(root,inputs)
            (root/'financial_blacklist.json').unlink()
            with self.assertRaises(FileNotFoundError):
                merge(root,inputs,out)

    def test_workflow_runs_for_rss_or_target_history_and_deploys_after_logo_apply(self):
        workflow=Path(__file__).resolve().parents[1]/'.github/workflows/publish-n8n-rss.yml'
        text=workflow.read_text()
        triggers=text.split('on:',1)[1].split('concurrency:',1)[0]
        self.assertIn('paths: [data/n8n/rss-latest.json, reports/cumulative-target-companies.tsv, financial_blacklist.json]',triggers)
        self.assertNotIn('data/jobspy/',triggers)
        self.assertNotIn('.github/workflows/',triggers)
        collect_index=text.index('id: logos')
        publish_index=text.index('name: Commit merged jobs')
        self.assertLess(collect_index,publish_index)
        shell=text[publish_index:]
        self.assertLess(shell.index('company_logos.py --apply'),shell.index('build_frontend_payload.py'))
        self.assertLess(shell.index('build_frontend_payload.py'),shell.index('git push'))
        self.assertLess(shell.index('git push'),shell.index('gh workflow run deploy.yml'))
        self.assertEqual(workflow.read_text().count('gh workflow run deploy.yml'),1)
        self.assertNotIn('gh workflow run company-logos.yml',workflow.read_text())


if __name__=='__main__':unittest.main()
