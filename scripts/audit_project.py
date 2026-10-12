"""Validate canonical identities and published logo assets without changing data."""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts/jobspy'))
from linkedin_ids import linkedin_job_id


def audit(root):
    doc = json.loads((root / 'jobs.json').read_text(encoding='utf-8'))
    rows = doc if isinstance(doc, list) else doc.get('jobs', [])
    problems = []
    seen = set()
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            problems.append(f'row {index}: invalid object')
            continue
        link = str(row.get('link') or '')
        parsed = urlsplit(link)
        key = linkedin_job_id(link)
        source = linkedin_job_id(row.get('sourceJobId'))
        if parsed.scheme != 'https' or not (parsed.hostname == 'linkedin.com' or str(parsed.hostname).endswith('.linkedin.com')) or not key:
            problems.append(f'row {index}: invalid LinkedIn link')
        if source and key != source:
            problems.append(f'row {index}: source/link identity mismatch')
        if key in seen:
            problems.append(f'row {index}: duplicate LinkedIn ID {key}')
        seen.add(key)
        if row.get('jobStatus') not in (None, 'active', 'expired'):
            problems.append(f'row {index}: invalid lifecycle status')
        if row.get('jobStatus') == 'expired' and not row.get('expiredAt'):
            problems.append(f'row {index}: expired without timestamp')
    if isinstance(doc, dict) and doc.get('count') != len(rows):
        problems.append('canonical count differs from rows')
    catalog_path = root / 'company-logos.json'
    catalog = json.loads(catalog_path.read_text()) if catalog_path.exists() else {}
    for company, value in catalog.items():
        if not isinstance(value, str) or not re.fullmatch(r'assets/company-logos/[a-f0-9]{24}\.(webp|svg)', value):
            problems.append(f'{company}: unsafe logo asset path')
            continue
        asset = root / value
        if not asset.is_file():
            problems.append(f'{company}: missing logo asset')
        elif hashlib.sha256(asset.read_bytes()).hexdigest()[:24] != asset.stem:
            problems.append(f'{company}: logo asset hash mismatch')
    return {'jobs': len(rows), 'uniqueIds': len(seen), 'logos': len(catalog),
            'problems': problems, 'problemCount': len(problems)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--strict', action='store_true')
    args = parser.parse_args()
    result = audit(ROOT)
    print(json.dumps(result, ensure_ascii=False))
    return int(args.strict and bool(result['problems']))


if __name__ == '__main__':
    raise SystemExit(main())
