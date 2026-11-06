"""Verify the actual deployed application tracker, without signing in or writing data."""
import hashlib
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def _verify():
    origin = 'https://linkedin.claudecowork.workers.dev'
    root = Path(__file__).resolve().parents[1]
    for name in ('job-applications.js', 'job-applications.css'):
        expected = (root / name).read_bytes()
        version = hashlib.sha256(expected).hexdigest()
        request = Request(f'{origin}/{name}?verify={version}', headers={'Cache-Control': 'no-cache'})
        with urlopen(request, timeout=20) as response:
            actual = response.read()
            if response.status != 200 or hashlib.sha256(actual).hexdigest() != version:
                raise RuntimeError(f'Production asset mismatch: {name}')
    with urlopen(Request(origin + '/', headers={'Cache-Control': 'no-cache'}), timeout=20) as response:
        page = response.read().decode('utf-8')
        if 'job-applications.js?v=13' not in page or 'job-applications.css?v=11' not in page:
            raise RuntimeError('Production homepage is missing application tracking assets')
    try:
        with urlopen(origin + '/auth/preferences?since=0', timeout=20):
            raise RuntimeError('Private preferences unexpectedly accepted an anonymous request')
    except HTTPError as error:
        if error.code != 401:
            raise


def verify(report=print):
    try:
        _verify()
        return True
    except HTTPError as error:
        body = error.read(4096).decode('utf-8', 'replace')
        if error.code == 403 and 'error code: 1010' in body.lower():
            report('::warning::Cloudflare 1010 blocked this automated client. Live application assets were NOT verified; Wrangler reports publication separately. No security settings were changed.')
            return False
        raise


if __name__ == '__main__':
    for attempt in range(3):
        try:
            if verify():
                print('Production application assets match this deployment; personal data requires sign-in.')
            break
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2)

