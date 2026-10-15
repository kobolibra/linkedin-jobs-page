"""Resolve daily batches from run creation time, unaffected by runner queue delays."""
from __future__ import annotations
import argparse
import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

UTC = timezone.utc
BJT = timezone(timedelta(hours=8))


def execution_plan(created_at, *, daily=True, manual_scope='cn'):
    if manual_scope not in ('cn', 'expanded'):
        raise ValueError('Unsupported manual scope')
    if not daily:
        return {'scope':manual_scope, 'probe_liveness':'true', 'batch_bjt':'manual'}
    stamp=datetime.fromisoformat(str(created_at).replace('Z','+00:00'))
    if stamp.tzinfo is None:
        raise ValueError('Run creation time must include timezone')
    stamp=stamp.astimezone(BJT)
    slots=[(stamp+timedelta(days=day)).replace(hour=hour,minute=16,second=0,microsecond=0)
           for day in (-1,0,1) for hour in (5,11,17,23)]
    slot=min(slots,key=lambda item:abs((item-stamp).total_seconds()))
    expanded=slot.hour in (5,17)
    return {'scope':'expanded' if expanded else 'cn',
            'probe_liveness':'false' if expanded else 'true',
            'batch_bjt':slot.isoformat()}


def run_created_at():
    repo=os.environ['GITHUB_REPOSITORY']
    run=os.environ['GITHUB_RUN_ID']
    token=os.environ['GITHUB_TOKEN']
    # Never derive a batch from job start time: a queued 05:16 run may start later.
    request=Request(f'https://api.github.com/repos/{repo}/actions/runs/{run}',
                    headers={'Authorization':'Bearer '+token, 'Accept':'application/vnd.github+json'})
    for attempt in range(3):
        try:
            with urlopen(request,timeout=20) as response:
                return json.load(response)['created_at']
        except (HTTPError, URLError) as exc:
            if (isinstance(exc,HTTPError) and exc.code < 500) or attempt == 2:
                raise
            time.sleep(attempt+1)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--daily-plan',choices=('true','false'),default='true')
    parser.add_argument('--scope',choices=('cn','expanded'),default='cn')
    parser.add_argument('--created-at')
    args=parser.parse_args()
    daily=args.daily_plan == 'true'
    plan=execution_plan((args.created_at or run_created_at()) if daily else None,
                        daily=daily,manual_scope=args.scope)
    output=os.environ.get('GITHUB_OUTPUT')
    if output:
        with Path(output).open('a',encoding='utf-8') as handle:
            handle.write(''.join(f'{key}={value}\n' for key,value in plan.items()))
    print('Execution plan: '+json.dumps(plan,ensure_ascii=False))
    return 0


if __name__ == '__main__': raise SystemExit(main())
