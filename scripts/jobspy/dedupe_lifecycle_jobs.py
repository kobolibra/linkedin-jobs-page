#!/usr/bin/env python3
import argparse,json,re
from pathlib import Path

def key(row):
    raw=str(row.get('sourceJobId') or row.get('link') or '').strip()
    m=re.search(r'(?:li-|ln:)?(\d{7,})',raw)
    return m.group(1) if m else raw

def score(row):
    return sum(bool(row.get(k)) for k in ('descriptionHtml','descriptionText','sourceJobId','companyCanonical','firstSeen','jobspyFirstSeen','fetchedAt','detailStatus'))

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--input',required=True);ap.add_argument('--output',required=True);a=ap.parse_args()
    doc=json.loads(Path(a.input).read_text(encoding='utf-8')); rows=doc if isinstance(doc,list) else doc.get('jobs',[])
    groups={}
    for row in rows:
        k=key(row)
        if k: groups.setdefault(k,[]).append(row)
    out=[]
    for k,items in groups.items():
        ordered=sorted(items,key=score,reverse=True); merged=dict(ordered[0])
        for item in reversed(ordered):
            for field,value in item.items():
                if value not in (None,''): merged[field]=value
        merged['sourceJobId']=merged.get('sourceJobId') or f'li-{k}'
        # A row observed in the current incremental batch is active; otherwise preserve expiry.
        if any(item.get('jobStatus')=='active' for item in items):
            merged['jobStatus']='active'; merged.pop('expiredAt',None); merged.pop('expiredReason',None)
        out.append(merged)
    result=dict(doc) if isinstance(doc,dict) else {'schemaVersion':'2.0'}
    result['jobs']=out;result['count']=len(out);result['dedupeByLinkedInId']=True
    Path(a.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'before':len(rows),'after':len(out),'removed':len(rows)-len(out)}))
if __name__=='__main__':main()
