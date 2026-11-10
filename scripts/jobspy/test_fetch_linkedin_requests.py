import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fetch_linkedin_requests import main, parse_search


HTML = '''
<div class="base-search-card">
  <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/example-123456789?trk=x">x</a>
  <h4 class="base-search-card__subtitle"><a>HSBC</a></h4>
  <h3 class="base-search-card__title">Analyst</h3>
  <span class="job-search-card__location">Hong Kong, Hong Kong SAR</span>
  <time class="job-search-card__listdate" datetime="2026-09-23"></time>
</div>
<div class="base-search-card">
  <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/example-987654321">x</a>
  <h4 class="base-search-card__subtitle"><a>HSBC</a></h4>
  <h3 class="base-search-card__title">Engineer</h3>
  <span class="job-search-card__location">Shanghai, China</span>
  <time class="job-search-card__listdate" datetime="2026-09-23"></time>
</div>
'''


class FetchMultiRegionTests(unittest.TestCase):
    def test_large_employer_finishes_all_pages_and_verified_terminal_markers(self):
        end='<!DOCTYPE html>\n\n<!---->  '
        class Session:
            def __init__(self):self.headers={};self.offsets=[]
            def get(self,_url,**kwargs):
                start=kwargs['params']['start'];self.offsets.append(start)
                html=end if start>=440 else ''.join(f'<div class="base-search-card"><a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/example-{100000000+i}">Job</a><h4 class="base-search-card__subtitle"><a>HSBC</a></h4><h3 class="base-search-card__title">Analyst</h3><span class="job-search-card__location">Shanghai, China</span></div>' for i in range(start,start+10))
                return SimpleNamespace(status_code=200,content=html.encode(),text=html,raise_for_status=lambda:None)
        session=Session()
        with tempfile.TemporaryDirectory() as directory:
            output=Path(directory)/'large.json'
            argv=['search','--company','HSBC','--output',str(output),'--delay-min','0','--delay-max','0']
            with patch('fetch_linkedin_requests.LinkedInSession',return_value=session),patch('fetch_linkedin_requests.time.sleep'),patch.object(sys,'argv',argv):self.assertEqual(main(),0)
            got=json.loads(output.read_text())
        self.assertEqual(got['count'],440)
        self.assertEqual(got['statusSummary'],{'HSBC::CN':'ok: 440 jobs'})
        self.assertEqual(session.offsets,list(range(0,460,10)))

    def test_repeated_429_retains_verified_rows_and_stops_further_pages(self):
        from linkedin_http import Coordinator, LinkedInSession
        from test_linkedin_http import response
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);now=[0]
            def sleep(seconds):now[0]+=seconds
            coordinator=Coordinator(p/'http.json',clock=lambda:now[0],sleep=sleep,min_interval=0)
            session=LinkedInSession(attempts=3,coordinator=coordinator)
            self.addCleanup(session.close)
            output=p/'search.json'
            argv=['search','--company','HSBC','--output',str(output),'--delay-min','0','--delay-max','0']
            with patch('fetch_linkedin_requests.LinkedInSession',return_value=session),patch('fetch_linkedin_requests.time.sleep'),patch.object(sys,'argv',argv),patch('requests.Session.request',side_effect=[response(text=HTML),response(429,headers={'Retry-After':'7'}),response(429,headers={'Retry-After':'7'}),response(429,headers={'Retry-After':'7'})]) as request:
                self.assertEqual(main(),0)
            got=json.loads(output.read_text())
            self.assertEqual(request.call_count,2)
            self.assertEqual([c.kwargs['params']['start'] for c in request.call_args_list],[0,10])
            self.assertEqual(got['count'],1)
            self.assertIn('failed@start=10: HTTP 429 query deferred',got['statusSummary']['HSBC::CN'])

    def test_resume_uses_failed_offset_keeps_prefix_and_skips_completed_region(self):
        from linkedin_http import Coordinator, LinkedInSession
        from test_linkedin_http import response
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp); now=[0]
            coordinator=Coordinator(p/'http.json',clock=lambda:now[0],sleep=lambda sec:now.__setitem__(0,now[0]+sec),min_interval=0)
            session=LinkedInSession(coordinator=coordinator); self.addCleanup(session.close)
            output=p/'search.json'
            prefix={'sourceJobId':'li-111111111','requestedCompany':'HSBC','location':'CN'}
            hk={'sourceJobId':'li-222222222','requestedCompany':'HSBC','location':'HK'}
            output.write_text(json.dumps({'jobs':[prefix,hk], 'statusSummary':{'HSBC::CN':'failed@start=10: HTTP 429 query deferred', 'HSBC::HK':'ok: 1 jobs'}}))
            argv=['search','--company','HSBC','--location','China','--location','Hong Kong','--output',str(output),'--resume']
            end='<!DOCTYPE html>\n\n<!---->  '
            with patch('fetch_linkedin_requests.LinkedInSession',return_value=session),patch.object(sys,'argv',argv),patch('requests.Session.request',side_effect=[response(text=HTML),response(text=end),response(text=end)]) as request:
                self.assertEqual(main(),0)
            got=json.loads(output.read_text())
            self.assertEqual([c.kwargs['params']['start'] for c in request.call_args_list], [10,20,30])
            self.assertTrue(all(c.kwargs['params']['location']=='China' for c in request.call_args_list))
            self.assertTrue(all(c.kwargs['params']['sortBy']=='DD' for c in request.call_args_list))
            self.assertEqual({j['sourceJobId'] for j in got['jobs']},{'li-111111111','li-222222222','li-987654321'})
            self.assertEqual(got['statusSummary']['HSBC::HK'],'ok: 1 jobs')
            self.assertEqual(got['statusSummary']['HSBC::CN'],'partial@resumed-end: 2 jobs')

    def test_hk_row_is_lifecycle_only(self):
        rows = parse_search(HTML, "HSBC", "2026-09-23T00:00:00+00:00", "HK")
        self.assertEqual(len(rows), 1)
        self.assertTrue(all(row["location"] == "HK" for row in rows))
        self.assertTrue(all(row["city"] == "" for row in rows))
        self.assertTrue(all(row["descriptionHtml"] == "" for row in rows))

    def test_cn_row_can_carry_city_but_search_does_not_fetch_jd(self):
        rows = parse_search(HTML, "HSBC", "2026-09-23T00:00:00+00:00", "CN")
        self.assertEqual(len(rows), 1)
        cn = [row for row in rows if row["sourceJobId"] == "li-987654321"][0]
        self.assertEqual(cn["location"], "CN")
        self.assertEqual(cn["city"], "Shanghai")
        self.assertEqual(cn["descriptionHtml"], "")

    def test_verified_guest_end_marker_completes_snapshot_but_unknown_markup_does_not(self):
        listing = HTML.replace("HSBC", "Bank of America")
        end_marker = "<!DOCTYPE html>\n\n<!---->  "

        def run_pages(pages):
            class Session:
                def __init__(self):
                    self.headers = {}
                    self.context = {}
                    self.calls = 0

                def get(self, *_args, **_kwargs):
                    html = pages[self.calls]
                    self.calls += 1
                    return SimpleNamespace(status_code=200, content=html.encode(), text=html, raise_for_status=lambda: None)

            session = Session()
            with tempfile.TemporaryDirectory() as directory:
                output = Path(directory) / "search.json"
                argv = ["fetch_linkedin_requests.py", "--company", "Bank of America", "--location", "China", "--output", str(output), "--delay-min", "0", "--delay-max", "0"]
                with patch("fetch_linkedin_requests.LinkedInSession", return_value=session), patch("fetch_linkedin_requests.time.sleep"), patch.object(sys, "argv", argv):
                    self.assertEqual(main(), 0)
                return json.loads(output.read_text()), session.calls

        complete, calls = run_pages([listing, end_marker, end_marker])
        self.assertEqual(calls, 3)
        self.assertEqual(complete["count"], 1)
        self.assertEqual(complete["statusSummary"], {"Bank of America::CN": "ok: 1 jobs"})

        unsafe, calls = run_pages([listing, "<!DOCTYPE html><div>unexpected page</div>"])
        self.assertEqual(calls, 2)
        self.assertEqual(unsafe["count"], 1)
        self.assertIn("failed@start=10", unsafe["statusSummary"]["Bank of America::CN"])


    def test_schroders_and_invesco_company_ids_across_cn_hk_sg(self):
        """Each newly tracked company uses its strict f_C ID in all three regions."""
        from fetch_linkedin_requests import COMPANIES

        ids = {"Schroders": "5494", "Invesco": "3582438"}
        region_by_location = {"China": "CN", "Hong Kong": "HK", "Singapore": "SG"}
        location_text = {"China": "Shenzhen, China", "Hong Kong": "Hong Kong, Hong Kong SAR", "Singapore": "Singapore"}
        calls = []

        class FakeSession:
            def __init__(self):
                self.headers = {}
                self.context = {}

            def get(self, _url, **kwargs):
                params = kwargs["params"]
                calls.append(dict(params))
                self_ref.assertEqual(params["f_C"], ids[params["keywords"]])
                self_ref.assertIn(params["location"], region_by_location)
                self_ref.assertEqual(params["sortBy"], "DD")
                self_ref.assertEqual(params["pageNum"], 0)
                company = params["keywords"]
                if params["start"]:
                    html = "<!DOCTYPE html>\n\n<!---->"
                else:
                    index = (1 if company == "Schroders" else 2) * 10 + list(region_by_location).index(params["location"]) + 1
                    job_id = 4480000000 + index
                    html = (
                        '<div class="base-search-card">'
                        f'<a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/{job_id}">Job</a>'
                        f'<h4 class="base-search-card__subtitle"><a>{company}</a></h4>'
                        '<h3 class="base-search-card__title">Investment Analyst</h3>'
                        f'<span class="job-search-card__location">{location_text[params["location"]]}</span>'
                        '<time class="job-search-card__listdate" datetime="2026-11-10"></time>'
                        '</div>'
                    )
                return SimpleNamespace(status_code=200, text=html, content=html.encode(), raise_for_status=lambda: None)

        self_ref = self
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "matrix.json"
            argv = [
                "search", "--company", "Schroders", "--company", "Invesco",
                "--location", "China", "--location", "Hong Kong", "--location", "Singapore",
                "--delay-min", "0", "--delay-max", "0", "--output", str(output),
            ]
            with patch("fetch_linkedin_requests.LinkedInSession", return_value=FakeSession()), patch("fetch_linkedin_requests.time.sleep"), patch.object(sys, "argv", argv):
                self.assertEqual(main(), 0)
            result = json.loads(output.read_text(encoding="utf-8"))

        self.assertEqual({name: COMPANIES[name]["company_id"] for name in ids}, ids)
        self.assertEqual(result["count"], 6)
        self.assertEqual(result["scopeLocations"], ["CN", "HK", "SG"])
        self.assertEqual(
            {(job["requestedCompany"], job["location"]) for job in result["jobs"]},
            {(name, region) for name in ids for region in region_by_location.values()},
        )
        self.assertEqual({job["companyCanonical"] for job in result["jobs"]}, {"schroders", "invesco"})
        self.assertEqual(
            result["statusSummary"],
            {f"{name}::{region}": "ok: 1 jobs" for name in ids for region in region_by_location.values()},
        )
        self.assertEqual(len(calls), 18)
        for name, company_id in ids.items():
            for location in region_by_location:
                self.assertEqual(
                    [call["start"] for call in calls if call["f_C"] == company_id and call["location"] == location],
                    [0, 10, 20],
                )



if __name__ == "__main__":
    unittest.main()
