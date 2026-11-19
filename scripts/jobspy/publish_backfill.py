"""Apply historical enrichment to the latest canonical rows without lifecycle resets."""
import argparse
import json
from pathlib import Path

from linkedin_ids import linkedin_job_id
from merge_n8n_incremental import blocklist_companies, normalize_company

SPECS = {
    'State Street': ('state_street', '1767'),
    'BNP Paribas': ('bnp_paribas', '166278'), 'Societe Generale': ('societe_generale', '1691'),
    'DBS Bank': ('dbs_bank', '163379'), 'Deutsche Bank': ('deutsche_bank', '1262'),
    'Goldman Sachs': ('goldman_sachs', '1382'), 'BlackRock': ('blackrock', '4764'),
    'Bank of America': ('bank_of_america', '1123'), 'Fidelity International': ('fidelity_international', '1313'),
}


def identity(row):
    return linkedin_job_id(row.get('sourceJobId') or row.get('link'))


def enrich(existing, incoming, blocked=(), *, state_street_post_date=False):
    result = dict(existing)
    rows = [dict(row) for row in existing['jobs']]
    by_id = {identity(row): row for row in rows if identity(row)}
    for source in incoming:
        key = identity(source)
        if not key or normalize_company(source.get('company')) in blocked:
            continue
        if key in by_id:
            current = by_id[key]
            # A historical fetch cannot replace newer JD, salary, status or dates.
            for field in ('descriptionHtml', 'descriptionText', 'city', 'locationRaw'):
                if not current.get(field) and source.get(field):
                    current[field] = source[field]
            current['dataSources'] = list(dict.fromkeys(list(current.get('dataSources') or []) + ['jobspy']))
        else:
            row = dict(source)
            row.update(sourceJobId='li-' + key, jobStatus='active')
            row.setdefault('firstSeen', row.get('datePosted') or row.get('fetchedAt'))
            row.setdefault('pushTime', row.get('fetchedAt') or row.get('datePosted'))
            if state_street_post_date and source.get('requestedCompany') == 'State Street':
                from posting_dates import posting_day
                posted = posting_day(source.get('datePosted'))
                if posted is None:
                    raise ValueError('State Street backfill requires source datePosted: ' + key)
                row['pushTime'] = posted.isoformat()
            row['dataSources'] = list(dict.fromkeys(list(row.get('dataSources') or []) + ['jobspy']))
            rows.append(row)
            by_id[key] = row
    result.update(jobs=rows, count=len(rows))
    return result


def write(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--normalized', required=True)
    parser.add_argument('--state-street-post-date', action='store_true')
    args = parser.parse_args()
    rows = json.loads(Path(args.normalized).read_text())['jobs']
    batch_path = Path('data/n8n/rss-latest.json')
    batch = json.loads(batch_path.read_text()) if batch_path.exists() else {}
    canonical = json.loads(Path('jobs.json').read_text())
    write('jobs.json', enrich(canonical, rows, blocklist_companies(batch), state_street_post_date=args.state_street_post_date))
    for company, (key, company_id) in SPECS.items():
        selected = [row for row in rows if row.get('requestedCompany') == company]
        if not selected:
            continue  # A targeted backfill must not erase other employers' baselines.
        write(f'data/jobspy/{key}_f_c_{company_id}_final.json',
              {'schemaVersion': '1.2', 'mode': 'historical-backfill', 'country': 'China',
               'company': company, 'companyId': company_id, 'count': len(selected), 'jobs': selected})
    unified = {}
    for path in sorted(Path('data/jobspy').glob('*_f_c_*_final.json')):
        for row in json.loads(path.read_text()).get('jobs', []):
            if identity(row):
                unified.setdefault(identity(row), row)
    write('data/jobspy/jobspy_baseline_final_unified.json',
          {'schemaVersion': '1.2', 'mode': 'historical-backfill-unified', 'country': 'China',
           'count': len(unified), 'jobs': list(unified.values())})


if __name__ == '__main__':
    main()
