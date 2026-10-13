import json
import tempfile
import unittest
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace

from rss_publication import capture, merge
from company_logos import collect, apply
import test_company_logos


class RssPublicationTests(unittest.TestCase):
    def write(self, root, path, doc):
        target=root/path;target.parent.mkdir(parents=True,exist_ok=True)
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

    def test_tampered_or_invalid_inputs_fail_before_publication(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);inputs=root/'inputs'
            self.write(root,'data/n8n/rss-latest.json',{'invalid':True})
            with self.assertRaises(ValueError):capture(root,inputs)
            self.write(root,'data/n8n/rss-latest.json',{'jobs':[]});capture(root,inputs)
            (inputs/'rss.json').write_text('{"jobs": [{}]}')
            with self.assertRaises(ValueError):merge(root,inputs,root/'out.json')

    def test_workflow_has_only_rss_push_trigger_and_one_deployment_after_logo_apply(self):
        workflow=Path(__file__).resolve().parents[1]/'.github/workflows/publish-n8n-rss.yml'
        text=workflow.read_text()
        triggers=text.split('on:',1)[1].split('concurrency:',1)[0]
        self.assertIn('paths: [data/n8n/rss-latest.json]',triggers)
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
