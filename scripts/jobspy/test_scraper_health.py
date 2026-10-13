import unittest
import tempfile
import json
from pathlib import Path
from types import SimpleNamespace
from scraper_health import alerts,cooldowns,merge_history,collect


class HealthTests(unittest.TestCase):
    def test_all_failed_is_critical_but_zero_new_ok_is_not(self):
        self.assertTrue(alerts({'queries':{'HSBC::CN':'failed@start=0: HTTP 429'}})[0])
        self.assertFalse(alerts({'queries':{'HSBC::CN':'ok: 10 jobs'}})[0])

    def test_all_partial_and_untrusted_queries_are_critical(self):
        critical,issues=alerts({'queries':{'HSBC::CN':'partial@cap: 20 jobs','Citi::CN':'no-results-untrusted'}})
        self.assertTrue(critical);self.assertTrue(issues)

    def test_failed_details_warn_without_marking_jobs_gone(self):
        self.assertTrue(alerts({'details':{'attempted':3,'ok':0}})[1])

    def test_all_blocked_details_are_not_reported_as_a_successful_pipeline(self):
        self.assertTrue(alerts({'task':'jobs','queries':{'HSBC::CN':'ok: 10 jobs'},'details':{'attempted':3,'blocked':3,'ok':0}})[0])

    def test_replaying_same_run_does_not_inflate_streak(self):
        r={'runId':'1','observedAt':'2026-10-12T00:00:00Z','queries':{'A':'failed'}}
        a=merge_history({},r);b=merge_history(a,r)
        self.assertEqual(len(b['runs']),1);self.assertEqual(b['queryFailureStreaks']['A'],1)

    def test_new_success_resets_streak(self):
        a=merge_history({},{'runId':'1','observedAt':'2026-10-12T00:00:00Z','queries':{'A':'failed'}})
        b=merge_history(a,{'runId':'2','observedAt':'2026-10-12T01:00:00Z','queries':{'A':'ok: 3 jobs'}})
        self.assertEqual(b['queryFailureStreaks']['A'],0)

    def test_stale_report_does_not_shorten_cooldown_or_restore_leases(self):
        result=cooldowns({'linkedin.com':{'stopUntil':500,'leases':{'x':600}}},{'linkedin.com':{'stopUntil':200}},now=100)
        self.assertEqual(result['linkedin.com']['stopUntil'],500);self.assertNotIn('leases',result['linkedin.com'])

    def test_expired_cooldowns_are_removed(self):
        self.assertEqual(cooldowns({'linkedin.com':{'stopUntil':99}},now=100),{})

    def test_pacing_survives_expired_cooldown_without_persisting_leases(self):
        state={'linkedin.com':{'cooldownUntil':99,'paceUntil':200,'minInterval':16,'leases':{'live':300}}}
        result=cooldowns(state,now=100)
        self.assertEqual(result['linkedin.com']['minInterval'],8)
        self.assertEqual(result['linkedin.com']['paceUntil'],200)
        self.assertNotIn('leases',result['linkedin.com'])
        self.assertEqual(cooldowns(state,now=201),{})

    def test_new_recovered_pacing_supersedes_legacy_slow_state(self):
        old={'linkedin.com':{'cooldownUntil':150,'paceUntil':900,'minInterval':30}}
        recovered={'linkedin.com':{'cooldownUntil':120,'paceUntil':500,'minInterval':2.5,'pacingUpdatedAt':105}}
        for states in ((old,recovered),(recovered,old)):
            slot=cooldowns(*states,now=110)['linkedin.com']
            self.assertEqual(slot['minInterval'],2.5)
            self.assertEqual(slot['paceUntil'],500)
            self.assertEqual(slot['cooldownUntil'],150)
            self.assertEqual(slot['pacingUpdatedAt'],105)

    def test_stale_report_cannot_override_newer_pacing(self):
        stale={'linkedin.com':{'paceUntil':900,'minInterval':8,'pacingUpdatedAt':101}}
        new={'linkedin.com':{'paceUntil':500,'minInterval':4,'pacingUpdatedAt':105}}
        for states in ((stale,new),(new,stale)):
            self.assertEqual(cooldowns(*states,now=110)['linkedin.com']['minInterval'],4)

    def test_new_expired_pacing_does_not_resurrect_older_active_pacing(self):
        old={'linkedin.com':{'paceUntil':900,'minInterval':30}}
        new={'linkedin.com':{'paceUntil':105,'minInterval':2.5,'pacingUpdatedAt':106}}
        self.assertEqual(cooldowns(old,new,now=110),{})

    def test_collect_reports_real_attempts_and_guest_parsing(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)
            events=[{'stage':'details','status':429,'attempt':1,'outcome':'rate_limited'},
                    {'stage':'details','status':200,'attempt':2,'outcome':'response'},
                    {'stage':'details','outcome':'parsed','endpoint':'guest'}]
            (p/'events').write_text('\n'.join(json.dumps(x) for x in events))
            (p/'details').write_text(json.dumps({'health':{'attempted':1,'ok':1}}))
            args=SimpleNamespace(events=str(p/'events'),state=str(p/'absent'),task='jobs',workflow_status='success',search_dir=None,details=str(p/'details'),liveness=None)
            report=collect(args)
            self.assertEqual(report['requests'],2);self.assertEqual(report['retries'],1)
            self.assertEqual(report['detailEndpoints'],{'guest':1})
            self.assertEqual(report['details']['ok'],1)

    def test_capture_marks_all_failed_search_as_failed_even_when_job_status_is_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);search=p/'search';search.mkdir()
            (search/'bank.json').write_text(json.dumps({'statusSummary':{'Bank::CN':'failed@start=10: unrecognised or incomplete search markup'}}))
            args=SimpleNamespace(events=str(p/'events'),state=str(p/'absent'),task='jobs',workflow_status='success',search_dir=str(search),details=None,liveness=None)
            self.assertEqual(collect(args)['workflowStatus'],'failure')
            (search/'bank.json').write_text(json.dumps({'statusSummary':{'Bank::CN':'ok: 5 jobs'}}))
            self.assertEqual(collect(args)['workflowStatus'],'success')

    def test_workflow_failure_and_absent_reports_are_not_healthy(self):
        self.assertTrue(alerts({'task':'jobs','queries':{}})[0])
        self.assertTrue(alerts({'workflowStatus':'failure'})[0])


if __name__=='__main__':unittest.main()
