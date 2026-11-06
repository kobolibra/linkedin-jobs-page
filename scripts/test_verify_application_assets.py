import io
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
import verify_application_assets as subject


class Response(io.BytesIO):
    status = 200


class VerificationTests(unittest.TestCase):
    def fetch(self, request, timeout=20):
        url = request if isinstance(request, str) else request.full_url
        if '/auth/preferences' in url:
            raise HTTPError(url, 401, 'Unauthorized', {}, io.BytesIO(b'{}'))
        for name in ('job-applications.js', 'job-applications.css'):
            if '/' + name in url:
                return Response((Path(subject.__file__).parents[1] / name).read_bytes())
        return Response(b'job-applications.js?v=11 job-applications.css?v=9')

    def test_exact_assets_and_private_boundary(self):
        with patch.object(subject, 'urlopen', side_effect=self.fetch):
            self.assertTrue(subject.verify())

    def test_wrong_asset_bytes_fail(self):
        with patch.object(subject, 'urlopen', return_value=Response(b'stale')):
            with self.assertRaisesRegex(RuntimeError, 'asset mismatch'):
                subject.verify()

    def test_known_client_block_is_explicitly_not_verified(self):
        report = []
        error = HTTPError('https://test', 403, 'Forbidden', {}, io.BytesIO(b'error code: 1010'))
        with patch.object(subject, 'urlopen', side_effect=error):
            self.assertFalse(subject.verify(report.append))
        self.assertIn('NOT verified', report[0])

    def test_other_forbidden_responses_still_fail(self):
        error = HTTPError('https://test', 403, 'Forbidden', {}, io.BytesIO(b'Other failure'))
        with patch.object(subject, 'urlopen', side_effect=error):
            with self.assertRaises(HTTPError):
                subject.verify()

    def test_private_data_becoming_public_fails(self):
        def fetch(request, **kwargs):
            url = request if isinstance(request, str) else request.full_url
            return Response(b'{}') if '/auth/preferences' in url else self.fetch(request, **kwargs)
        with patch.object(subject, 'urlopen', side_effect=fetch):
            with self.assertRaisesRegex(RuntimeError, 'anonymous'):
                subject.verify()


if __name__ == '__main__':
    unittest.main()

