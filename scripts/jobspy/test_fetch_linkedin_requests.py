import unittest

from fetch_linkedin_requests import parse_search


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
    def test_hk_row_is_lifecycle_only(self):
        rows = parse_search(HTML, "HSBC", "2026-09-23T00:00:00+00:00", "HK")
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(row["location"] == "HK" for row in rows))
        self.assertTrue(all(row["city"] == "" for row in rows))
        self.assertTrue(all(row["descriptionHtml"] == "" for row in rows))

    def test_cn_row_can_carry_city_but_search_does_not_fetch_jd(self):
        rows = parse_search(HTML, "HSBC", "2026-09-23T00:00:00+00:00", "CN")
        self.assertEqual(len(rows), 2)
        cn = [row for row in rows if row["sourceJobId"] == "li-987654321"][0]
        self.assertEqual(cn["location"], "CN")
        self.assertEqual(cn["city"], "Shanghai")
        self.assertEqual(cn["descriptionHtml"], "")


if __name__ == "__main__":
    unittest.main()
