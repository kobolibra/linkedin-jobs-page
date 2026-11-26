"""Freeze one RSS publication's inputs and merge them against current jobs.

Logo collection uses the same frozen batch as every Git publication retry, so
new staging data arriving during collection cannot bypass the logo step.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

# The publication script also runs directly as python scripts/rss_publication.py.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from reclassify import BLACKLIST as FINANCIAL_BLACKLIST, blacklist_records, protected_names

INPUTS = {
    'rss.json': 'data/n8n/rss-latest.json',
    'jobspy.json': 'data/jobspy/incremental/search_combined.json',
    'completed_at': 'data/jobspy/incremental/latest.completed_at',
    'liveness.json': 'data/jobspy/incremental/liveness.json',
}


def capture(root: Path, destination: Path):
    root, destination = root.resolve(), destination.resolve()
    if root == destination: raise ValueError('Publication inputs must be outside the checkout root')
    rss = json.loads((root / INPUTS['rss.json']).read_text(encoding='utf-8'))
    if not isinstance(rss, list) and not (isinstance(rss, dict) and isinstance(rss.get('jobs'), list)):
        raise ValueError('RSS input must contain jobs[]')
    destination.mkdir(parents=True, exist_ok=True)
    hashes = {}
    for name, relative in INPUTS.items():
        target=destination/name;target.unlink(missing_ok=True)
        source=root/relative
        if source.is_file() and source.stat().st_size:
            data=source.read_bytes();target.write_bytes(data)
            hashes[name]=hashlib.sha256(data).hexdigest()
    (destination/'inputs.json').write_text(json.dumps({'sha256':hashes},indent=2)+'\n',encoding='utf-8')
    return hashes



TARGET_HISTORY = 'reports/cumulative-target-companies.tsv'
TARGET_QUARANTINE = 'data/target-filter-quarantine.json'


def target_company_key(value: object) -> str:
    """Exact employer-name matching, ignoring Unicode width/case/whitespace only."""
    return ' '.join(unicodedata.normalize('NFKC', str(value or '')).casefold().split())


def read_target_history(path: Path) -> set[str]:
    """Load the Agent's cumulative TARGET TSV (never the financial blacklist)."""
    with path.open(encoding='utf-8-sig', newline='') as source:
        reader = csv.DictReader(source, delimiter='\t')
        if not reader.fieldnames or not {'公司名', '备注'} <= set(reader.fieldnames):
            raise ValueError(f'Target history lacks 公司名 column: {path}')
        names = set()
        for row in reader:
            if None in row or not target_company_key(row.get('公司名')):
                raise ValueError(f'Invalid target company history row: {path}')
            reason = (row['备注'] or '').strip()
            if reason and reason != '待查证' and not reason.startswith('crypto/blockchain (always included)'):
                names.add(target_company_key(row['公司名']))
    return names


def protected_financial_names(path: Path) -> set[str]:
    """Veto deletion for confirmed finance/recruiting firms; never delete from this list."""
    return protected_names(blacklist_records(json.loads(path.read_text(encoding='utf-8'))))


def effective_target_names(root: Path) -> set[str]:
    return read_target_history(root/TARGET_HISTORY) - protected_financial_names(root/FINANCIAL_BLACKLIST)


def job_identity(row: dict) -> str:
    raw = str(row.get('sourceJobId') or row.get('link') or '').split('?', 1)[0].rstrip('/')
    found = re.search(r'(?:^|[-/])(\d{9,})$', raw)
    return found.group(1) if found else raw


def load_quarantine(path: Path) -> list[dict]:
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data, dict) or not isinstance(data.get('jobs'), list):
        raise ValueError(f'Invalid target-company quarantine: {path}')
    if not all(isinstance(row, dict) and row.get('company') and job_identity(row) for row in data['jobs']):
        raise ValueError(f'Invalid target-company quarantine record: {path}')
    return data['jobs']


def restore_reclassified_jobs(baseline: Path, root: Path, output: Path) -> Path:
    """Restore previously suppressed jobs before n8n blocklist is applied again."""
    blocked_targets = effective_target_names(root)
    archived = load_quarantine(root/TARGET_QUARANTINE)
    eligible = [row for row in archived if target_company_key(row.get('company')) not in blocked_targets]
    if not eligible:
        return baseline
    data = json.loads(baseline.read_text(encoding='utf-8'))
    if not isinstance(data, dict) or not isinstance(data.get('jobs'), list):
        raise ValueError('Canonical baseline must contain jobs[]')
    existing = {job_identity(row) for row in data['jobs']}
    restored = 0
    for row in eligible:
        key = job_identity(row)
        if key not in existing:
            data['jobs'].append(row)
            existing.add(key)
            restored += 1
    data['count'] = len(data['jobs'])
    output.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'Target-company reclassification recovery: {restored} archived jobs restored before n8n blocklist')
    return output


