"""Read-only asset verification; never register synthetic page views."""
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen

BASE = 'https://linkedin.claudecowork.workers.dev'


def verify(fetch=urlopen, report=print):
    try:
        with fetch(BASE + '/', timeout=15) as response:
            html = response.read().decode()
            assert response.status == 200
            preview = 'data-auth-state="guest"' in html
            protected = preview or 'data-auth-page="login"' in html
            if not protected:
                assert 'visitor-count.js?v=counter-live-4' in html, 'unexpected homepage version'
            assert 'no-store' in response.headers.get('cache-control', ''), 'homepage may be stale'
        if preview:
            for path, marker in (('/auth-guest.css?v=1', '.auth-guest-dialog'), ('/auth-guest.js?v=1', 'AuthGuest'), ('/auth-login-design.css?v=guest-1', '.auth-page'), ('/auth-login.js?v=guest-1', '/auth/providers')):
                with fetch(BASE + path, timeout=15) as asset:
                    assert asset.status == 200 and marker in asset.read().decode(), 'missing anonymous asset: ' + path
        if preview:
            import json
            with fetch(BASE + '/api/public-preview?page=999', timeout=15) as response:
                data = json.loads(response.read().decode())
                assert response.status == 200 and len(data['jobs']) <= 12, 'preview exceeds public limit'
                assert all('descriptionHtml' not in job and 'description' not in job and len(job.get('previewSnippet','')) <= 241 for job in data['jobs']), 'full details in preview'
        if protected:
            for path in ('/auth/session', '/jobs-index.json', '/jd-parts/00.json', '/account-auth.mjs'):
                try:
                    with fetch(BASE + path, timeout=15) as response:
                        raise AssertionError('Unauthenticated protected endpoint was accessible: ' + path)
                except HTTPError as blocked:
                    assert blocked.code == 401, 'unexpected protected endpoint status: ' + path
            report('Production public preview/login and protected job assets verified without synthetic page views.')
            return True
        with fetch(BASE + '/visitor-count.js?v=counter-live-4', timeout=15) as response:
            script = response.read().decode()
            assert response.status == 200
            assert 'https://busuanzi.ibruce.info/busuanzi?jsonpCallback=' in script, 'live counter missing'
            assert 'pv.json' not in script and '/api/visits' not in script, 'unexpected counter source'
    except HTTPError as exc:
        body = exc.read(4096).decode('utf-8', 'replace')
        # This known Cloudflare client block is not a failed Worker publication.
        # Record that verification was NOT performed; do not bypass the protection.
        if exc.code == 403 and 'error code: 1010' in body.lower():
            report('::warning::Cloudflare 1010 blocked this automated client. Live asset verification NOT performed; successful publication is reported by Wrangler. No security settings were changed.')
            return False
        raise
    report('Production homepage and live counter assets verified (GET only; no synthetic page views).')
    return True


if __name__ == '__main__':
    verified = verify()
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with Path(summary).open('a') as file:
            file.write('\nVisitor counter asset check: ' + ('verified.' if verified else '**NOT VERIFIED**: Cloudflare 1010 blocks this automated client; check recorded as a warning, not a publication failure.') + '\n')


