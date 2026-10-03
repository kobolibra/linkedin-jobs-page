import unittest
from normalize_n8n_locations import VERIFIED_HK_JOB_IDS, extract_location, fetch_location, normalize_document

class LocationNormalizationTests(unittest.TestCase):
    def test_extracts_primary_hong_kong_location(self):
        html='''<div class="top-card-layout__second-subline"><span>China Construction Bank (Asia)</span><span>HONG KONG SAR, China</span><span>1 day ago</span></div>'''
        self.assertEqual(extract_location(html), 'HONG KONG SAR, China')

    def test_verified_job_id_override_is_narrow(self):
        self.assertIn('香港', fetch_location({'sourceJobId':'li-fund-administration-professional-at-china-construction-bank-asia-4472837988'}))
        self.assertNotIn('4472837989', VERIFIED_HK_JOB_IDS)

    def test_only_strong_linkedin_hk_evidence_changes_cn(self):
        import normalize_n8n_locations as mod
        original=mod.fetch_location
        try:
            mod.fetch_location=lambda row, timeout=20: 'HONG KONG SAR, China' if row['sourceJobId']=='li-1' else None
            doc={'jobs':[
                {'sourceJobId':'li-1','source':'n8n-rss','location':'CN','link':'https://cn.linkedin.com/jobs/view/1'},
                {'sourceJobId':'li-2','source':'n8n-rss','location':'CN','link':'https://cn.linkedin.com/jobs/view/2'},
                {'sourceJobId':'li-3','source':'jobspy','location':'CN','link':'https://www.linkedin.com/jobs/view/3'},
            ]}
            out=normalize_document(doc,max_workers=1)
        finally:
            mod.fetch_location=original
        self.assertEqual(out['jobs'][0]['location'],'HK')
        self.assertEqual(out['jobs'][0]['city'],'HONG KONG SAR')
        self.assertEqual(out['jobs'][1]['location'],'CN')
        self.assertEqual(out['jobs'][2]['location'],'CN')
        self.assertEqual(out['locationNormalization']['correctedCNtoHK'],1)

if __name__=='__main__': unittest.main()
