"""Listing evidence precedes the later detail/liveness/run completion timestamp."""
import json
import tempfile
import unittest
from copy import deepcopy
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch

from combine_search_results import combine
from fetch_linkedin_requests import main as fetch_main
from reconcile_full_snapshots import reconcile
from track_jd_changes import annotate
from test_fetch_linkedin_requests import HTML

START='2026-10-15T03:16:00Z'
PAGE_TIME='2026-10-15T03:17:00Z'
RSS_TIME='2026-10-15T03:25:00Z'
FINISH='2026-10-15T03:35:00Z'


def job(key, **extra):
    return {'sourceJobId':'li-'+str(key),'company':'HSBC','requestedCompany':extra.get('company','HSBC'),'title':'Analyst',
            'link':'https://www.linkedin.com/jobs/view/'+str(key),'location':'CN','jobStatus':'active',**extra}


def snapshot():
    return {'scopeLocations':['CN'],'jobs':[job(100000001,jobspyFetchedAt=PAGE_TIME)],
            'statusSummary':{'HSBC::CN':'ok: 1 jobs'},'companies':{'HSBC::CN':'ok: 1 jobs'},
            'queryStartedAt':{'HSBC::CN':START}}


class ObservationTimeTests(unittest.TestCase):
    def test_rss_between_query_and_finish_is_preserved_but_old_missing_job_expires(self):
        existing={'jobs':[job(100000002,rssObservedAt=RSS_TIME,firstSeen='2026-01-01'),job(100000003,firstSeen='2026-01-01')]}
        got=reconcile(existing,snapshot(),FINISH)
        rows={row['sourceJobId']:row for row in got['jobs']}
        self.assertEqual(rows['li-100000002']['jobStatus'],'active')
        self.assertEqual(rows['li-100000003']['jobStatus'],'expired')
        self.assertEqual(rows['li-100000003']['expiredAt'],FINISH) # Existing display convention unchanged.
        self.assertEqual(rows['li-100000001']['lastSeenAt'],'2026-10-15T03:17:00+00:00')
        self.assertEqual(got['jobspySnapshot']['observedAt'],FINISH) # Immutable replay identity unchanged.

    def test_absence_boundary_is_query_start_not_last_page(self):
        existing={'jobs':[job(100000002,rssObservedAt='2026-10-15T03:16:30Z',firstSeen='2026-01-01')]}
        self.assertEqual(reconcile(existing,snapshot(),FINISH)['jobs'][0]['jobStatus'],'active')

    def test_positive_old_page_cannot_overwrite_newer_rss_or_reactivate_later_expiry(self):
        for extra in ({'rssObservedAt':RSS_TIME},{'liveVerifiedAt':RSS_TIME},{'jobStatus':'expired','expiredAt':RSS_TIME}):
            current=job(100000001,title='Current title',descriptionHtml='<p>Current JD</p>',**extra)
            existing={'jobs':[current]}; before=deepcopy(existing)
            incoming=snapshot();incoming['jobs'][0].update(title='Old title',descriptionHtml='<p>Old JD</p>')
            got=reconcile(existing,annotate(existing,incoming,FINISH),FINISH)
            self.assertEqual(got['jobs'][0],current)
            self.assertEqual(existing,before)

    def test_a_page_observed_after_rss_can_update_without_overwriting_discovery_time(self):
        current=job(100000001,rssObservedAt='2026-10-15T03:16:30Z',pushTime='2026-01-01',firstSeen='2025-01-01')
        incoming=snapshot();incoming['jobs'][0]['title']='Fresh title'
        got=reconcile({'jobs':[current]},incoming,FINISH)['jobs'][0]
        self.assertEqual(got['title'],'Fresh title')
        self.assertEqual(got['pushTime'],'2026-01-01')
        self.assertEqual(got['firstSeen'],'2025-01-01')

    def test_company_and_region_boundaries_are_independent(self):
        incoming=snapshot();incoming['scopeLocations']=['CN','HK']
        incoming['jobs'] += [job(100000004,location='HK',jobspyFetchedAt='2026-10-15T03:31:00Z'),job(100000005,company='Citi',jobspyFetchedAt='2026-10-15T03:31:00Z')]
        for key in ('HSBC::HK','Citi::CN'):
            incoming['statusSummary'][key]='ok: 1 jobs';incoming['companies'][key]='ok: 1 jobs';incoming['queryStartedAt'][key]='2026-10-15T03:30:00Z'
        existing={'jobs':[job(100000002,rssObservedAt=RSS_TIME),job(100000006,location='HK',rssObservedAt=RSS_TIME),job(100000007,company='Citi',rssObservedAt=RSS_TIME)]}
        got=reconcile(existing,incoming,FINISH)
        self.assertEqual([item['jobStatus'] for item in got['jobs'][:3]],['active','expired','expired'])

    def test_old_saved_snapshots_use_their_earliest_actual_row_time(self):
        incoming=snapshot();incoming.pop('queryStartedAt')
        current=job(100000002,rssObservedAt=RSS_TIME,firstSeen='2026-01-01')
        self.assertEqual(reconcile({'jobs':[current]},incoming,FINISH)['jobs'][0]['jobStatus'],'active')

    def test_invalid_missing_future_or_contradictory_query_times_cannot_expire_absent_jobs(self):
        for value in (None,'invalid',{},[],{'HSBC::CN':'invalid'},{'HSBC::CN':'2026-10-16T00:00:00Z'},{'HSBC::CN':RSS_TIME}):
            incoming=snapshot();incoming['queryStartedAt']=value
            current=job(100000002,firstSeen='2026-01-01')
            self.assertEqual(reconcile({'jobs':[current]},incoming,FINISH)['jobs'][0]['jobStatus'],'active')

    def test_invalid_explicit_row_time_cannot_overwrite_current_record(self):
        for value in ('invalid','2026-10-16T00:00:00Z'):
            incoming=snapshot();incoming['jobs'][0]['jobspyFetchedAt']=value
            old=job(100000001,title='Current title')
            self.assertEqual(reconcile({'jobs':[old]},incoming,FINISH)['jobs'][0],old)

    def test_existing_whole_second_completion_marker_does_not_drop_rows_in_its_final_second(self):
        incoming=snapshot();incoming['jobs'][0]['jobspyFetchedAt']='2026-10-15T03:35:00.500000Z'
        self.assertEqual(len(reconcile({'jobs':[]},incoming,FINISH)['jobs']),1)
        self.assertEqual(reconcile({'jobs':[]},incoming,'2026-10-15T03:35:00.100000Z')['jobs'],[])
        incoming['jobs'][0]['jobspyFetchedAt']='2026-10-15T03:35:01Z'
        self.assertEqual(reconcile({'jobs':[]},incoming,FINISH)['jobs'],[])

    def test_combiner_and_jd_annotation_preserve_each_query_boundary(self):
        with tempfile.TemporaryDirectory() as tmp:
            incoming=snapshot();Path(tmp,'hsbc.json').write_text(json.dumps(incoming))
            got,_,_=combine(tmp,'cn')
            self.assertEqual(got['queryStartedAt'],incoming['queryStartedAt'])
            self.assertEqual(annotate({'jobs':[]},got,FINISH)['queryStartedAt'],incoming['queryStartedAt'])
            incoming['queryStartedAt']=[];Path(tmp,'hsbc.json').write_text(json.dumps(incoming))
            got,_,_=combine(tmp,'cn')
            self.assertEqual(got['queryStartedAt'],{'HSBC::CN':None})

    def test_collector_records_query_start_and_separate_page_observations(self):
        from types import SimpleNamespace
        class Clock(datetime):
            tick=0
            @classmethod
            def now(cls,tz=None):
                cls.tick+=1
                return datetime(2026,10,15,3,16,tzinfo=timezone.utc)+timedelta(seconds=cls.tick)
        session=SimpleNamespace(headers={},get=lambda *_a,**_k:SimpleNamespace(status_code=200,content=HTML.encode(),text=HTML,raise_for_status=lambda:None))
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp,'out')
            argv=['search','--company','HSBC','--output',str(out),'--results-per-company','1']
            with patch('fetch_linkedin_requests.LinkedInSession',return_value=session),patch('fetch_linkedin_requests.datetime',Clock),patch('sys.argv',argv):fetch_main()
            got=json.loads(out.read_text())
            self.assertLess(got['queryStartedAt']['HSBC::CN'],got['jobs'][0]['jobspyFetchedAt'])
            self.assertLess(got['jobs'][0]['jobspyFetchedAt'],got['generatedAt'])

    def test_resume_completed_region_keeps_its_original_boundary_without_new_requests(self):
        from types import SimpleNamespace
        for metadata in (True,False):
            with tempfile.TemporaryDirectory() as tmp:
                out=Path(tmp,'out');old=snapshot();old['jobs'][0]['jobspyFetchedAt']=START
                if not metadata: old.pop('queryStartedAt')
                out.write_text(json.dumps(old));session=SimpleNamespace(headers={},get=lambda *_a,**_k:self.fail('Completed query must not run again'))
                argv=['search','--company','HSBC','--output',str(out),'--resume']
                with patch('fetch_linkedin_requests.LinkedInSession',return_value=session),patch('sys.argv',argv):fetch_main()
                self.assertEqual(json.loads(out.read_text())['queryStartedAt'],{'HSBC::CN':START})

    def test_recovered_tail_does_not_move_the_original_query_boundary(self):
        from types import SimpleNamespace
        from test_linkedin_http import response
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp,'out');old=snapshot()
            old['statusSummary']['HSBC::CN']='failed@start=10: HTTP 429 query deferred'
            out.write_text(json.dumps(old))
            session=SimpleNamespace(headers={},get=lambda *_a,**_k:response(text='<!DOCTYPE html>\n\n<!---->  '))
            argv=['search','--company','HSBC','--output',str(out),'--resume']
            with patch('fetch_linkedin_requests.LinkedInSession',return_value=session),patch('sys.argv',argv):fetch_main()
            got=json.loads(out.read_text())
            self.assertEqual(got['queryStartedAt'],{'HSBC::CN':START})
            self.assertEqual(got['jobs'][0]['jobspyFetchedAt'],PAGE_TIME)
            self.assertTrue(got['statusSummary']['HSBC::CN'].startswith('partial@resumed-end'))


if __name__=='__main__':unittest.main()
