import json
import tempfile
import unittest
from pathlib import Path
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, Mock
from posting_dates import apply_posting_date, is_repost
from posting_evidence import detail_posting_date, search_posting_date, relative_posting_bounds
from update_jobspy_history import enrich_history
from reconcile_full_snapshots import reconcile
from job_liveness import apply_observation, in_scope, select_regional_candidates
from probe_job_liveness import lookup_posting_date, remember_posting_dates, main as probe_main
from apply_liveness import main as apply_main
from merge_n8n_incremental import merge_documents

KEY = "123456789"
PAGE = '<link rel="canonical" href="https://www.linkedin.com/jobs/view/123456789"><h1 class="top-card-layout__title">A</h1><div class="show-more-less-html__markup">JD</div><a data-tracking-control-name="public_jobs_apply-link-onsite">Apply</a>'
def card(key=KEY, posted="2026-10-09"):
    return f'<div class="base-search-card"><a href="https://www.linkedin.com/jobs/view/a-{key}">A</a><time datetime="{posted}"></time></div>'
def row(region="CN", **extra):
    return {"sourceJobId": "li-"+KEY, "company": "Small Co", "location":region, "title":"Analyst", "pushTime":"2026-09-01", "firstSeen":"2026-08-01", "datePosted":"2026-09-01", **extra}

