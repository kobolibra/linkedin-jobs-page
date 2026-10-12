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

    def test_partial_and_untrusted_zero_warn(self):
        critical,issues=alerts({'queries':{'HSBC::CN':'partial@cap: 20 jobs','Citi::CN':'no-results-untrusted'}})
        self.assertFalse(critical);self.assertTrue(issues)

    def test_failed_details_warn_without_marking_jobs_gone(self):
        self.assertTrue(alerts({'details':{'attempted':3,'ok':0}})[1])

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

    def test_workflow_failure_and_absent_reports_are_not_healthy(self):
        self.assertTrue(alerts({'task':'jobs','queries':{}})[0])
        self.assertTrue(alerts({'workflowStatus':'failure'})[0])


if __name__=='__main__':unittest.main()
