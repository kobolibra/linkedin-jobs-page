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
            self.assertEqual(request.call_count,4)
            self.assertEqual([c.kwargs['params']['start'] for c in request.call_args_list],[0,10,10,10])
            self.assertEqual(got['count'],1)
            self.assertIn('failed@start=10: HTTP 429 page deferred',got['statusSummary']['HSBC::CN'])

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


if __name__ == "__main__":
    unittest.main()
