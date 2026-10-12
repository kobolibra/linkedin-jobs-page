import unittest
from unittest.mock import Mock
from linkedin_detail import fetch_detail
from linkedin_http import RequestStopped
from test_linkedin_http import response

ID='4464476951'
ITEM={'sourceJobId':'li-'+ID,'link':'https://www.linkedin.com/jobs/view/202612-programme-'+ID,'company':'HSBC','location':'CN','city':'Shanghai'}
GUEST='https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/'+ID
VIEW='https://www.linkedin.com/jobs/view/'+ID
HTML='''<h2 class="top-card-layout__title">Analyst</h2><div class="top-card-layout__card">
<a class="topcard__org-name-link" href="https://www.linkedin.com/company/hsbc">HSBC</a>
<span class="topcard__flavor--bullet">Shanghai, China</span>
<img class="artdeco-entity-image" src="https://media.licdn.com/dms/image/company-logo_100/hsbc"/>
</div><div class="show-more-less-html__markup">Responsibilities include risk analysis and portfolio reporting.</div>'''


class DetailTests(unittest.TestCase):
    def session(self,*responses):
        s=Mock();s.get.side_effect=responses;return s

    def test_guest_preserves_city_logo_and_job_identity(self):
        session=self.session(response(text=HTML,url=GUEST))
        result=fetch_detail(session,ITEM)
        self.assertEqual(result['detailEndpoint'],'guest')
        self.assertEqual(result['city'],'Shanghai')
        self.assertEqual(result['locationRaw'],'Shanghai, China')
        self.assertEqual(result['companyLogoSource']['sourceJobId'],ID)
        self.assertEqual(result['link'],VIEW)
        self.assertIn('risk analysis',result['descriptionText'])
        session.get.assert_called_once()
        self.assertEqual(session.get.call_args.args[0],GUEST)

    def test_guest_empty_falls_back_to_full_page(self):
        view='<link rel="canonical" href="'+VIEW+'">'+HTML
        result=fetch_detail(self.session(response(text='<html></html>',url=GUEST),response(text=view,url=VIEW)),ITEM)
        self.assertEqual(result['detailStatus'],'ok');self.assertEqual(result['detailEndpoint'],'view')

    def test_wrong_guest_canonical_falls_back(self):
        wrong='<link rel="canonical" href="https://www.linkedin.com/jobs/view/999999999">'+HTML
        view='<link rel="canonical" href="'+VIEW+'">'+HTML
        result=fetch_detail(self.session(response(text=wrong,url=GUEST),response(text=view,url=VIEW)),ITEM)
        self.assertEqual(result['detailEndpoint'],'view')

    def test_wrong_employer_never_overwrites_existing_jd(self):
        item={**ITEM,'descriptionHtml':'OLD','descriptionText':'OLD JD'}
        bad=HTML.replace('>HSBC<','>Other Employer<')
        result=fetch_detail(self.session(response(text=bad,url=GUEST),response(text=bad,url=VIEW)),item)
        self.assertEqual(result['detailStatus'],'failed');self.assertEqual(result['descriptionHtml'],'OLD')

    def test_full_page_requires_matching_canonical(self):
        result=fetch_detail(self.session(response(404,url=GUEST),response(text=HTML,url=VIEW)),ITEM)
        self.assertEqual(result['detailStatus'],'failed')

    def test_guest_404_can_recover_on_view(self):
        view='<link rel="canonical" href="'+VIEW+'">'+HTML
        result=fetch_detail(self.session(response(404,url=GUEST),response(text=view,url=VIEW)),ITEM)
        self.assertEqual(result['detailStatus'],'ok')

    def test_double_missing_is_observation_not_expiry(self):
        result=fetch_detail(self.session(response(404,url=GUEST),response(410,url=VIEW)),ITEM)
        self.assertEqual(result['detailStatus'],'gone');self.assertNotIn('jobStatus',result)

    def test_shared_rate_limit_has_no_full_page_fallback(self):
        s=self.session(RequestStopped('limited'));result=fetch_detail(s,{**ITEM,'descriptionText':'OLD'})
        self.assertEqual(result['detailStatus'],'blocked');self.assertEqual(result['descriptionText'],'OLD')
        self.assertEqual(s.get.call_count,1)

    def test_mismatched_source_id_never_requests(self):
        s=Mock();result=fetch_detail(s,{**ITEM,'sourceJobId':'li-999999999'})
        self.assertEqual(result['detailStatus'],'failed');s.get.assert_not_called()

    def test_foreign_link_never_requests(self):
        s=Mock();result=fetch_detail(s,{**ITEM,'link':'https://attacker.test/jobs/view/'+ID})
        self.assertEqual(result['detailStatus'],'failed');s.get.assert_not_called()


if __name__=='__main__':unittest.main()
