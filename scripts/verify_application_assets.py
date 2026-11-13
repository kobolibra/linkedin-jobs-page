"""Verify deployed assets AND live RSS-derived public preview before declaring success.

The full jobs index is authenticated. The public-preview route exposes a
bounded, redacted sample plus a version/role count, so it is safe to confirm
the deployed dataset without signing in or publishing private job details.
"""
import hashlib
import json
import re
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ORIGIN = 'https://linkedin.claudecowork.workers.dev'
# The default Python-urllib User-Agent is blocked by workers.dev Browser
# Integrity Check (Cloudflare 1010). Use a truthful, descriptive verifier UA.
HEADERS = {'Cache-Control': 'no-cache', 'User-Agent': 'NextJourney-DeployVerifier/1.0'}
LINKEDIN_JOB = re.compile(r'^https://(?:[a-z]{2,3}\\.)?linkedin\\.com/jobs/view/', re.I)


def request(url):
    return Request(url, headers=HEADERS)


def _expected_public_total(index):
    return sum(
        1 for job in index['jobs']
        if isinstance(job, dict)
        and job.get('jobStatus') != 'expired'
        and job.get('location') in ('CN', 'HK', 'SG')
        and job.get('title') and job.get('company')
        and LINKEDIN_JOB.match(str(job.get('link') or ''))
    )


def _verify():
    root = Path(__file__).resolve().parents[1]
    index = json.loads((root / 'jobs-index.json').read_text('utf-8'))
    version_doc = json.loads((root / 'jobs-version.json').read_text('utf-8'))
    version = index.get('dataVersion')
    expected_total = _expected_public_total(index)
    if not isinstance(version, str) or not re.fullmatch(r'[a-f0-9]{64}', version):
        raise RuntimeError('Invalid local jobs index version')
    if version_doc.get('dataVersion') != version or expected_total <= 0:
        raise RuntimeError('Local index/version mismatch or empty jobs dataset')

    for name in ('job-applications.js', 'job-applications.css'):
        expected = (root / name).read_bytes()
        digest = hashlib.sha256(expected).hexdigest()
        with urlopen(request(f'{ORIGIN}/{name}?verify={digest}'), timeout=20) as response:
            actual = response.read()
            if response.status != 200 or hashlib.sha256(actual).hexdigest() != digest:
                raise RuntimeError(f'Production asset mismatch: {name}')

    with urlopen(request(ORIGIN + '/'), timeout=20) as response:
        page = response.read().decode('utf-8')
        if response.status != 200 or 'job-applications.js?v=17' not in page or 'job-applications.css?v=19' not in page:
            raise RuntimeError('Production homepage is missing application tracking assets')

    # This endpoint is expressly public and exposes no protected job index.
    # Exact version and eligible-role count prove the deployment contains the
    # freshly published RSS dataset, not merely a successful Worker upload.
    with urlopen(request(f'{ORIGIN}/api/public-preview?verify={version}'), timeout=20) as response:
        if response.status != 200:
            raise RuntimeError('Production public preview is unavailable')
        preview = json.loads(response.read().decode('utf-8'))
        jobs = preview.get('jobs')
        overview = preview.get('previewOverview') or {}
        if preview.get('dataVersion') != 'preview-' + version:
            raise RuntimeError('Production jobs version does not match the canonical RSS index')
        if not isinstance(jobs, list) or not 0 < len(jobs) <= 12:
            raise RuntimeError('Production jobs preview is empty or exceeds its public limit')
        if overview.get('total') != expected_total:
            raise RuntimeError('Production jobs count does not match the canonical RSS index')
        if any('descriptionHtml' in item or 'description' in item for item in jobs):
            raise RuntimeError('Production preview unexpectedly contains private descriptions')
    print(f'Production RSS payload verified: {expected_total} eligible roles, version {version[:16]}')

    try:
        with urlopen(request(ORIGIN + '/auth/preferences?since=0'), timeout=20):
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
            report('::error::Cloudflare 1010 blocked deployment verification. Live app and RSS payload were NOT verified. This must not be reported as a completed release.')
            return False
        raise


if __name__ == '__main__':
    for attempt in range(3):
        try:
            if not verify():
                raise RuntimeError('Live RSS payload verification blocked by Cloudflare')
            print('Production application assets AND published RSS job data verified.')
            break
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2)
