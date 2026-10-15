import json, tempfile, unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch
import apply_liveness
from job_liveness import apply_observation, classify, in_scope, select_candidates
from apply_liveness import main as apply_main
class LivenessTests(unittest.TestCase):
    def row(self, **kw): return {"sourceJobId":"li-123456789","company":"Small Co","companyCanonical":"small co","location":"CN","jobStatus":"active",**kw}
    def test_expired_jobs_are_not_periodically_rechecked_before_retention(self):
        now=datetime(2026,10,6,12,tzinfo=timezone.utc)
        for days in (1,3,5,10,14,14.999):
            for pending in (False,True):
                item=self.row(jobStatus='expired',expiredReason='linkedin_closed',expiredAt=(now-timedelta(days=days)).isoformat(),liveCheckedAt=(now-timedelta(hours=73)).isoformat())
                if pending:item['liveFirstMissAt']=(now-timedelta(days=20)).isoformat()
                self.assertEqual(select_candidates([item],now=now),[])

    def test_expired_final_recheck_at_fifteen_days_has_no_thirty_day_cutoff(self):
        now=datetime(2026,10,6,12,tzinfo=timezone.utc)
        for days,expected in ((14.999,False),(15,True),(30,True),(45,True)):
            item=self.row(jobStatus='expired',expiredReason='linkedin_removed',expiredAt=(now-timedelta(days=days)).isoformat())
            self.assertEqual(bool(select_candidates([item],now=now)),expected)
            self.assertEqual(bool(select_candidates([item],now=now,recheck_expired_hours=72,recheck_expired_days=30)),expected)
        invalid=self.row(jobStatus='expired',expiredReason='linkedin_removed',expiredAt='invalid',liveCheckedAt=(now-timedelta(days=20)).isoformat())
        self.assertEqual(select_candidates([invalid],now=now),[])

    def test_active_rules_and_candidate_budget_remain_intact(self):
        now = datetime(2026, 10, 6, 12, tzinfo=timezone.utc)
        pending = self.row(sourceJobId='li-100000001', liveCheckedAt=(now-timedelta(hours=6)).isoformat(), liveFirstMissAt=(now-timedelta(hours=13)).isoformat())
        never = self.row(sourceJobId='li-100000002')
        due = self.row(sourceJobId='li-100000003', liveCheckedAt=(now-timedelta(hours=20)).isoformat())
        recent = self.row(sourceJobId='li-100000004', liveCheckedAt=(now-timedelta(hours=19)).isoformat())
        expired = self.row(sourceJobId='li-100000005', jobStatus='expired', expiredReason='linkedin_closed', expiredAt=(now-timedelta(days=5)).isoformat(), liveCheckedAt=(now-timedelta(hours=73)).isoformat())
        rows = [expired, recent, due, never, pending]
        self.assertEqual(select_candidates(rows, now=now), [pending, never, due])
        self.assertEqual(select_candidates(rows, now=now, max_probes=2), [pending, never])
        self.assertEqual(select_candidates(rows, now=now, max_probes=0), [])

    def test_confirmation_ends_pending_and_recheck_preserves_expiry(self):
        for result in ('gone', 'not_accepting', 'closed'):
            with self.subTest(result=result):
                row = self.row(liveFirstMissAt='2026-10-01T00:00:00Z')
                apply_observation(row, result, '2026-10-01T12:00:00Z')
                self.assertEqual(row['jobStatus'], 'expired')
                self.assertNotIn('liveFirstMissAt', row)
                expired_at = row['expiredAt']
                apply_observation(row, result, '2026-10-04T12:00:00Z')
                self.assertEqual(row['expiredAt'], expired_at)
                self.assertNotIn('liveFirstMissAt', row)
                apply_observation(row, 'open', '2026-10-07T12:00:00Z')
                self.assertEqual(row['jobStatus'], 'active')
                self.assertNotIn('expiredAt', row)

    def test_classification(self):
        base='<link rel="canonical" href="https://www.linkedin.com/jobs/view/123456789"><h1 class="top-card-layout__title">A</h1><div class="show-more-less-html__markup">JD</div>'
        self.assertEqual(classify(200,base+'<a data-tracking-control-name="public_jobs_apply-link-onsite">Apply</a>','123456789'),'open')
        self.assertEqual(classify(200,base+'<button data-tracking-control-name="public_jobs_apply-link-offsite_contextual-sign-in-modal">Apply</button>','123456789'),'open')
        self.assertEqual(classify(200,base+'<figure class="closed-job">No longer accepting applications</figure>','123456789'),'closed')
        self.assertEqual(classify(200,base,'123456789'),'not_accepting')
        self.assertEqual(classify(404,'','123456789'),'gone')
        self.assertEqual(classify(200,'captcha input[name=session_key]','123456789'),'unknown')
    def test_regional_canonical_is_trusted_but_foreign_same_id_is_unknown(self):
        base='<link rel="canonical" href="https://cn.linkedin.com/jobs/view/123456789"><h1 class="top-card-layout__title">A</h1><div class="show-more-less-html__markup">JD</div><a data-tracking-control-name="public_jobs_apply-link-onsite">Apply</a>'
        self.assertEqual(classify(200,base,'123456789'),'open')
        self.assertEqual(classify(200,base.replace('cn.linkedin.com','notlinkedin.com'),'123456789'),'unknown')

    def test_scope_and_covered(self):
        self.assertTrue(in_scope(self.row()))
        self.assertFalse(in_scope(self.row(companyCanonical='hsbc')))
        self.assertFalse(in_scope(self.row(location='HK')))
        self.assertTrue(in_scope(self.row(jobStatus='expired',expiredReason='linkedin_closed')))
        self.assertFalse(in_scope(self.row(jobStatus='expired',expiredReason='missing_from_full_company_snapshot')))
    def test_closed_immediate_and_unknown_no_state_change(self):
        row=self.row(); apply_observation(row,'closed','2026-10-01T00:00:00+00:00'); self.assertEqual(row['jobStatus'],'expired'); self.assertEqual(row['expiredReason'],'linkedin_closed')
        old=dict(row); apply_observation(row,'unknown','2026-09-30T00:00:00+00:00'); self.assertEqual(row,old)
        apply_observation(row,'closed','2026-10-02T00:00:00+00:00'); self.assertEqual(row['expiredAt'],'2026-10-01T00:00:00+00:00')
    def test_two_misses_need_twelve_hours(self):
        row=self.row(); apply_observation(row,'gone','2026-10-01T00:00:00+00:00'); self.assertEqual(row['jobStatus'],'active'); apply_observation(row,'gone','2026-10-01T11:59:00+00:00'); self.assertEqual(row['jobStatus'],'active'); apply_observation(row,'gone','2026-10-01T12:00:00+00:00'); self.assertEqual(row['expiredReason'],'linkedin_removed')
    def test_open_clears_pending_and_reactivates(self):
        row=self.row(jobStatus='expired',expiredReason='linkedin_not_accepting',expiredAt='2026-09-01T00:00:00+00:00',liveFirstMissAt='2026-09-01T00:00:00+00:00'); apply_observation(row,'open','2026-10-01T00:00:00+00:00'); self.assertEqual(row['jobStatus'],'active'); self.assertNotIn('expiredReason',row); self.assertEqual(row['liveMissCount'],0)

    def test_legacy_scope_deletes_only_cn_after_fifteen_days_and_final_check(self):
        now=datetime.now(timezone.utc)
        old=(now-timedelta(days=16)).isoformat(); recent=(now-timedelta(days=14)).isoformat()
        doc={"jobs":[
            self.row(sourceJobId='li-100000001',jobStatus='expired',expiredAt=old,expiredReason='linkedin_closed'),
            self.row(sourceJobId='li-100000002',jobStatus='expired',expiredAt=recent,expiredReason='linkedin_closed'),
            self.row(sourceJobId='li-100000003',location='HK',jobStatus='expired',expiredAt=old,expiredReason='linkedin_closed'),
            self.row(sourceJobId='li-100000004',company='HSBC',companyCanonical='hsbc',jobStatus='expired',expiredAt=old,expiredReason='linkedin_closed'),
        ]}
        live={"schemaVersion":"1.0","mode":"cn-job-liveness","observedAt":now.isoformat(),"observations":[{"jobId":"100000001","result":"closed","checkedAt":now.isoformat()}]}
        with tempfile.TemporaryDirectory() as d:
            jobs=Path(d)/'jobs.json'; obs=Path(d)/'live.json'; out=Path(d)/'out.json'
            jobs.write_text(json.dumps(doc)); obs.write_text(json.dumps(live))
            import sys
            old_argv=sys.argv; sys.argv=['apply_liveness.py','--jobs',str(jobs),'--liveness',str(obs),'--output',str(out)]
            try: apply_main()
            finally: sys.argv=old_argv
            result=json.loads(out.read_text())
        ids={x['sourceJobId'] for x in result['jobs']}
        self.assertNotIn('li-100000001',ids); self.assertIn('li-100000002',ids); self.assertIn('li-100000003',ids); self.assertIn('li-100000004',ids)
        self.assertEqual(result['liveness']['deleted_after_days'],1)
    def test_idempotent_and_candidate_priority(self):
        row=self.row(); apply_observation(row,'gone','2026-10-01T00:00:00+00:00'); snapshot=dict(row); apply_observation(row,'gone','2026-10-01T00:00:00+00:00'); self.assertEqual(row,snapshot); picked=select_candidates([self.row(liveFirstMissAt='2026-09-01T00:00:00+00:00',liveCheckedAt='2026-09-01T00:00:00+00:00'),self.row(sourceJobId='li-123456790')],now='2026-10-01T00:00:00+00:00',max_probes=1); self.assertEqual(picked[0]['sourceJobId'],'li-123456789')

    def test_fifteen_day_boundary_all_regions_requires_final_check_and_protects_targets(self):
        now=datetime(2026,10,12,4,tzinfo=timezone.utc)
        class FrozenDatetime(datetime):
            @classmethod
            def now(cls,tz=None): return now
        rows=[]; expected=set(); observations=[]
        def add(keep, **kw):
            row=self.row(sourceJobId='li-'+str(100000000+len(rows)), **kw)
            rows.append(row)
            if keep: expected.add(row['sourceJobId'])
            return row
        for region in ('CN','HK','SG'):
            for seconds, keep in ((15*86400-1,True),(15*86400,False),(15*86400+1,False)):
                expired=add(keep,location=region,jobStatus='expired',expiredReason='linkedin_closed',expiredAt=(now-timedelta(seconds=seconds)).isoformat())
                observations.append({'jobId':expired['sourceJobId'].removeprefix('li-'),'result':'closed','checkedAt':now.isoformat()})
            add(True,location=region,company='HSBC',companyCanonical='hsbc',jobStatus='expired',expiredReason='linkedin_closed',expiredAt=(now-timedelta(days=20)).isoformat())
        add(True,jobStatus='active',expiredAt=(now-timedelta(days=20)).isoformat())
        add(True,jobStatus='expired',expiredReason='missing_from_full_company_snapshot',expiredAt=(now-timedelta(days=20)).isoformat())
        add(True,jobStatus='expired',expiredReason='linkedin_closed',expiredAt='invalid')
        add(True,jobStatus='expired',expiredReason='linkedin_closed')
        add(True,jobStatus='expired',expiredReason='linkedin_closed',expiredAt=(now-timedelta(days=20)).isoformat())
        unknown=add(True,jobStatus='expired',expiredReason='linkedin_closed',expiredAt=(now-timedelta(days=20)).isoformat())
        observations.append({'jobId':unknown['sourceJobId'].removeprefix('li-'),'result':'unknown','checkedAt':now.isoformat()})
        reopened=add(True,location='HK',jobStatus='expired',expiredReason='linkedin_closed',expiredAt=(now-timedelta(days=20)).isoformat())
        observations.append({'jobId':reopened['sourceJobId'].removeprefix('li-'),'result':'open','checkedAt':now.isoformat()})
        live={'schemaVersion':'1.1','mode':'job-liveness','scopeLocations':['CN','HK','SG'],'observedAt':now.isoformat(),'observations':observations}
        with tempfile.TemporaryDirectory() as d:
            jobs=Path(d)/'jobs.json'; obs=Path(d)/'live.json'; out=Path(d)/'out.json'
            jobs.write_text(json.dumps({'jobs':rows})); obs.write_text(json.dumps(live))
            with patch('sys.argv',['apply_liveness.py','--jobs',str(jobs),'--liveness',str(obs),'--output',str(out)]), patch.object(apply_liveness,'datetime',FrozenDatetime):
                apply_main()
            result=json.loads(out.read_text())
        self.assertEqual({row['sourceJobId'] for row in result['jobs']},expected)
        self.assertEqual(result['liveness']['deleted_after_days'],6)
        self.assertEqual(next(row for row in result['jobs'] if row['sourceJobId']==reopened['sourceJobId'])['jobStatus'],'active')

    def test_final_negative_check_is_once_per_expiry_and_unknown_stays_pending(self):
        now=datetime(2026,10,20,12,tzinfo=timezone.utc)
        for reason in ('linkedin_closed','linkedin_removed','linkedin_not_accepting'):
            for result in ('closed','gone','not_accepting'):
                with self.subTest(reason=reason,result=result):
                    item=self.row(jobStatus='expired',expiredReason=reason,expiredAt=(now-timedelta(days=16)).isoformat())
                    original_expiry=item['expiredAt']
                    apply_observation(item,'unknown',(now-timedelta(hours=1)).isoformat())
                    self.assertEqual(select_candidates([item],now=now),[item])
                    apply_observation(item,result,now.isoformat())
                    self.assertEqual(item['expiredAt'],original_expiry)
                    self.assertEqual(item['liveDeletionExpiryAt'],original_expiry)
                    self.assertEqual(select_candidates([item],now=now),[])
                    self.assertEqual(select_candidates([item],now=now+timedelta(days=4)),[])
                    apply_observation(item,'open',(now+timedelta(hours=1)).isoformat())
                    self.assertEqual(item['jobStatus'],'active')
                    self.assertNotIn('liveDeletionCheckedAt',item)
                    apply_observation(item,'closed',(now+timedelta(hours=2)).isoformat())
                    self.assertNotIn('liveDeletionCheckedAt',item)

    def test_old_final_check_cannot_authorize_a_different_expiry_episode(self):
        now=datetime(2026,10,20,12,tzinfo=timezone.utc)
        item=self.row(jobStatus='expired',expiredReason='linkedin_closed',expiredAt='2026-10-01T00:00:00Z',liveDeletionExpiryAt='2026-09-01T00:00:00Z',liveDeletionCheckedAt=now.isoformat())
        self.assertEqual(select_candidates([item],now=now),[item])

if __name__=='__main__': unittest.main()
