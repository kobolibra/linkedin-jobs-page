"""Timezone evidence must not rewrite legacy observations or manufacture reposts."""
import unittest

from fetch_linkedin_requests import parse_search
from posting_dates import linkedin_card_date, is_repost
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
