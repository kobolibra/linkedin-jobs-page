import json, re, sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def load(p):
    d=json.loads(Path(p).read_text(encoding='utf-8'))
    return d if isinstance(d,list) else d.get('jobs',[])
def jid(x):
    s=str(x.get('sourceJobId') or x.get('link') or '')
    m=re.search(r'(\d{7,})',s)
    return m.group(1) if m else ''

def report(label, rows):
    ids=[jid(x) for x in rows]
    dup=len(ids)-len(set(i for i in ids if i))
    bad_company_city=[x for x in rows if str(x.get('company') or '').strip() and str(x.get('city') or '').strip().casefold()==str(x.get('company') or '').strip().casefold()]
    no_link=[x for x in rows if not x.get('link')]
    print(label, 'rows=',len(rows),'unique_ids=',len(set(i for i in ids if i)),'duplicate_ids=',dup,'no_link=',len(no_link),'company_as_city=',len(bad_company_city),'jd=',sum(bool(str(x.get('descriptionText') or x.get('description') or '').strip()) for x in rows),'html=',sum(bool(str(x.get('descriptionHtml') or '').strip()) for x in rows),'city=',sum(bool(str(x.get('city') or '').strip()) for x in rows))

report('jobs.json',load(ROOT/'jobs.json'))
for p in sorted((ROOT/'data/jobspy').glob('*final.json')):
    report(p.name,load(p))
print('--- target company rows in jobs.json ---')
rows=load(ROOT/'jobs.json')
for c in ['HSBC','Standard Chartered','Citi','JPMorganChase','JPMorgan Chase','BNP Paribas','Societe Generale','DBS Bank','Deutsche Bank','Goldman Sachs','BlackRock']:
    r=[x for x in rows if x.get('company')==c]
    if r: report(c,r)
print('--- invalid target IDs by independent files ---')
for p in sorted((ROOT/'data/jobspy').glob('*final.json')):
    for x in load(p):
        if not jid(x): print(p.name,'missing id',x.get('title'))
