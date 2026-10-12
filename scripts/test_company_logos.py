import io, json, tempfile, unittest
from pathlib import Path
from types import SimpleNamespace
from PIL import Image
from company_logos import apply, candidates, extract, image_url, key, thumbnail, PARSER_VERSION

class LogosTests(unittest.TestCase):
    def html(self,name='DBS Bank',url='https://media.licdn.com/dms/image/v2/X/company-logo_100_100/image'):
        return '<div class="top-card-layout"><a class="topcard__org-name-link" href="https://www.linkedin.com/company/dbs-bank/">'+name+'</a><img class="artdeco-entity-image" data-delayed-url="'+url+'"></div>'
    def test_identity_aliases_and_chinese(self):
        self.assertEqual(key('DBS'),key('DBS Bank'));self.assertEqual(key('BNP'),key('BNP Paribas'))
        self.assertNotEqual(key('招商银行'),key('中国银行'));self.assertNotEqual(key('HSBC'),key('HSBC Recruitment'))
    def test_verify_employer_and_image_host(self):
        self.assertIsNotNone(extract(self.html(),'DBS'))
        self.assertIsNone(extract(self.html('Recruiter'),'DBS Bank'))
        self.assertIsNone(extract(self.html(url='https://attacker.test/company-logo_100_100'),'DBS Bank'))
        self.assertIsNone(extract(self.html(url='https://media.licdn.com/profile-displayphoto'),'DBS Bank'))
        self.assertFalse(image_url('https://media.licdn.com.attacker.test/company-logo_100_100'))
    def test_small_real_thumbnail_no_upscaled_crop(self):
        buf=io.BytesIO();Image.new('RGB',(100,50),'red').save(buf,'PNG')
        data=thumbnail(buf.getvalue());self.assertLess(len(data),12000)
        with Image.open(io.BytesIO(data)) as im:
            self.assertEqual(im.size,(64,64));self.assertEqual(im.format,'WEBP');self.assertEqual(im.getpixel((0,0))[3],0)
    def test_verified_crop_and_school_employer(self):
        self.assertIsNotNone(extract(self.html(url='https://media.licdn.com/dms/image/v2/X/img-crop_100/image'),'DBS'))
        self.assertIsNotNone(extract(self.html().replace('/company/dbs-bank/','/school/dbs-bank/'),'DBS'))
        self.assertIsNone(extract(self.html().replace('/company/dbs-bank/','/in/dbs-bank/'),'DBS'))
        self.assertIsNotNone(extract(self.html('Ateca Executive Search'),'Ateca'))
        self.assertIsNone(extract(self.html('Ateca Recruitment'),'Ateca'))
    def test_explicit_repair_skips_ready_but_rechecks_missing(self):
        rows=[{'company':'A','link':'https://www.linkedin.com/jobs/view/'+str(i)} for i in range(8)]
        state={'a':{'status':'missing','checkedAt':'2026-10-12T05:18:31+00:00'}}
        self.assertEqual(len(candidates(rows,[],state,'repair')[0][1]),6)
        self.assertEqual(candidates(rows,[],{'a':{'status':'ready'}},'repair'),[])
        self.assertTrue(candidates(rows,[],state,'bootstrap'))
        state['a']['parserVersion']=PARSER_VERSION
        self.assertEqual(candidates(rows,[],state,'bootstrap'),[])
    def test_gray_placeholder_never_replaces_monogram(self):
        url='https://static.licdn.com/aero-v1/sc/h/aajlclc14rr2scznz5qm2rj9u'
        self.assertIsNone(extract(self.html(url=url),'DBS'))
        real='https://media.licdn.com/dms/image/v2/X/company-logo_100_100/image'
        html=self.html(url=real).replace('data-delayed-url=', 'data-ghost-url="'+real+'" data-delayed-url=')
        self.assertIsNone(extract(html,'DBS'))
        # A genuine image may also advertise a DIFFERENT fallback URL.
        html=self.html(url=real).replace('data-delayed-url=', 'data-ghost-url="'+url+'" data-delayed-url=')
        self.assertIsNotNone(extract(html,'DBS'))
    def test_placeholder_stops_company_without_downloading_or_retrying(self):
        from unittest.mock import patch
        from company_logos import collect
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);jobs=p/'jobs.json';jobs.write_text(json.dumps([{'company':'DBS','link':'https://www.linkedin.com/jobs/view/12345'},{'company':'DBS','link':'https://www.linkedin.com/jobs/view/12346'}]))
            args=SimpleNamespace(state=str(p/'state.json'),jobs=str(jobs),rss=str(p/'rss.json'),mode='repair',output=str(p/'out'),limit=1000,delay=0)
            html=self.html(url='https://static.licdn.com/aero-v1/sc/h/aajlclc14rr2scznz5qm2rj9u').encode()
            with patch('company_logos.fetch_bytes',return_value=html) as fetch:collect(args)
            self.assertEqual(fetch.call_count,1)
            result=json.loads((p/'out/updates.json').read_text())['dbs bank']
            self.assertEqual(result['status'],'placeholder');self.assertNotIn('asset',result)
            self.assertEqual(result['attempts'][0]['reason'],'placeholder_image')
    def test_rss_retries_all_retained_companies_not_only_batch_companies(self):
        a={'company':'A','link':'https://www.linkedin.com/jobs/view/12345'}
        b={'company':'B','link':'https://www.linkedin.com/jobs/view/12346'}
        jobs={'jobs':[a,b]};rss={'jobs':[a,{'company':'Blocked Co','link':'https://www.linkedin.com/jobs/view/12347'}]}
        self.assertEqual([k for k,_ in candidates(jobs,rss,{},'rss')],['a','b'])
        self.assertEqual([k for k,_ in candidates(jobs,rss,{},'bootstrap')],['a','b'])
        self.assertEqual([k for k,_ in candidates(jobs,rss,{'a':{'status':'ready'}},'rss')],['b'])
    def test_rss_retries_recent_missing_and_placeholder_but_skips_ready(self):
        from datetime import datetime,timezone
        jobs=[{'company':name,'link':'https://www.linkedin.com/jobs/view/'+str(12345+i)} for i,name in enumerate(('A','B','C'))]
        checked=datetime.now(timezone.utc).isoformat()
        state={'a':{'status':'missing','checkedAt':checked,'parserVersion':PARSER_VERSION},'b':{'status':'placeholder','checkedAt':checked,'parserVersion':PARSER_VERSION},'c':{'status':'ready','checkedAt':checked}}
        for _ in range(2):
            self.assertEqual([k for k,_ in candidates(jobs,[],state,'rss')],['a','b'])
        self.assertEqual(candidates(jobs,[],state,'bootstrap'),[])
    def test_rss_uses_retained_linkedin_jobs_and_two_representative_links(self):
        jobs=[{'company':'A','link':'https://www.linkedin.com/jobs/view/'+str(12345+i),'pushTime':str(i),'jobStatus':'expired' if i==7 else 'active'} for i in range(8)]
        jobs.append({'company':'External','link':'https://example.com/jobs/12345'})
        state={'a':{'status':'missing'}}
        batch=candidates(jobs,None,state,'rss')
        self.assertEqual([k for k,_ in batch],['a'])
        self.assertEqual([r['link'] for r in batch[0][1]],[jobs[6]['link'],jobs[5]['link']])
    def test_collect_rss_does_not_require_or_read_staging_file(self):
        from unittest.mock import patch
        from company_logos import collect
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);jobs=p/'jobs.json';jobs.write_text(json.dumps([{'company':'DBS Bank','link':'https://www.linkedin.com/jobs/view/12345'}]))
            state=p/'state.json';state.write_text(json.dumps({'dbs bank':{'status':'missing','checkedAt':'2026-10-12T08:49:00+00:00'}}))
            rss=p/'rss.json';rss.write_text('not a valid RSS JSON document')
            args=SimpleNamespace(state=str(state),jobs=str(jobs),rss=str(rss),mode='rss',output=str(p/'out'),limit=1000,delay=0)
            with patch('company_logos.fetch_bytes',return_value=self.html(url='https://static.licdn.com/aero-v1/sc/h/aajlclc14rr2scznz5qm2rj9u').encode()) as fetch:collect(args)
            self.assertEqual(fetch.call_count,1)
            self.assertEqual(json.loads((p/'out/updates.json').read_text())['dbs bank']['status'],'placeholder')
    def test_apply_merges_latest_state_and_does_not_touch_jobs(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);out=p/'out';out.mkdir();assets=p/'assets';assets.mkdir()
            name='a'*24+'.webp';(out/name).write_bytes(b'checked-image')
            (out/'updates.json').write_text(json.dumps({'a':{'status':'ready','asset':name,'checkedAt':'2026-10-12'},'b':{'status':'missing','checkedAt':'2026-10-12'}}))
            state=p/'state.json';state.write_text(json.dumps({'c':{'status':'missing','checkedAt':'2026-10-11'}}))
            jobs=p/'jobs.json';jobs.write_text('preserved')
            args=SimpleNamespace(apply=str(out),state=str(state),assets=str(assets),manifest=str(p/'manifest.json'))
            apply(args);apply(args)
            self.assertEqual(set(json.loads(state.read_text())),{'a','b','c'})
            self.assertEqual(json.loads((p/'manifest.json').read_text()),{'a':'assets/company-logos/'+name})
            self.assertEqual(jobs.read_text(),'preserved')
if __name__=='__main__': unittest.main()
