import io
import unittest
from urllib.error import HTTPError
from verify_visitor_counter import verify

class Response(io.BytesIO):
    status = 200
    headers = {'cache-control': 'no-store'}

class VerificationTests(unittest.TestCase):
    def test_protected_login_checks_that_direct_data_and_source_requests_are_denied(self):
        requests=[]
        def fetch(url, **kwargs):
            requests.append(url)
            if url.endswith('/'):
                return Response(b'<main data-auth-page="login">Sign in</main>')
            raise HTTPError(url,401,'Unauthorized',{},io.BytesIO(b'{"error":"sign_in_required"}'))
        self.assertTrue(verify(fetch,lambda _:None))
        self.assertEqual(len(requests),5)
        self.assertTrue(any(url.endswith('/jobs-index.json') for url in requests))

    def test_preview_verifies_public_dependencies_and_private_data_boundaries(self):
        requests=[]
        def fetch(url, **kwargs):
            requests.append(url)
            if url.endswith('/'):
                return Response(b'<body data-auth-state="guest"><article class="role"></article></body>')
            for path, marker in (('auth-guest.css?v=1', '.auth-guest-dialog'), ('auth-guest.js?v=1', 'AuthGuest'), ('auth-login-design.css?v=guest-1', '.auth-page'), ('auth-login.js?v=guest-1', '/auth/providers')):
                if url.endswith(path): return Response(marker.encode())
            if '/api/public-preview' in url: return Response(b'{"jobs":[]}')
            raise HTTPError(url,401,'Unauthorized',{},io.BytesIO(b'{}'))
        self.assertTrue(verify(fetch, lambda _:None))
        self.assertEqual(len(requests),10)
        self.assertTrue(all('visitor-count' not in url for url in requests))

    def test_published_assets_are_checked_without_counting_visits(self):
        requests = []
        def fetch(url, **kwargs):
            requests.append(url)
            text = ('visitor-count.js?v=counter-live-4' if url.endswith('/') else
                    'https://busuanzi.ibruce.info/busuanzi?jsonpCallback=')
            return Response(text.encode())
        self.assertTrue(verify(fetch, lambda _: None))
        self.assertEqual(len(requests), 2)
        self.assertTrue(all('ibruce.info' not in url and '/api/visits' not in url for url in requests))

    def test_known_cloudflare_client_block_is_explicitly_unverified(self):
        reports = []
        def fetch(url, **kwargs):
            raise HTTPError(url, 403, 'Forbidden', {}, io.BytesIO(b'error code: 1010'))
        self.assertFalse(verify(fetch, reports.append))
        self.assertIn('NOT performed', reports[0])
        self.assertIn('::warning::', reports[0])

    def test_unrelated_http_errors_still_fail(self):
        for code, body in [(403, b'access forbidden'), (404, b'not found'), (502, b'bad gateway')]:
            def fetch(url, **kwargs):
                raise HTTPError(url, code, 'Failed', {}, io.BytesIO(body))
            with self.assertRaises(HTTPError):
                verify(fetch, lambda _: None)

    def test_wrong_or_stale_published_assets_still_fail(self):
        with self.assertRaises(AssertionError):
            verify(lambda *args, **kwargs: Response(b'old homepage'), lambda _: None)
        def fetch(url, **kwargs):
            return Response(b'visitor-count.js?v=counter-live-4' if url.endswith('/') else b'old counter code')
        with self.assertRaises(AssertionError):
            verify(fetch, lambda _: None)

if __name__ == '__main__':
    unittest.main()