def filter_target_history(merged: Path, root: Path, output: Path,
                          quarantine_output: Path | None = None) -> None:
    """Remove TARGET companies only, preserving a private recoverable archive."""
    targets = effective_target_names(root)
    doc = json.loads(merged.read_text(encoding='utf-8'))
    if not isinstance(doc, dict) or not isinstance(doc.get('jobs'), list):
        raise ValueError('Merged canonical document must contain jobs[]')
    kept = [row for row in doc['jobs'] if target_company_key(row.get('company')) not in targets]
    removed_rows = [row for row in doc['jobs'] if target_company_key(row.get('company')) in targets]
    if removed_rows:
        doc['jobs'] = kept
        doc['count'] = len(kept)
        output.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    else:
        shutil.copyfile(merged, output)

    if quarantine_output is not None:
        previous = load_quarantine(root/TARGET_QUARANTINE)
        archive = {}
        for row in previous + removed_rows:
            if target_company_key(row.get('company')) in targets:
                archive[job_identity(row)] = row
        quarantine_output.parent.mkdir(parents=True, exist_ok=True)
        quarantine_output.write_text(
            json.dumps({'schemaVersion': '1.0', 'jobs': list(archive.values())},
                       ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
        print(f'Target-company quarantine: {len(archive)} recoverable jobs retained')
    print(f'Target-company history filter: {len(targets)} effective names, '
          f'{len(removed_rows)} jobs removed '
          f'({len(read_target_history(root/TARGET_HISTORY)) - len(targets)} financial names protected)')


def merge(root: Path, inputs: Path, output: Path, quarantine_output: Path | None = None):
    root, inputs, output = root.resolve(), inputs.resolve(), output.resolve()
    hashes=json.loads((inputs/'inputs.json').read_text(encoding='utf-8'))['sha256']
    for name,digest in hashes.items():
        if hashlib.sha256((inputs/name).read_bytes()).hexdigest()!=digest:
            raise ValueError('Frozen publication input changed: '+name)
    if 'rss.json' not in hashes: raise ValueError('Frozen RSS input missing')
    output.parent.mkdir(parents=True,exist_ok=True)
    scripts=Path(__file__).resolve().parent/'jobspy'
    def run(script,*args):
        subprocess.run([sys.executable,str(scripts/script),*map(str,args)],cwd=root,check=True)
    with tempfile.TemporaryDirectory(prefix='rss-merge-',dir=output.parent) as directory:
        work=Path(directory);baseline=root/'jobs.json'
        baseline=restore_reclassified_jobs(baseline,root,work/'recovered-baseline.json')
        if 'jobspy.json' in hashes and 'completed_at' in hashes:
            observed=(inputs/'completed_at').read_text(encoding='utf-8').strip()
            run('track_jd_changes.py','--existing',baseline,'--snapshot',inputs/'jobspy.json',
                '--observed-at',observed,'--output',work/'tracked.json')
            run('reconcile_full_snapshots.py','--existing',baseline,'--snapshot',work/'tracked.json',
                '--observed-at',observed,'--output',work/'jobspy.json')
            baseline=work/'jobspy.json'
        run('merge_n8n_incremental.py','--baseline',baseline,'--batch',inputs/'rss.json','--output',work/'rss.json')
        liveness = inputs/'liveness.json' if 'liveness.json' in hashes else work/'missing-liveness.json'
        run('apply_liveness.py','--jobs',work/'rss.json','--liveness',liveness,
            '--delete-after-days','15','--output',work/'liveness.json')
        filter_target_history(work/'liveness.json', root, output, quarantine_output)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,default=Path('.'))
    parser.add_argument('--inputs',type=Path,required=True)
    group=parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--capture',action='store_true')
    group.add_argument('--output',type=Path)
    parser.add_argument('--quarantine-output',type=Path)
    args=parser.parse_args()
    if args.capture: capture(args.root,args.inputs)
    else: merge(args.root,args.inputs,args.output,args.quarantine_output)


if __name__=='__main__':main()
