import json, tempfile, unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch
import apply_liveness
from job_liveness import apply_observation, classify, in_scope, select_candidates
from apply_liveness import main as apply_main
class LivenessTests(unittest.TestCase):
    def row(self, **kw): return {"sourceJobId":"li-123456789","company":"Small Co","companyCanonical":"small co","location":"CN","jobStatus":"active",**kw}
    def test_expired_jobs_obey_72_hours_even_with_pending_marker(self):
        now = datetime(2026, 10, 6, 12, tzinfo=timezone.utc)
        for hours in (6, 21, 24, 71.999, 72, 73):
            for pending in (False, True):
                with self.subTest(hours=hours, pending=pending):
                    row = self.row(jobStatus='expired', expiredReason='linkedin_closed', expiredAt=(now-timedelta(days=5)).isoformat(), liveCheckedAt=(now-timedelta(hours=hours)).isoformat())
                    if pending:
                        row['liveFirstMissAt'] = (now-timedelta(days=6)).isoformat()
                    self.assertEqual(bool(select_candidates([row], now=now)), hours >= 72)

    def test_expired_window_and_missing_check_time(self):
        now = datetime(2026, 10, 6, 12, tzinfo=timezone.utc)
        for days, expected in ((2, False), (3, True), (30, True), (30.001, False)):
            with self.subTest(days=days):
                row = self.row(jobStatus='expired', expiredReason='linkedin_removed', expiredAt=(now-timedelta(days=days)).isoformat())
                self.assertEqual(bool(select_candidates([row], now=now)), expected)
        row = self.row(jobStatus='expired', expiredReason='linkedin_removed', expiredAt='invalid', liveCheckedAt=(now-timedelta(hours=73)).isoformat())
        self.assertEqual(select_candidates([row], now=now), [row])
        row.pop('liveCheckedAt')
        self.assertEqual(select_candidates([row], now=now), [])

    def test_active_rules_and_candidate_budget_remain_intact(self):
        now = datetime(2026, 10, 6, 12, tzinfo=timezone.utc)
        pending = self.row(sourceJobId='li-100000001', liveCheckedAt=(now-timedelta(hours=6)).isoformat(), liveFirstMissAt=(now-timedelta(hours=13)).isoformat())
        never = self.row(sourceJobId='li-100000002')
        due = self.row(sourceJobId='li-100000003', liveCheckedAt=(now-timedelta(hours=20)).isoformat())
        recent = self.row(sourceJobId='li-100000004', liveCheckedAt=(now-timedelta(hours=19)).isoformat())
        expired = self.row(sourceJobId='li-100000005', jobStatus='expired', expiredReason='linkedin_closed', expiredAt=(now-timedelta(days=5)).isoformat(), liveCheckedAt=(now-timedelta(hours=73)).isoformat())
        rows = [expired, recent, due, never, pending]
        self.assertEqual(select_candidates(rows, now=now), [pending, never, due, expired])
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

    def test_apply_liveness_deletes_only_cn_non_target_after_ten_days(self):
        now=datetime.now(timezone.utc)
        old=(now-timedelta(days=11)).isoformat(); recent=(now-timedelta(days=9)).isoformat()
        doc={"jobs":[
            self.row(sourceJobId='li-100000001',jobStatus='expired',expiredAt=old,expiredReason='linkedin_closed'),
            self.row(sourceJobId='li-100000002',jobStatus='expired',expiredAt=recent,expiredReason='linkedin_closed'),
            self.row(sourceJobId='li-100000003',location='HK',jobStatus='expired',expiredAt=old,expiredReason='linkedin_closed'),
            self.row(sourceJobId='li-100000004',company='HSBC',companyCanonical='hsbc',jobStatus='expired',expiredAt=old,expiredReason='linkedin_closed'),
        ]}
        live={"schemaVersion":"1.0","mode":"cn-job-liveness","observedAt":now.isoformat(),"observations":[]}
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

    def test_ten_day_boundary_all_regions_and_protected_records(self):
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
            for seconds, keep in ((10*86400-1,True),(10*86400,False),(10*86400+1,False)):
                add(keep,location=region,jobStatus='expired',expiredReason='linkedin_closed',expiredAt=(now-timedelta(seconds=seconds)).isoformat())
            add(True,location=region,company='HSBC',companyCanonical='hsbc',jobStatus='expired',expiredReason='linkedin_closed',expiredAt=(now-timedelta(days=20)).isoformat())
        add(True,jobStatus='active',expiredAt=(now-timedelta(days=20)).isoformat())
        add(True,jobStatus='expired',expiredReason='missing_from_full_company_snapshot',expiredAt=(now-timedelta(days=20)).isoformat())
        add(True,jobStatus='expired',expiredReason='linkedin_closed',expiredAt='invalid')
        add(True,jobStatus='expired',expiredReason='linkedin_closed')
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

if __name__=='__main__': unittest.main()