class PostingTests(unittest.TestCase):
    def test_repeated_date_does_not_reset_discovery_or_precision(self):
        item=row(pushTime="2026-10-09T08:00:00Z",datePosted="2026-10-09")
        self.assertFalse(apply_posting_date(item,"2026-10-09","2026-10-09T09:00:00Z","search"))
        self.assertEqual(item["pushTime"],"2026-10-09T08:00:00Z")

    def test_delayed_repost_all_target_regions_keeps_jd_and_first_seen(self):
        for region in ("CN","HK","SG"):
            old=row(region,descriptionHtml="<p>Keep JD</p>")
            snapshot={"scopeLocations":[region],"jobs":[row(region,datePosted="2026-10-03",jobspyRepost=False)]}
            result=reconcile({"jobs":[old]},snapshot,"2026-10-09T09:00:00Z")["jobs"][0]
            self.assertEqual(result["pushTime"],"2026-10-03")
            self.assertEqual(result["firstSeen"],"2026-08-01")
            self.assertEqual(result["descriptionHtml"],"<p>Keep JD</p>")
            self.assertTrue(result["jobspyRepost"])

    def test_repeated_target_date_is_not_repost_even_with_true_flag(self):
        old=row(datePosted="2026-10-09",jobspyLastPosted="2026-10-09",pushTime="2026-10-09T08:00:00Z")
        snapshot={"jobs":[row(datePosted="2026-10-09",jobspyRepost=True)]}
        got=reconcile({"jobs":[old]},snapshot,"2026-10-09T09:00:00Z")["jobs"][0]
        self.assertFalse(got["jobspyRepost"])
        self.assertEqual(got["pushTime"],old["pushTime"])

    def test_older_invalid_future_dates_and_later_push_never_regress(self):
        for value in ("2026-08-01","invalid","2026-10-10"):
            item=row(postingLastDate="2026-09-01")
            self.assertFalse(apply_posting_date(item,value,"2026-10-09T09:00:00Z","search"))
            self.assertEqual(item["pushTime"],"2026-09-01")
            self.assertEqual(item["postingLastDate"],"2026-09-01")
        item=row(pushTime="2026-10-09T08:00:00Z")
        self.assertTrue(is_repost(item,"2026-10-08","2026-10-09T09:00:00Z"))
        self.assertFalse(apply_posting_date(item,"2026-10-08","2026-10-09T09:00:00Z","search"))

    def test_missing_source_baseline_is_established_without_fake_repost(self):
        item={"pushTime":"2026-09-01"}
        self.assertFalse(apply_posting_date(item,"2026-10-09","2026-10-09T09:00:00Z","search"))
        self.assertEqual(item["postingLastDate"],"2026-10-09")
        self.assertEqual(item["pushTime"],"2026-09-01")

    def test_history_never_regresses_and_recovers_after_older_response(self):
        history={KEY:{"firstSeen":"2026-08-01","lastPosted":"2026-10-08"}}
        for posted, expected in (("2026-09-01",False),("2026-10-09",True),("2026-10-09",False),("2026-10-10",False)):
            doc,history=enrich_history({"jobs":[row(datePosted=posted)]},history,"2026-10-09T09:00:00Z")
            self.assertEqual(doc["jobs"][0]["jobspyRepost"],expected)
        self.assertEqual(history[KEY]["lastPosted"],"2026-10-09")

    def test_detail_own_hour_age_has_one_day_and_midnight_is_ambiguous(self):
        html=PAGE+'<span class="posted-time-ago__text">Reposted 7 hours ago</span>'+card("999999999","2026-10-09")
        self.assertEqual(detail_posting_date(html,KEY,"2026-10-09T14:00:00Z")[0],"2026-10-09")
        self.assertEqual(detail_posting_date(html,KEY,"2026-10-09T07:30:00+08:00"),(None,None))
        self.assertEqual(detail_posting_date(html.replace(KEY,"999999999"),KEY,"2026-10-09T14:00:00Z"),(None,None))

    def test_search_and_detail_share_day_policy_for_naive_and_zoned_evidence(self):
        raw = '2026-11-16T23:30:00'
        html = PAGE + '<span class="posted-time-ago__text"><time datetime="' + raw + '">Posted</time></span>'
        self.assertEqual(detail_posting_date(html, KEY, '2026-11-17T06:00:00Z')[0], '2026-11-16')
        self.assertEqual(search_posting_date(card(posted=raw), KEY), '2026-11-16')
        zoned = '2026-11-16T16:30:00Z'
        html_zoned = PAGE + '<span class="posted-time-ago__text"><time datetime="' + zoned + '">Posted</time></span>'
        self.assertEqual(detail_posting_date(html_zoned, KEY, '2026-11-17T06:00:00Z')[0], '2026-11-17')
        self.assertEqual(search_posting_date(card(posted=zoned), KEY), '2026-11-17')

    def test_search_requires_exact_id_and_rejects_conflicting_dates(self):
        self.assertIsNone(search_posting_date(card("2123456789"),KEY))
        self.assertEqual(search_posting_date(card(),KEY),"2026-10-09")
        self.assertIsNone(search_posting_date(card()+card(posted="2026-10-08"),KEY))

    def test_structured_date_requires_this_job_identifier(self):
        data={"@type":"JobPosting","identifier":{"value":KEY},"datePosted":"2026-10-08"}
        html=PAGE+'<script type="application/ld+json">'+json.dumps(data)+'</script>'
        self.assertEqual(detail_posting_date(html,KEY,"2026-10-09T14:00:00Z")[0],"2026-10-08")
        self.assertIsNone(detail_posting_date(html.replace('"value": "'+KEY+'"','"value": "999999999"'),KEY,"2026-10-09T14:00:00Z")[0])

    def test_ambiguous_age_skips_without_any_extra_request(self):
        with patch('requests.Session.request',side_effect=AssertionError('No date HTTP')):
            self.assertEqual(lookup_posting_date(row('HK'),PAGE,'2026-10-09T14:00:00Z'),(None,None))
            html=PAGE+'<span class="posted-time-ago__text">7 hours ago</span>'
            self.assertEqual(lookup_posting_date(row(),html,'2026-10-09T14:00:00Z')[0],'2026-10-09')

    def test_known_source_day_rules_out_repost_without_inventing_exact_date(self):
        html=PAGE+'<span class="posted-time-ago__text">Reposted 2 days ago</span>'
        bounds=relative_posting_bounds(html,KEY,'2026-10-09T14:00:00Z')
        self.assertEqual(tuple(x.isoformat() for x in bounds),('2026-10-06','2026-10-08'))
        known=row(postingLastDate='2026-10-08'); before=dict(known)
        self.assertEqual(lookup_posting_date(known,html,'2026-10-09T14:00:00Z'),(None,None))
        self.assertEqual(known,before)

    def test_possible_repost_uses_verified_cache_and_never_rss_discovery_as_source(self):
        html=PAGE+'<span class="posted-time-ago__text">1 day ago</span>'
        for candidate in (row(postingLastDate='2026-10-07'),row(postingLastDate='2026-10-08'),row(datePosted='2026-10-08',firstSeen='2026-10-08'),row(postingLastDate='2026-10-10')):
            self.assertIsNone(lookup_posting_date(candidate,html,'2026-10-09T14:00:00Z')[0])
            self.assertEqual(lookup_posting_date(candidate,html,'2026-10-09T14:00:00Z',cache={KEY:'2026-10-08'})[0],'2026-10-08')

    def test_rounding_near_midnight_cannot_manufacture_an_exact_day(self):
        html=PAGE+'<span class="posted-time-ago__text">8 hours ago</span>'
        self.assertEqual(detail_posting_date(html,KEY,'2026-10-09T07:30:00+08:00'),(None,None))

    def test_only_exact_id_cached_cards_are_usable(self):
        cache={}; stats={}; conflicts=set()
        remember_posting_dates(cache,conflicts,card()+card('999999999','2026-10-08'),'2026-10-09T14:00:00Z')
        self.assertEqual(lookup_posting_date(row(),PAGE,'2026-10-09T14:00:00Z',cache=cache,stats=stats)[0],'2026-10-09')
        other=row(sourceJobId='li-999999999')
        self.assertEqual(lookup_posting_date(other,PAGE.replace(KEY,'999999999'),'2026-10-09T14:00:00Z',cache=cache,stats=stats)[0],'2026-10-08')
        self.assertEqual(stats['postingDateCacheHits'],2)
        self.assertIsNone(lookup_posting_date(row(sourceJobId='li-888888888'),PAGE.replace(KEY,'888888888'),'2026-10-09T14:00:00Z',cache=cache)[0])

    def test_cached_date_cannot_hide_a_newer_repost_age_or_invent_future_date(self):
        html=PAGE+'<span class="posted-time-ago__text">1 day ago</span>'
        for day in ('2026-09-01','2026-10-10','invalid'):
            self.assertIsNone(lookup_posting_date(row(),html,'2026-10-09T14:00:00Z',cache={KEY:day})[0])
        future=PAGE+'<span class="posted-time-ago__text" datetime="2026-10-10">Tomorrow</span>'
        self.assertIsNone(lookup_posting_date(row(),future,'2026-10-09T14:00:00Z')[0])

    def test_conflicting_foreign_and_future_cards_are_never_reused(self):
        cache={}; conflicts=set()
        remember_posting_dates(cache,conflicts,card(),'2026-10-09T14:00:00Z')
        remember_posting_dates(cache,conflicts,card(posted='2026-10-08'),'2026-10-09T14:00:00Z')
        remember_posting_dates(cache,conflicts,card(),'2026-10-09T14:00:00Z')
        self.assertNotIn(KEY,cache); self.assertIn(KEY,conflicts)
        for html in (card().replace('www.linkedin.com','notlinkedin.com'),card(posted='2026-10-10'),card()+card(posted='2026-10-08')):
            cache={}
            remember_posting_dates(cache,set(),html,'2026-10-09T14:00:00Z')
            self.assertNotIn(KEY,cache)

    def test_non_target_all_regions_repost_and_reactivation_preserve_first_seen(self):
        for region in ("CN","HK","SG"):
            item=row(region,jobStatus="expired",expiredReason="linkedin_closed",expiredAt="2026-10-01")
            apply_observation(item,"open","2026-10-09T14:00:00Z",date_posted="2026-10-08")
            self.assertEqual(item["pushTime"],"2026-10-08")
            self.assertEqual(item["firstSeen"],"2026-08-01")
            self.assertEqual(item["jobStatus"],"active")

    def test_old_probe_replay_and_unknown_never_reset_posting_dates(self):
        item=row(); apply_observation(item,"open","2026-10-09T14:00:00Z",date_posted="2026-10-09")
        previous=dict(item)
        apply_observation(item,"open","2026-10-09T13:00:00Z",date_posted="2026-10-08")
        self.assertEqual(item,previous)
        apply_observation(item,"unknown","2026-10-09T15:00:00Z",date_posted="2026-10-10")
        self.assertEqual(item["pushTime"],previous["pushTime"])

    def test_newer_verified_presence_blocks_old_negative_result(self):
        for result in ("closed","gone","not_accepting"):
            item=row(liveVerifiedAt="2026-10-09T14:00:00Z")
            previous=dict(item); apply_observation(item,result,"2026-10-09T13:00:00Z")
            self.assertEqual(item,previous)

    def test_rss_cannot_hide_a_repost_or_overwrite_source_watermarks(self):
        old=row(postingLastDate="2026-09-01")
        merged=merge_documents({"jobs":[old]},{"jobs":[row(datePosted="2026-10-09",postingLastDate="2026-10-09")],"generatedAt":"2026-10-09T14:00:00Z"})['jobs'][0]
        self.assertEqual(merged['datePosted'],'2026-09-01')
        self.assertEqual(merged['postingLastDate'],'2026-09-01')
        apply_observation(merged,'open','2026-10-09T14:01:00Z',date_posted='2026-10-09')
        self.assertEqual(merged['pushTime'],'2026-10-09')

    def test_regional_selector_guard_is_not_diluted_by_other_regions(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)
            jobs=[row('CN',title='',sourceJobId='li-'+str(600000000+i)) for i in range(20)]
            jobs += [row('HK',title='',sourceJobId='li-'+str(700000000+i)) for i in range(10)]
            (p/'jobs').write_text(json.dumps({'jobs':jobs}))
            def reply(url, **kwargs):
                key=url.rsplit('/',1)[-1]
                html=PAGE.replace(KEY,key)
                if key.startswith('7'): html=html.replace('<a data-tracking-control-name="public_jobs_apply-link-onsite">Apply</a>','')
                return Mock(status_code=200,text=html)
            session=Mock();session.get.side_effect=reply
            with patch('probe_job_liveness.LinkedInSession',return_value=session),patch('time.sleep'),patch('sys.argv',['probe','--jobs',str(p/'jobs'),'--output',str(p/'out')]):probe_main()
            got=json.loads((p/'out').read_text())
            self.assertEqual(got['stats']['guardedRegions'],['HK'])
            self.assertEqual(got['stats']['unknown'],10)
            self.assertEqual(got['stats']['open'],20)

    def test_cn_due_backlog_has_first_claim_on_the_total_cap(self):
        jobs=[row("CN",sourceJobId="li-"+str(200000000+i)) for i in range(300)]
        jobs+=[row("HK",sourceJobId="li-300000001"),row("SG",sourceJobId="li-300000002")]
        selected=select_regional_candidates(jobs,["CN","HK","SG"],max_probes=6)
        self.assertEqual(len(selected),6)
        self.assertEqual([x["location"] for x in selected],["CN"]*6)
        self.assertFalse(in_scope(row(company="JPMorganChase",companyCanonical="")))
        self.assertTrue(in_scope(row(company="Small Co")))

    def test_cn_first_then_hk_sg_share_spare_places(self):
        jobs=[row("CN",sourceJobId="li-200000001")]
        jobs += [row(loc,sourceJobId="li-"+str(base+i)) for loc,base in (("HK",300000000),("SG",400000000)) for i in range(10)]
        selected=select_regional_candidates(jobs,["SG","HK","CN","CN"],max_probes=6)
        self.assertEqual([x["location"] for x in selected],["CN","HK","SG","HK","SG","HK"])
        self.assertEqual(len({x['sourceJobId'] for x in selected}),6)

    def test_recent_cn_and_targets_do_not_reserve_places(self):
        now="2026-10-09T14:00:00Z"
        jobs=[row("CN",liveCheckedAt=now),row("CN",company="HSBC",sourceJobId="li-200000001"),row("HK",sourceJobId="li-300000001"),row("SG",sourceJobId="li-400000001")]
        selected=select_regional_candidates(jobs,["CN","HK","SG"],now=now,max_probes=150)
        self.assertEqual([x['location'] for x in selected],["HK","SG"])

    def test_unused_region_places_are_reused_and_zero_cap_is_empty(self):
        jobs=[row("CN",sourceJobId="li-200000001")]+[row("SG",sourceJobId="li-"+str(400000000+i)) for i in range(5)]
        selected=select_regional_candidates(jobs,["CN","HK","SG"],max_probes=4)
        self.assertEqual([x['location'] for x in selected],["CN","SG","SG","SG"])
        self.assertEqual(select_regional_candidates(jobs,["CN","HK","SG"],max_probes=0),[])

    def test_scope_without_cn_never_selects_cn_records(self):
        jobs=[row("CN"),row("HK",sourceJobId="li-300000001"),row("SG",sourceJobId="li-400000001")]
        self.assertEqual([x['location'] for x in select_regional_candidates(jobs,["HK","SG"],max_probes=150)],["HK","SG"])

    def test_regional_cleanup_does_not_reintroduce_rows_from_rss(self):
        old=(datetime.now(timezone.utc)-timedelta(days=31)).isoformat()
        jobs=[row(region,sourceJobId="li-"+str(400000000+i),jobStatus="expired",expiredReason="linkedin_closed",expiredAt=old) for i,region in enumerate(("CN","HK","SG"))]
        jobs.append(row("HK",sourceJobId="li-400000003",company="HSBC",companyCanonical="hsbc",jobStatus="expired",expiredReason="linkedin_closed",expiredAt=old))
        merged=merge_documents({"jobs":jobs},{"jobs":[dict(jobs[0],pushTime="2026-10-09")]})
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp); (p/'jobs').write_text(json.dumps(merged))
            (p/'live').write_text(json.dumps({"schemaVersion":"1.1","mode":"job-liveness","scopeLocations":["CN","HK","SG"],"observations":[{"jobId":str(400000000+i),"result":"closed","checkedAt":datetime.now(timezone.utc).isoformat()} for i in range(3)]}))
            with patch('sys.argv',['apply_liveness','--jobs',str(p/'jobs'),'--liveness',str(p/'live'),'--output',str(p/'out')]): apply_main()
            got=json.loads((p/'out').read_text())
            self.assertEqual([x["sourceJobId"] for x in got["jobs"]],["li-400000003"])
            self.assertEqual(got["liveness"]["deleted_after_days"],3)

    def test_probe_blocking_stops_before_budget_and_emits_no_dates(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp); (p/'jobs').write_text(json.dumps({"jobs":[row(sourceJobId="li-"+str(500000000+i)) for i in range(5)]}))
            session=Mock(); session.get.return_value=Mock(status_code=429,text='blocked')
            with patch('probe_job_liveness.LinkedInSession',return_value=session),patch('time.sleep'),patch('sys.argv',['probe','--jobs',str(p/'jobs'),'--output',str(p/'out')]): probe_main()
            got=json.loads((p/'out').read_text())
            self.assertEqual(got['stats']['probed'],3)
            self.assertTrue(got['stats']['circuitOpen'])
            self.assertEqual(got['stats']['postingDates'],0)

    def test_ambiguous_pages_do_not_call_the_date_service(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);jobs=[row(sourceJobId='li-'+str(500000000+i)) for i in range(4)]
            (p/'jobs').write_text(json.dumps({'jobs':jobs}))
            def reply(url,**kw):
                self.assertIn('/jobs/view/',url)
                return Mock(status_code=200,text=PAGE.replace(KEY,url.rsplit('/',1)[-1]))
            session=Mock();session.get.side_effect=reply
            with patch('probe_job_liveness.LinkedInSession',return_value=session),patch('sys.argv',['probe','--jobs',str(p/'jobs'),'--output',str(p/'out')]):probe_main()
            got=json.loads((p/'out').read_text())
            self.assertEqual(got['stats']['probed'],4)
            self.assertEqual(got['stats']['open'],4)
            self.assertEqual(got['stats']['postingDateSearchRequests'],0)
            self.assertEqual(got['stats']['postingDateSkippedNoEvidence'],4)
            self.assertFalse(got['stats']['circuitOpen'])
            self.assertEqual(session.get.call_count,4)

    def test_interruption_keeps_completed_individual_observations(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);jobs=[row(title='',sourceJobId='li-'+str(500000000+i)) for i in range(2)]
            (p/'jobs').write_text(json.dumps({'jobs':jobs}))
            session=Mock();session.get.side_effect=[Mock(status_code=200,text=PAGE.replace(KEY,'500000000')),KeyboardInterrupt()]
            with patch('probe_job_liveness.LinkedInSession',return_value=session),patch('sys.argv',['probe','--jobs',str(p/'jobs'),'--output',str(p/'out')]):
                with self.assertRaises(KeyboardInterrupt):probe_main()
            got=json.loads((p/'out').read_text())
            self.assertEqual(got['stats']['probed'],1)
            self.assertEqual(got['observations'][0]['jobId'],'500000000')
            self.assertEqual(got['observations'][0]['result'],'open')

    def test_page_date_repost_survives_without_date_search(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);jobs=[row(sourceJobId='li-'+str(500000000+i)) for i in range(5)]
            (p/'jobs').write_text(json.dumps({'jobs':jobs}))
            def reply(url,**kwargs):
                self.assertIn('/jobs/view/',url)
                key=url.rsplit('/',1)[-1];html=PAGE.replace(KEY,key)
                if key=='500000004':
                    data={'@type':'JobPosting','identifier':{'value':key},'datePosted':'2026-10-01'}
                    html+='<script type="application/ld+json">'+json.dumps(data)+'</script>'
                return Mock(status_code=200,text=html)
            session=Mock();session.get.side_effect=reply
            with patch('probe_job_liveness.LinkedInSession',return_value=session),patch('sys.argv',['probe','--jobs',str(p/'jobs'),'--output',str(p/'out')]):probe_main()
            got=json.loads((p/'out').read_text())
            self.assertEqual(got['stats']['open'],5)
            self.assertEqual(got['stats']['postingDates'],1)
            self.assertEqual(got['stats']['postingDateSearchRequests'],0)
            self.assertEqual(session.get.call_count,5)
            observation=next(x for x in got['observations'] if x['jobId']=='500000004')
            item=row(sourceJobId='li-500000004')
            apply_observation(item,'open',observation['checkedAt'],date_posted=observation['datePosted'],date_source=observation['dateSource'])
            self.assertEqual(item['pushTime'],'2026-10-01')
            self.assertEqual(item['firstSeen'],'2026-08-01')

    def test_shared_pacer_handles_waits_without_second_per_job_sleep(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);jobs=[row(title='',sourceJobId='li-'+str(500000000+i)) for i in range(3)]
            (p/'jobs').write_text(json.dumps({'jobs':jobs}))
            session=Mock();session.get.side_effect=lambda url,**kw:Mock(status_code=200,text=PAGE.replace(KEY,url.rsplit('/',1)[-1]))
            with patch('probe_job_liveness.LinkedInSession',return_value=session),patch('time.sleep') as sleep,patch('sys.argv',['probe','--jobs',str(p/'jobs'),'--output',str(p/'out'),'--delay-min','2','--delay-max','5']):probe_main()
            self.assertEqual(session.get.call_count,3)
            sleep.assert_not_called()
            self.assertEqual(json.loads((p/'out').read_text())['stats']['probed'],3)

    def test_one_recoverable_429_does_not_discard_remaining_liveness_candidates(self):
        from linkedin_http import RequestStopped
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)
            jobs=[row(title='',sourceJobId='li-'+str(500000000+i)) for i in range(2)]
            (p/'jobs').write_text(json.dumps({'jobs':jobs}))
            session=Mock()
            session.get.side_effect=[RequestStopped('short HTTP 429 pause',recoverable=True),
                                     Mock(status_code=200,text=PAGE.replace(KEY,'500000001')),
                                     Mock(status_code=200,text=PAGE.replace(KEY,'500000000'))]
            with patch('probe_job_liveness.LinkedInSession',return_value=session),patch('time.sleep'),patch('sys.argv',['probe','--jobs',str(p/'jobs'),'--output',str(p/'out')]):probe_main()
            got=json.loads((p/'out').read_text())
            self.assertEqual(session.get.call_count,2)
            self.assertEqual(got['stats']['unknown'],1)
            self.assertEqual(got['stats']['open'],1)
            self.assertFalse(got['stats']['circuitOpen'])

    def test_login_or_persistent_quota_stop_still_protects_liveness(self):
        from linkedin_http import RequestStopped
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)
            jobs=[row(title='',sourceJobId='li-'+str(500000000+i)) for i in range(2)]
            (p/'jobs').write_text(json.dumps({'jobs':jobs}))
            session=Mock();session.get.side_effect=RequestStopped('login/challenge')
            with patch('probe_job_liveness.LinkedInSession',return_value=session),patch('time.sleep'),patch('sys.argv',['probe','--jobs',str(p/'jobs'),'--output',str(p/'out')]):probe_main()
            got=json.loads((p/'out').read_text())
            self.assertEqual(session.get.call_count,1)
            self.assertTrue(got['stats']['circuitOpen'])
            self.assertEqual(got['stats']['unknown'],1)
            self.assertEqual(got['stats']['skippedCircuitOpen'],1)

if __name__ == '__main__': unittest.main()
