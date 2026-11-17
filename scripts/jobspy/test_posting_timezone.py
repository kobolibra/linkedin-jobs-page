"""Timezone evidence must not rewrite legacy observations or manufacture reposts."""
import unittest

from fetch_linkedin_requests import parse_search
from posting_dates import linkedin_card_date, is_repost
from job_liveness import apply_observation
from posting_evidence import detail_posting_raw
from reconcile_full_snapshots import reconcile
from update_jobspy_history import enrich_history


def card(datetime_value, label):
    return (
        '<div class="base-search-card">'
        '<a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/4489793926">Role</a>'
        '<h4 class="base-search-card__subtitle"><a>JPMorganChase</a></h4>'
        '<h3 class="base-search-card__title">AI Product Manager</h3>'
        '<span class="job-search-card__location">Shanghai, China</span>'
        '<time class="job-search-card__listdate--new" datetime="' + datetime_value + '">' + label + '</time>'
        '</div>'
    )


class LinkedInPostingDayTests(unittest.TestCase):
    def test_absolute_timezone_and_cross_midnight(self):
        self.assertEqual(linkedin_card_date('2026-11-16T15:59:59Z', '', '2026-11-17T00:00:00Z'),
                         ('2026-11-16', 'zoned-timestamp'))
        self.assertEqual(linkedin_card_date('2026-11-16T16:00:00Z', '', '2026-11-17T00:00:00Z'),
                         ('2026-11-17', 'zoned-timestamp'))
        self.assertEqual(linkedin_card_date('2026-11-16T18:30:00+01:00', '', '2026-11-17T00:00:00Z'),
                         ('2026-11-17', 'zoned-timestamp'))

    def test_date_only_uses_existing_card_age_without_extra_requests(self):
        observed = '2026-11-17T04:46:00Z'  # Beijing 12:46
        self.assertEqual(linkedin_card_date('2026-11-16', '11 hours ago', observed),
                         ('2026-11-17', 'relative-local-day'))
        self.assertEqual(linkedin_card_date('2026-11-16', '11 hours ago', '2026-11-17T03:24:00Z'),
                         ('2026-11-16', 'source-date-only'))
        self.assertEqual(linkedin_card_date('2026-11-16', 'yesterday', observed),
                         ('2026-11-16', 'source-date-only'))
        self.assertEqual(linkedin_card_date('2026-11-16', '', observed),
                         ('2026-11-16', 'source-date-only'))
        self.assertEqual(linkedin_card_date('2026-11-16T16:40:00', '', observed),
                         ('2026-11-16', 'source-date-only'))

    def test_parser_preserves_original_values(self):
        jobs = parse_search(card('2026-11-16', '11 hours ago'), 'JPMorgan Chase', '2026-11-17T04:46:00Z')
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]['datePosted'], '2026-11-17')
        self.assertEqual(jobs[0]['linkedinPostedRaw'], '2026-11-16')
        self.assertEqual(jobs[0]['linkedinPostedRelative'], '11 hours ago')
        self.assertEqual(jobs[0]['linkedinPostedDateSource'], 'relative-local-day')

    def test_existing_canonical_record_never_becomes_false_repost(self):
        old = {'sourceJobId': 'li-4489793926', 'company': 'JPMorganChase', 'location': 'CN',
               'title': 'AI Product Manager', 'firstSeen': '2026-11-16',
               'pushTime': '2026-11-16T21:59:16Z', 'datePosted': '2026-11-16',
               'postingLastDate': '2026-11-16', 'jobspyLastPosted': '2026-11-16'}
        fresh = {'sourceJobId': old['sourceJobId'], 'company': old['company'], 'location': 'CN',
                 'title': old['title'], 'datePosted': '2026-11-17',
                 'linkedinPostedRaw': '2026-11-16', 'linkedinPostedRelative': '11 hours ago',
                 'linkedinPostedDateSource': 'relative-local-day',
                 'jobspyFetchedAt': '2026-11-17T05:00:00Z'}
        self.assertFalse(is_repost(old, fresh['datePosted'], '2026-11-17T05:10:00Z',
                                   source_raw=fresh['linkedinPostedRaw']))
        doc = reconcile({'jobs': [old]}, {'jobs': [fresh], 'scopeLocations': ['CN']},
                        '2026-11-17T05:10:00Z')
        row = doc['jobs'][0]
        for field in ('pushTime', 'firstSeen', 'datePosted', 'postingLastDate', 'jobspyLastPosted'):
            self.assertEqual(row[field], old[field], field)
        self.assertFalse(row['jobspyRepost'])

    def test_new_job_gets_local_posting_day_while_history_stays_immutable(self):
        fresh = {'sourceJobId': 'li-4489793926', 'company': 'JPMorganChase', 'location': 'CN',
                 'title': 'AI Product Manager', 'datePosted': '2026-11-17',
                 'linkedinPostedRaw': '2026-11-16', 'jobspyFetchedAt': '2026-11-17T05:00:00Z'}
        snapshot, history = enrich_history({'jobs': [fresh]}, {}, '2026-11-17T05:10:00Z')
        self.assertEqual(history['4489793926']['firstSeen'], '2026-11-17')
        self.assertEqual(history['4489793926']['linkedinPostedRaw'], '2026-11-16')
        doc = reconcile({'jobs': []}, {'jobs': snapshot['jobs'], 'scopeLocations': ['CN']},
                        '2026-11-17T05:10:00Z')
        row = doc['jobs'][0]
        self.assertEqual(row['postingLastDate'], '2026-11-17')
        self.assertEqual(row['firstSeen'], '2026-11-17')
        self.assertEqual(row['pushTime'], '2026-11-17T05:10:00Z')
        self.assertNotIn('lastRepostedAt', row)

    def test_precise_source_timestamp_advancement_is_not_suppressed(self):
        old = {'postingLastDate': '2026-11-16',
               'linkedinPostedRaw': '2026-11-16T15:59:00Z'}
        self.assertTrue(is_repost(old, '2026-11-17',
                                  '2026-11-17T05:00:00Z',
                                  source_raw='2026-11-16T16:20:00Z'))
        self.assertFalse(is_repost(old, '2026-11-17',
                                   '2026-11-17T05:00:00Z',
                                   source_raw='2026-11-16T15:59:00Z'))

    def test_legacy_rss_only_first_seen_is_not_a_false_repost(self):
        old = {'firstSeen': '2026-11-16', 'pushTime': '2026-11-16T21:59:16Z'}
        self.assertFalse(is_repost(old, '2026-11-17',
                                   '2026-11-17T05:00:00Z',
                                   source_raw='2026-11-16'))


    def test_history_first_day_never_moves_when_hour_label_ages_out(self):
        key = '4489793926'
        initial = {'sourceJobId': f'li-{key}', 'datePosted': '2026-11-17',
                   'linkedinPostedRaw': '2026-11-16',
                   'linkedinPostedDateSource': 'relative-local-day'}
        _, history = enrich_history({'jobs': [initial]}, {}, '2026-11-17T05:00:00Z')
        self.assertEqual(history[key]['firstSeen'], '2026-11-17')
        # The same unchanged LinkedIn source day later shows "1 day ago".
        later = {**initial, 'datePosted': '2026-11-16',
                 'linkedinPostedDateSource': 'source-date-only'}
        snapshot, history = enrich_history({'jobs': [later]}, history, '2026-11-18T05:00:00Z')
        self.assertEqual(history[key]['firstSeen'], '2026-11-17')
        self.assertEqual(snapshot['jobs'][0]['jobspyFirstSeen'], '2026-11-17')
        self.assertEqual(history[key]['lastPosted'], '2026-11-17')
        self.assertFalse(snapshot['jobs'][0]['jobspyRepost'])

    def test_legacy_liveness_relative_day_cannot_manufacture_repost(self):
        old = {'firstSeen': '2026-11-16', 'datePosted': '2026-11-16',
               'postingLastDate': '2026-11-16',
               'linkedinPostedRaw': '2026-11-16',
               'pushTime': '2026-11-16T21:59:16Z', 'jobStatus': 'active'}
        row = old.copy()
        apply_observation(row, 'open', '2026-11-17T05:10:00Z',
                          date_posted='2026-11-17',
                          date_source='linkedin-detail-relative-day')
        for field in ('firstSeen', 'datePosted', 'postingLastDate', 'pushTime'):
            self.assertEqual(row[field], old[field], field)
        self.assertEqual(row['liveStatus'], 'open')
        self.assertNotIn('lastRepostedAt', row)
        # Retried open probes on the same source date do not produce a repost.
        apply_observation(row, 'open', '2026-11-17T06:10:00Z',
                          date_posted='2026-11-17',
                          date_source='linkedin-cached-card')
        self.assertEqual(row['pushTime'], old['pushTime'])

    def test_exact_source_advance_still_reposts_and_liveness_can_reactivate(self):
        original = {'firstSeen': '2026-11-16', 'datePosted': '2026-11-16',
                    'postingLastDate': '2026-11-16',
                    'linkedinPostedRaw': '2026-11-16', 'pushTime': '2026-11-16T11:00:00Z',
                    'jobStatus': 'expired', 'expiredReason': 'linkedin_removed',
                    'expiredAt': '2026-11-17T01:00:00Z'}
        row = original.copy()
        apply_observation(row, 'open', '2026-11-18T05:10:00Z',
                          date_posted='2026-11-18',
                          date_source='linkedin-detail-datetime',
                          date_raw='2026-11-17T18:00:00Z')
        self.assertEqual(row['firstSeen'], original['firstSeen'])
        self.assertEqual(row['postingLastDate'], '2026-11-18')
        self.assertEqual(row['pushTime'], '2026-11-18')
        self.assertEqual(row['jobStatus'], 'active')
        self.assertNotIn('expiredAt', row)

    def test_relative_age_two_days_ahead_can_prove_genuine_repost(self):
        row = {'firstSeen': '2026-11-16', 'datePosted': '2026-11-16',
               'postingLastDate': '2026-11-16',
               'linkedinPostedRaw': '2026-11-16', 'pushTime': '2026-11-16T10:00:00Z'}
        apply_observation(row, 'open', '2026-11-18T07:00:00Z',
                          date_posted='2026-11-18',
                          date_source='linkedin-detail-relative-day')
        self.assertEqual(row['postingLastDate'], '2026-11-18')
        self.assertEqual(row['pushTime'], '2026-11-18')

    def test_detail_raw_date_must_belong_to_exact_job_id(self):
        snippet = (
            '<link rel="canonical" href="https://www.linkedin.com/jobs/view/4489793926">'
            '<span class="posted-time-ago__text"><time datetime="2026-11-17T18:00:00Z">'
            '11 hours ago</time></span>'
            '<div class="aside-job-card"><a href="https://www.linkedin.com/jobs/view/991111111">'
            'Other</a><time datetime="2026-11-21T00:00:00Z"></time></div>'
        )
        self.assertEqual(detail_posting_raw(snippet, '4489793926',
                          'linkedin-detail-datetime'), '2026-11-17T18:00:00Z')
        self.assertIsNone(detail_posting_raw(snippet, '991111111',
                          'linkedin-detail-datetime'))
        self.assertIsNone(detail_posting_raw(snippet, '4489793926',
                          'linkedin-detail-relative-day'))

    def test_new_raw_source_day_can_advance_real_repost_once(self):
        old = {'sourceJobId': 'li-4489793926', 'company': 'JPMorganChase',
               'location': 'CN', 'title': 'AI Product Manager',
               'datePosted': '2026-11-17', 'postingLastDate': '2026-11-17',
               'linkedinPostedRaw': '2026-11-16', 'firstSeen': '2026-11-17',
               'pushTime': '2026-11-17T05:10:00Z'}
        fresh = {'sourceJobId': old['sourceJobId'], 'company': old['company'],
                 'location': 'CN', 'title': old['title'],
                 'datePosted': '2026-11-18', 'linkedinPostedRaw': '2026-11-17',
                 'jobspyFetchedAt': '2026-11-18T05:00:00Z'}
        row = reconcile({'jobs': [old]}, {'jobs': [fresh], 'scopeLocations': ['CN']},
                        '2026-11-18T05:10:00Z')['jobs'][0]
        self.assertTrue(row['jobspyRepost'])
        self.assertEqual(row['postingLastDate'], '2026-11-18')
        self.assertEqual(row['pushTime'], '2026-11-18')
        self.assertEqual(row['firstSeen'], '2026-11-17')


if __name__ == '__main__':
    unittest.main()
