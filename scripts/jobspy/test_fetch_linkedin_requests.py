import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import fetch_linkedin_requests as scraper


class FetchLinkedInRequestsTests(unittest.TestCase):
    def test_parse_search_keeps_city_cn_only(self):
        html = """
        <div class="base-search-card">
          <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/test-123456789"></a>
          <h4 class="base-search-card__subtitle"><a>HSBC</a></h4>
          <h3 class="base-search-card__title">Engineer</h3>
          <span class="job-search-card__location">Hong Kong</span>
          <time class="job-search-card__listdate" datetime="2026-09-23"></time>
        </div>
        """
        hk = scraper.parse_search(html, "HSBC", "2026-09-23T00:00:00+00:00", "HK")[0]
        cn = scraper.parse_search(html.replace("Hong Kong", "Shanghai, China"), "HSBC", "2026-09-23T00:00:00+00:00", "CN")[0]
        self.assertEqual(hk["location"], "HK")
        self.assertEqual(hk["city"], "")
        self.assertEqual(cn["location"], "CN")
        self.assertEqual(cn["city"], "Shanghai")

    @patch("fetch_linkedin_requests.time.sleep")
    @patch("fetch_linkedin_requests.requests.Session")
    def test_main_emits_independent_region_statuses(self, session_factory, sleep):
        response = type("Response", (), {
            "status_code": 200,
            "content": b"",
            "text": "",
            "raise_for_status": lambda self: None,
        })()
        session_factory.return_value.get.return_value = response
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "result.json"
            argv = [
                "fetch_linkedin_requests.py", "--company", "HSBC",
                "--location", "China", "--location", "Hong Kong", "--location", "Singapore",
                "--results-per-company", "1", "--delay-min", "0", "--delay-max", "0",
                "--output", str(output),
            ]
            with patch.object(sys, "argv", argv):
                self.assertEqual(scraper.main(), 0)
            doc = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(doc["scopeLocations"], ["CN", "HK", "SG"])
            self.assertEqual(set(doc["statusSummary"]), {"HSBC::CN", "HSBC::HK", "HSBC::SG"})
            self.assertEqual(doc["count"], 0)


if __name__ == "__main__":
    unittest.main()
