"""Freeze one RSS publication's inputs and merge them against current jobs.

Logo collection uses the same frozen batch as every Git publication retry, so
new staging data arriving during collection cannot bypass the logo step.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

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


def target_company_key(value: object) -> str:
    """Exact employer-name matching, ignoring Unicode width/case/whitespace only."""
    return ' '.join(unicodedata.normalize('NFKC', str(value or '')).casefold().split())


def read_target_history(path: Path) -> set[str]:
    """Load the Agent's cumulative TARGET TSV (never the financial blacklist)."""
    with path.open(encoding='utf-8-sig', newline='') as source:
        reader = csv.DictReader(source, delimiter='\t')
        if not reader.fieldnames or '公司名' not in reader.fieldnames:
            raise ValueError(f'Target history lacks 公司名 column: {path}')
        names = set()
        for row in reader:
            if None in row or not target_company_key(row.get('公司名')):
                raise ValueError(f'Invalid target company history row: {path}')
            names.add(target_company_key(row['公司名']))
    return names


def filter_target_history(merged: Path, history: Path, output: Path) -> None:
    """Hard-delete historical and incoming target-company jobs at publication."""
    targets = read_target_history(history)  # Missing/unreadable history must block publication.
    doc = json.loads(merged.read_text(encoding='utf-8'))
    if not isinstance(doc, dict) or not isinstance(doc.get('jobs'), list):
        raise ValueError('Merged canonical document must contain jobs[]')
    kept = [row for row in doc['jobs']
            if target_company_key(row.get('company')) not in targets]
    removed = len(doc['jobs']) - len(kept)
    if removed:
        doc['jobs'] = kept
        doc['count'] = len(kept)
        output.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    else:
        shutil.copyfile(merged, output)
    print(f'Target-company history filter: {len(targets)} names, {removed} jobs removed')


def merge(root: Path, inputs: Path, output: Path):
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
        if 'jobspy.json' in hashes and 'completed_at' in hashes:
            observed=(inputs/'completed_at').read_text(encoding='utf-8').strip()
            run('track_jd_changes.py','--existing',baseline,'--snapshot',inputs/'jobspy.json',
                '--observed-at',observed,'--output',work/'tracked.json')
            run('reconcile_full_snapshots.py','--existing',baseline,'--snapshot',work/'tracked.json',
                '--observed-at',observed,'--output',work/'jobspy.json')
            baseline=work/'jobspy.json'
        run('merge_n8n_incremental.py','--baseline',baseline,'--batch',inputs/'rss.json','--output',work/'rss.json')
        merged=work/'rss.json'
        if 'liveness.json' in hashes:
            run('apply_liveness.py','--jobs',merged,'--liveness',inputs/'liveness.json',
                '--delete-after-days','15','--output',work/'liveness.json')
            merged=work/'liveness.json'
        filter_target_history(merged, root/TARGET_HISTORY, output)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,default=Path('.'))
    parser.add_argument('--inputs',type=Path,required=True)
    group=parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--capture',action='store_true')
    group.add_argument('--output',type=Path)
    args=parser.parse_args()
    if args.capture: capture(args.root,args.inputs)
    else: merge(args.root,args.inputs,args.output)


if __name__=='__main__':main()
