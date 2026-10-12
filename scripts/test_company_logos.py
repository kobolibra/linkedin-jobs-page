import io, json, tempfile, unittest
from pathlib import Path
from types import SimpleNamespace
from PIL import Image
from company_logos import apply, candidates, extract, image_url, key, thumbnail

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
    def test_rss_only_new_retained_company(self):
        a={'company':'A','link':'https://www.linkedin.com/jobs/view/12345'}
        b={'company':'B','link':'https://www.linkedin.com/jobs/view/12346'}
        jobs={'jobs':[a,b]};rss={'jobs':[a,{'company':'Blocked Co','link':'https://www.linkedin.com/jobs/view/12347'}]}
        self.assertEqual([k for k,_ in candidates(jobs,rss,{},'rss')],['a'])
        self.assertEqual([k for k,_ in candidates(jobs,rss,{},'bootstrap')],['a','b'])
        self.assertEqual(candidates(jobs,rss,{'a':{'status':'ready'}},'rss'),[])
    def test_failure_backoff(self):
        from datetime import datetime,timezone
        row={'company':'A','link':'https://www.linkedin.com/jobs/view/12345'}
        state={'a':{'status':'missing','checkedAt':datetime.now(timezone.utc).isoformat()}}
        self.assertEqual(candidates([row],[row],state,'rss'),[])
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
