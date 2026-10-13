import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from company_liveness import (absence_matches, cached_identity, company_url,
    fetch_snapshot, identity_key, parse_listing, prefer_snapshot, verified_identity)
from job_liveness import apply_observation, select_candidates
from probe_job_liveness import main as probe_main
from test_linkedin_http import response
from linkedin_http import RequestStopped

NOW = '2026-10-13T08:00:00+00:00'
IDENTITY = {'companyId':'1767', 'companyUrl':'https://www.linkedin.com/company/state-street',
            'employerName':'State Street', 'sourceJobId':'123456789', 'verifiedAt':NOW, 'regions':{}}


def row(key='123456789', **extra):
    return {'sourceJobId':'li-'+key,'company':'State Street','location':'CN','title':'Analyst',
            'companyUrl':IDENTITY['companyUrl'], 'jobStatus':'active',**extra}


def card(key='123456789', day='2026-10-12', company='State Street', slug='state-street', location='Shanghai, China'):
    return f'''<div class="base-search-card" data-entity-urn="urn:li:jobPosting:{key}">
      <a class="base-card__full-link" href="https://cn.linkedin.com/jobs/view/analyst-{key}">Job</a>
      <h3 class="base-search-card__title">Analyst</h3>
      <h4 class="base-search-card__subtitle"><a href="https://uk.linkedin.com/company/{slug}">{company}</a></h4>
      <span class="job-search-card__location">{location}</span><time datetime="{day}"></time></div>'''


def view(key='123456789'):
    return f'''<link rel="canonical" href="https://cn.linkedin.com/jobs/view/analyst-{key}">
    <meta name="companyId" content="1767"><h1 class="top-card-layout__title">Analyst</h1>
    <a class="topcard__org-name-link" href="https://www.linkedin.com/company/state-street">State Street</a>
    <div class="show-more-less-html__markup">JD</div><a data-tracking-control-name="public_jobs_apply-link-onsite">Apply</a>'''


EMPTY='<!DOCTYPE html>\n<!---->'


