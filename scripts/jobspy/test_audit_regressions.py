import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from fetch_linkedin_requests import company_match, extract_id, main as search_main, normalize_url
from fetch_details_parallel import www
from jev_preprocess import build_boilerplate_table, preprocess
from merge_n8n_incremental import merge_documents
from publish_backfill import enrich
from reconcile_full_snapshots import reconcile
from retry_jobspy_details import fetch as legacy_fetch
from scraper_health import alerts
from test_fetch_linkedin_requests import HTML
from test_linkedin_detail import ITEM, GUEST, HTML as JD_HTML
from test_linkedin_http import response
from track_jd_changes import annotate


class AuditRegressions(unittest.TestCase):
    def test_slug_id_and_foreign_suffix_host(self):
        self.assertEqual(extract_id('https://www.linkedin.com/jobs/view/title-210740045-at-company-4468639951'), '4468639951')
        for function in (www, normalize_url):
            self.assertIn('notlinkedin.com', function('https://notlinkedin.com/jobs/view/4468639951'))

    def test_employer_cannot_be_empty_or_a_partial_brand_word(self):
        self.assertFalse(company_match('', 'HSBC'))
        self.assertFalse(company_match('H', 'HSBC'))
        self.assertFalse(company_match('Citiwide Software', 'Citi'))
        self.assertTrue(company_match('Citi', 'Citi'))
        self.assertTrue(company_match('渣打环球商业服务有限公司', 'Standard Chartered'))

    def test_http_200_unknown_markup_never_completes_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'search.json'
            session = Mock()
            session.get.side_effect = [response(text=HTML), response(text='<html>Temporarily unavailable</html>')]
            with patch('fetch_linkedin_requests.LinkedInSession', return_value=session), patch('fetch_linkedin_requests.time.sleep'), patch('sys.argv', ['search', '--company', 'HSBC', '--output', str(output)]):
                self.assertEqual(search_main(), 0)
            doc = json.loads(output.read_text())
            self.assertEqual(len(doc['jobs']), 1)
            self.assertTrue(doc['statusSummary']['HSBC::CN'].startswith('failed@'))
            self.assertTrue(alerts({'task': 'jobs', 'queries': doc['statusSummary']})[0])

    def test_blocklist_applies_to_baseline_and_same_batch_additions(self):
        result = merge_documents({'jobs': [{'sourceJobId': 'li-12345678', 'company': 'Blocked'}]}, {'blocklist': ['Blocked'], 'jobs': [{'sourceJobId': 'li-12345679', 'company': 'Blocked'}]})
        self.assertEqual(result['jobs'], [])

    def test_old_feed_cannot_reactivate_newer_snapshot_expiry(self):
        row = {'sourceJobId': 'li-12345678', 'company': 'HSBC', 'jobStatus': 'expired', 'expiredAt': '2026-10-12T12:00:00Z', 'expiredReason': 'missing_from_full_company_snapshot'}
        for incoming in ({'sourceJobId': row['sourceJobId']}, {'sourceJobId': row['sourceJobId'], 'jobStatus': 'active', 'expiredAt': '2026-09-01'}):
            result = merge_documents({'jobs': [row]}, {'generatedAt': '2026-10-12T10:00:00Z', 'jobs': [incoming]})['jobs'][0]
            self.assertEqual(result['jobStatus'], 'expired')
            self.assertEqual(result['expiredAt'], row['expiredAt'])

    def test_fresh_feed_reactivates_snapshot_but_never_liveness_expiry(self):
        for reason, expected in [('missing_from_full_company_snapshot', 'active'), ('linkedin_removed', 'expired')]:
            row = {'sourceJobId': 'li-12345678', 'jobStatus': 'expired', 'expiredAt': '2026-10-12T10:00:00Z', 'expiredReason': reason}
            result = merge_documents({'jobs': [row]}, {'generatedAt': '2026-10-12T12:00:00Z', 'jobs': [{'sourceJobId': row['sourceJobId'], 'jobStatus': 'active'}]})['jobs'][0]
            self.assertEqual(result['jobStatus'], expected)

    def test_per_row_newer_expiry_survives_delayed_snapshot(self):
        row = {'sourceJobId': 'li-12345678', 'company': 'HSBC', 'jobStatus': 'expired', 'expiredAt': '2026-10-12T12:00:00Z', 'expiredReason': 'linkedin_closed', 'title': 'New title'}
        snapshot = {'jobs': [{**row, 'title': 'Old title'}], 'statusSummary': {'HSBC': 'ok: 1 jobs'}, 'companies': {'HSBC': 'ok: 1 jobs'}}
        self.assertEqual(reconcile({'jobs': [row]}, snapshot, '2026-10-12T10:00:00Z')['jobs'][0], row)

    def test_unchanged_repost_clears_previous_revision_and_detail_error(self):
        row = {'sourceJobId': 'li-12345678', 'company': 'HSBC', 'descriptionHtml': '<p>Current JD</p>', 'jdDiffHtml': '<del>Older JD</del>', 'jdDiffPreviousText': 'Older JD', 'jdChangedAt': '2026-10-01', 'detailError': 'HTTP 429'}
        incoming = {**row, 'detailStatus': 'ok', 'jobspyRepost': True}
        incoming.pop('jdDiffHtml'); incoming.pop('jdDiffPreviousText'); incoming.pop('jdChangedAt')
        snapshot = annotate({'jobs': [row]}, {'jobs': [incoming]}, '2026-10-12T10:00:00Z')
        result = reconcile({'jobs': [row]}, snapshot, '2026-10-12T10:00:00Z')['jobs'][0]
        self.assertEqual(result['jdChangeStatus'], 'unchanged')
        self.assertNotIn('jdDiffHtml', result)
        self.assertNotIn('detailError', result)

    def test_failed_detail_preserves_previous_revision(self):
        row = {'sourceJobId': 'li-12345678', 'descriptionHtml': 'Old JD'}
        result = annotate({'jobs': [row]}, {'jobs': [{**row, 'jobspyRepost': True, 'detailStatus': 'blocked'}]})
        self.assertEqual(result['jdChangeSummary']['skipped'], 1)
        self.assertNotIn('jdChangeStatus', result['jobs'][0])

    def test_legacy_retry_uses_guest_identity_checks(self):
        session = Mock(); session.get.return_value = response(text=JD_HTML, url=GUEST)
        item = dict(ITEM)
        legacy_fetch(session, item, 15, 3)
        self.assertEqual(item['status'], 'ok')
        self.assertEqual(item['detailEndpoint'], 'guest')
        session.get.assert_called_once()

    def test_one_repetitive_jd_does_not_manufacture_company_boilerplate(self):
        phrase = 'Provide thoughtful advice to clients and execute their orders.'
        table = build_boilerplate_table([('ACME', '\n'.join([phrase] * 20)), ('ACME', phrase)])
        self.assertEqual(table['ACME']['signatures'], {})
        self.assertIn(phrase, preprocess('Adviser', 'ACME', phrase, boilerplate=table)['jd_text'])

    def test_truncation_is_explicit_and_evidence_matches_visible_text(self):
        result = preprocess('Engineer', 'ACME', '\n'.join('Build unique reliable platform number %s for stakeholder reporting.' % i for i in range(1000)))
        self.assertEqual(len(result['jd_text']), 24000)
        self.assertIn('truncated', result['evidence_flags'])

    def test_historical_enrichment_preserves_live_status_dates_salary_and_new_jd(self):
        row = {'sourceJobId': 'li-12345678', 'jobStatus': 'expired', 'expiredAt': '2026-10-12', 'pushTime': '2026-10-01', 'firstSeen': '2026-09-01', 'salary': '20k', 'descriptionHtml': 'New JD'}
        result = enrich({'jobs': [row]}, [{**row, 'jobStatus': 'active', 'descriptionHtml': 'Old JD', 'pushTime': '2026-01-01', 'city': 'Shanghai'}])['jobs'][0]
        for field in row:
            self.assertEqual(result[field], row[field])
        self.assertEqual(result['city'], 'Shanghai')
        self.assertEqual(enrich({'jobs': []}, [{'sourceJobId': 'li-12345678', 'company': 'Blocked'}], {'blocked'})['jobs'], [])


if __name__ == '__main__':
    unittest.main()
