import json,tempfile,unittest
from pathlib import Path
from bs4 import BeautifulSoup
from logo_sources import source_hint,validate_hint
from build_frontend_payload import build

class SourceTests(unittest.TestCase):
    def test_verified_listing_source_binds_employer_and_job(self):
        html='<h4 class="base-search-card__subtitle"><a href="https://www.linkedin.com/company/dbs/">DBS Bank</a></h4><img class="artdeco-entity-image" data-delayed-url="https://media.licdn.com/dms/image/X/company-logo_100_100/image">'
        link='https://www.linkedin.com/jobs/view/12345';hint=source_hint(BeautifulSoup(html,'html.parser'),'DBS',link,'2026-10-12')
        self.assertTrue(validate_hint(hint,'DBS',link));self.assertFalse(validate_hint(hint,'HSBC',link));self.assertFalse(validate_hint(hint,'DBS',link+'6'))
    def test_index_embeds_catalog_once_and_rejects_external_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=root/'jobs.json';source.write_text(json.dumps({'jobs':[{'company':'DBS','title':'A','link':'https://www.linkedin.com/jobs/view/12345'}]}))
            asset='assets/company-logos/'+'a'*24+'.svg';other='assets/company-logos/'+'b'*24+'.webp';(root/'company-logos.json').write_text(json.dumps({'dbs bank':asset,'cached historical company':other,'other':'https://attacker.test/logo'}))
            (root/'data/company-logos').mkdir(parents=True);(root/'data/company-logos/state.json').write_text(json.dumps({'dbs bank':{'status':'ready','imageKind':'placeholder'}}))
            build(source,root/'index.json',root/'details.json');doc=json.loads((root/'index.json').read_text());self.assertEqual(doc['companyLogos'],{'dbs bank':asset,'cached historical company':other});self.assertEqual(doc['companyLogoFallback'],asset);self.assertNotIn('companyLogos',doc['jobs'][0])
