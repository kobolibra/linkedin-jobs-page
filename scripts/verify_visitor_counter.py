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
            assert 'visitor-count.js?v=counter-live-3' in html, 'unexpected homepage version'
            assert 'no-store' in response.headers.get('cache-control', ''), 'homepage may be stale'
        with fetch(BASE + '/visitor-count.js?v=counter-live-3', timeout=15) as response:
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
