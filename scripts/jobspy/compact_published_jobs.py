#!/usr/bin/env python3
import json
from pathlib import Path

path = Path('jobs.json')
doc = json.loads(path.read_text(encoding='utf-8'))
removed = 0
for job in doc.get('jobs', []):
    # The browser keeps descriptionHtml for rich JD rendering and can derive
    # plain text when descriptionText is absent. Avoid shipping both copies.
    if job.get('descriptionHtml') and job.pop('descriptionText', None) is not None:
        removed += 1
    # These are reconciliation/audit fields, not browser data dependencies.
    for key in ('expiredReason', 'jobspyFetchedAt', 'fetchedAt', 'detailFetchedAt',
                'jobspyFirstSeen', 'jobspyLastPosted', 'jobspyRepost',
                'missingSnapshotCount', 'detailError', 'dataSources'):
        job.pop(key, None)
path.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print('compacted_jobs', len(doc.get('jobs', [])), 'removed_descriptionText', removed, 'bytes', path.stat().st_size)