class CompanyLivenessTests(unittest.TestCase):
    def test_identity_requires_own_job_employer_and_trusted_url(self):
        self.assertEqual(verified_identity(view(),row(),NOW),IDENTITY)
        for html in (view('999999999'),view().replace('State Street','Other'),view().replace('1767','wrong'),view().replace('cn.linkedin.com','notlinkedin.com')):
            self.assertIsNone(verified_identity(html,row(),NOW))
        self.assertIsNone(verified_identity(view(),row(companyUrl='https://www.linkedin.com/company/other'),NOW))
        self.assertEqual(company_url('https://uk.linkedin.com/company/state-street/?trk=jobs'),IDENTITY['companyUrl'])
        self.assertEqual(company_url('https://notlinkedin.com/company/state-street'),'')

    def test_cache_is_scoped_to_employer_identity_and_has_measured_cost(self):
        cache={identity_key(row()):dict(IDENTITY)}
        self.assertEqual(cached_identity(row(),cache),IDENTITY)
        self.assertIsNone(cached_identity(row(companyUrl='https://www.linkedin.com/company/other'),cache))
        self.assertFalse(prefer_snapshot([row()],IDENTITY,'CN'))
        self.assertTrue(prefer_snapshot([row(),row('123456790')],IDENTITY,'CN'))
        for cost, expected in ((2,True),(3,False)):
            record={**IDENTITY,'regions':{'CN':{'complete':True,'requests':cost}}}
            self.assertEqual(prefer_snapshot([row()],record,'CN'),expected)

    def test_exact_ids_dates_and_strict_region(self):
        jobs,trusted,count=parse_listing(card(),IDENTITY,'CN',NOW)
        self.assertTrue(trusted);self.assertEqual(count,1)
        self.assertEqual(jobs['123456789']['datePosted'],'2026-10-12')
        for html in (card(slug='other'),card(company='Another employer'),card(location='Hong Kong SAR'),card(location='Unknown'),card().replace('urn:li:jobPosting:123456789','urn:li:jobPosting:999999999')):
            self.assertFalse(parse_listing(html,IDENTITY,'CN',NOW)[1])
        self.assertFalse(parse_listing('<html>temporarily unavailable</html>',IDENTITY,'CN',NOW)[1])
        self.assertNotIn('datePosted',parse_listing(card(day='2099-01-01'),IDENTITY,'CN',NOW)[0]['123456789'])

    def test_all_selected_found_requires_one_list_and_no_full_company_scan(self):
        session=Mock(context={});session.get.return_value=response(text=card()+card('123456790'))
        snapshot=fetch_snapshot(session,IDENTITY,'CN',{'123456789','123456790'},20)
        self.assertEqual(snapshot['reason'],'all-selected-found');self.assertFalse(snapshot['complete'])
        self.assertEqual(session.get.call_count,1)
        self.assertEqual(session.get.call_args.kwargs['params'],{'f_C':'1767','location':'China','start':0})

    def test_complete_snapshot_absence_expires_immediately(self):
        session=Mock(context={});session.get.side_effect=[response(text=card()),response(text=EMPTY),response(text=EMPTY)]
        snapshot=fetch_snapshot(session,IDENTITY,'CN',{'123456789','123456790'},20)
        self.assertTrue(snapshot['complete']);self.assertEqual(snapshot['requests'],3)
        observation={'jobId':'123456790','result':'absent','location':'CN','companyQuery':'x','checkedAt':snapshot['checkedAt']}
        proof={**snapshot,'foundJobIds':list(snapshot['jobs'])}
        self.assertTrue(absence_matches(row('123456790'),observation,{'x':proof}))
        item=row('123456790');apply_observation(item,'absent',NOW)
        self.assertEqual(item['jobStatus'],'expired');self.assertEqual(item['expiredReason'],'linkedin_removed')
        self.assertNotIn('liveFirstMissAt',item)
        self.assertFalse(absence_matches(row(),{**observation,'jobId':'123456789'},{'x':proof}))
        self.assertFalse(absence_matches(row('123456790',companyUrl='https://www.linkedin.com/company/other'),observation,{'x':proof}))

    def test_partial_empty_blocked_cap_never_prove_absence(self):
        for replies in ([response(text=EMPTY),response(text=EMPTY)],
                        [response(text=card()),response(429,text='blocked')],
                        [response(text=card()),response(text='<html>unavailable</html>')],
                        [response(text=card()),RequestStopped('429 deferred',recoverable=True)]):
            session=Mock(context={});session.get.side_effect=replies
            snapshot=fetch_snapshot(session,IDENTITY,'CN',{'123456790'},20)
            self.assertFalse(snapshot['complete'])
        session=Mock(context={});session.get.return_value=response(text=card())
        snapshot=fetch_snapshot(session,IDENTITY,'CN',{'123456790'},20)
        self.assertFalse(snapshot['complete']);self.assertEqual(snapshot['reason'],'linkedin-pagination-boundary')
        self.assertEqual(snapshot['requests'],100)

    def test_conflicting_dates_never_become_repost_evidence(self):
        session=Mock(context={});session.get.side_effect=[response(text=card()),response(text=card(day='2026-10-11')),response(text=card(day='2026-10-12')),response(text=EMPTY),response(text=EMPTY)]
        snapshot=fetch_snapshot(session,IDENTITY,'CN',{'123456790'},20)
        self.assertTrue(snapshot['complete']);self.assertNotIn('datePosted',snapshot['jobs']['123456789'])

    def test_unknown_remains_due_without_starving_other_never_checked_jobs(self):
        first=row();other=row('123456790')
        apply_observation(first,'unknown',NOW)
        self.assertNotIn('liveCheckedAt',first)
        self.assertIn(first,select_candidates([first],now=NOW))
        self.assertEqual(select_candidates([first,other],now=NOW,max_probes=1),[other])

    def run_probe(self,jobs,replies,identity=None):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory);(p/'jobs').write_text(json.dumps({'jobs':jobs}))
            (p/'cache').write_text(json.dumps({'companyIdentities':{identity_key(jobs[0]):identity or IDENTITY}}))
            session=Mock(context={});session.get.side_effect=replies
            with patch('probe_job_liveness.LinkedInSession',return_value=session),patch('sys.argv',['probe','--jobs',str(p/'jobs'),'--output',str(p/'out'),'--identity-cache',str(p/'cache')]):probe_main()
            return json.loads((p/'out').read_text()),session

    def test_warm_group_gets_liveness_and_repost_without_job_pages(self):
        doc,session=self.run_probe([row(),row('123456790')],[response(text=card()+card('123456790'))])
        self.assertEqual(doc['stats']['open'],2);self.assertEqual(doc['stats']['postingDates'],2)
        self.assertEqual(session.get.call_count,1)
        self.assertTrue(all('seeMoreJobPostings' in c.args[0] for c in session.get.call_args_list))

    def test_failed_group_never_expands_into_individual_probes(self):
        doc,session=self.run_probe([row(),row('123456790')],[response(text=card()),response(429,text='blocked')])
        self.assertEqual(doc['stats']['open'],1);self.assertEqual(doc['stats']['unknown'],1)
        self.assertTrue(doc['stats']['circuitOpen']);self.assertEqual(session.get.call_count,2)

    def test_cold_group_reads_only_one_selected_job_to_cache_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory);(p/'jobs').write_text(json.dumps({'jobs':[row(),row('123456790')]}))
            session=Mock(context={});session.get.side_effect=[response(text=view()),response(text=card()+card('123456790'))]
            with patch('probe_job_liveness.LinkedInSession',return_value=session),patch('sys.argv',['probe','--jobs',str(p/'jobs'),'--output',str(p/'out')]):probe_main()
            doc=json.loads((p/'out').read_text())
            self.assertEqual(session.get.call_count,2);self.assertEqual(doc['stats']['postingDates'],2)
            self.assertEqual(doc['companyIdentities'][identity_key(row())]['companyId'],'1767')


if __name__=='__main__':unittest.main()
