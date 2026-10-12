import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from audit_project import audit


class CanonicalAuditTests(unittest.TestCase):
    def test_detects_duplicate_or_mismatched_ids_and_missing_logos(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            row = {'sourceJobId': 'li-12345678', 'link': 'https://www.linkedin.com/jobs/view/12345679'}
            (root / 'jobs.json').write_text(json.dumps({'count': 2, 'jobs': [row, row]}))
            (root / 'company-logos.json').write_text(json.dumps({'Acme': 'assets/company-logos/' + 'a' * 24 + '.webp'}))
            result = audit(root)
            self.assertEqual(result['problemCount'], 4)

    def test_validates_content_addressed_asset_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'jobs.json').write_text(json.dumps({'count': 1, 'jobs': [{'link': 'https://www.linkedin.com/jobs/view/12345678'}]}))
            raw = b'cached image'; name = hashlib.sha256(raw).hexdigest()[:24] + '.webp'
            asset = root / 'assets/company-logos' / name; asset.parent.mkdir(parents=True); asset.write_bytes(raw)
            (root / 'company-logos.json').write_text(json.dumps({'Acme': str(asset.relative_to(root))}))
            self.assertEqual(audit(root)['problemCount'], 0)
            asset.write_bytes(b'changed bytes')
            self.assertEqual(audit(root)['problemCount'], 1)


if __name__ == '__main__':
    unittest.main()
