import json, tempfile, unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
from job_liveness import apply_observation, classify, in_scope, select_candidates
from apply_liveness import main as apply_main
class LivenessTests(unittest.TestCase):
    def row(self, **kw): return {"sourceJobId":"li-123456789","company":"Small Co","companyCanonical":"small co","location":"CN","jobStatus":"active",**kw}
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
    def test_two_misses_need_twelve_hours(self):
        row=self.row(); apply_observation(row,'gone','2026-10-01T00:00:00+00:00'); self.assertEqual(row['jobStatus'],'active'); apply_observation(row,'gone','2026-10-01T11:59:00+00:00'); self.assertEqual(row['jobStatus'],'active'); apply_observation(row,'gone','2026-10-01T12:00:00+00:00'); self.assertEqual(row['expiredReason'],'linkedin_removed')
    def test_open_clears_pending_and_reactivates(self):
        row=self.row(jobStatus='expired',expiredReason='linkedin_not_accepting',expiredAt='2026-09-01T00:00:00+00:00',liveFirstMissAt='2026-09-01T00:00:00+00:00'); apply_observation(row,'open','2026-10-01T00:00:00+00:00'); self.assertEqual(row['jobStatus'],'active'); self.assertNotIn('expiredReason',row); self.assertEqual(row['liveMissCount'],0)
    def test_idempotent_and_candidate_priority(self):
        row=self.row(); apply_observation(row,'gone','2026-10-01T00:00:00+00:00'); snapshot=dict(row); apply_observation(row,'gone','2026-10-01T00:00:00+00:00'); self.assertEqual(row,snapshot); picked=select_candidates([self.row(liveFirstMissAt='2026-09-01T00:00:00+00:00',liveCheckedAt='2026-09-01T00:00:00+00:00'),self.row(sourceJobId='li-123456790')],now='2026-10-01T00:00:00+00:00',max_probes=1); self.assertEqual(picked[0]['sourceJobId'],'li-123456789')
if __name__=='__main__': unittest.main()
