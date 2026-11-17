import io
import json
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
        if '/api/public-preview' in url:
            root = Path(subject.__file__).parents[1]
            index = json.loads((root / 'jobs-index.json').read_text('utf-8'))
            return Response(json.dumps({
                'jobs': [{'title': 'Public redacted listing'}],
                'dataVersion': 'preview-' + index['dataVersion'],
                'previewOverview': {'total': subject._expected_public_total(index)},
            }).encode())
        for name in ('job-applications.js', 'job-applications.css', 'calendar-date.js', 'app.js'):
            if '/' + name in url:
                return Response((Path(subject.__file__).parents[1] / name).read_bytes())
        return Response((Path(subject.__file__).parents[1] / 'index.html').read_bytes())

    def test_exact_assets_and_private_boundary(self):
        with patch.object(subject, 'urlopen', side_effect=self.fetch):
            self.assertTrue(subject.verify())

    def test_production_verifier_uses_descriptive_client_identity(self):
        requests = []
        def fetch(request, **kwargs):
            if isinstance(request, str):
                raise AssertionError('All live fetches must set a descriptive user agent')
            requests.append(request)
            return self.fetch(request, **kwargs)
        with patch.object(subject, 'urlopen', side_effect=fetch):
            self.assertTrue(subject.verify())
        self.assertTrue(requests)
        self.assertTrue(all('NextJourney-DeployVerifier' in req.get_header('User-agent', '') for req in requests))
        self.assertTrue(any('/api/public-preview?' in req.full_url for req in requests))

    def test_stale_published_jobs_version_fails(self):
        def fetch(request, **kwargs):
            url = request.full_url
            if '/api/public-preview' in url:
                return Response(b'{"jobs":[{}],"dataVersion":"preview-stale","previewOverview":{"total":1}}')
            return self.fetch(request, **kwargs)
        with patch.object(subject, 'urlopen', side_effect=fetch):
            with self.assertRaisesRegex(RuntimeError, 'version does not match'):
                subject.verify()

    def test_empty_published_job_preview_fails(self):
        def fetch(request, **kwargs):
            url = request.full_url
            if '/api/public-preview' in url:
                root = Path(subject.__file__).parents[1]
                index = json.loads((root / 'jobs-index.json').read_text('utf-8'))
                return Response(json.dumps({'jobs': [], 'dataVersion': 'preview-' + index['dataVersion'], 'previewOverview': {'total': subject._expected_public_total(index)}}).encode())
            return self.fetch(request, **kwargs)
        with patch.object(subject, 'urlopen', side_effect=fetch):
            with self.assertRaisesRegex(RuntimeError, 'preview is empty'):
                subject.verify()

    def test_stale_homepage_script_reference_fails(self):
        def fetch(request, **kwargs):
            url = request.full_url
            if url == subject.ORIGIN + '/':
                page = (Path(subject.__file__).parents[1] / 'index.html').read_text('utf-8')
                return Response(page.replace('calendar-date.js?v=market-calendar-3', 'calendar-date.js?v=stale').encode())
            return self.fetch(request, **kwargs)
        with patch.object(subject, 'urlopen', side_effect=fetch):
            with self.assertRaisesRegex(RuntimeError, 'asset reference mismatch'):
                subject.verify()

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

