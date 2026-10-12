"""Cache verified LinkedIn employer logos; never mutate job records."""
import argparse, hashlib, io, json, re, shutil, time, unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageOps

ALIASES={'jpmorganchase':'JPMorgan Chase','jpmorgan':'JPMorgan Chase','bnp':'BNP Paribas','bnpparibas':'BNP Paribas','societegenerale':'Societe Generale','dbs':'DBS Bank','dbsbank':'DBS Bank','deutschebank':'Deutsche Bank','goldmansachs':'Goldman Sachs','blackrock':'BlackRock','blackrockassetmanagement':'BlackRock'}
Image.MAX_IMAGE_PIXELS=4000000

# Verified historical display names, scoped to logo identity only.
LOGO_IDENTITIES={'ateca':'ateca executive search','charterhouse partnership | asia':'charterhouse partnership','drake international singapore':'drake international – singapore','efg international':'efg private banking'}
LOGO_IDENTITIES.update({'mercer':('marsh','marsh people solutions'),'oaktree capital management, l.p.':'oaktree','orion james':'orion james limited','privee associates':'privee associates limited','verition fund management llc':'verition'})
PARSER_VERSION=3

def supported_names(expected):
    k=key(expected);aliases=LOGO_IDENTITIES.get(k,())
    return {k,*(aliases if isinstance(aliases,tuple) else (aliases,))}

def is_placeholder(img):
    if not img: return False
    url=img.get('data-delayed-url') or img.get('src','')
    ghost=img.get('data-ghost-url')
    return bool(url and ((ghost and url==ghost) or (urlsplit(url).hostname=='static.licdn.com' and '/aero-v1/sc/h/' in urlsplit(url).path)))

def key(name):
    raw=str(name or '').strip()
    folded=re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',raw).encode('ascii','ignore').decode().lower())
    raw=ALIASES.get(folded,raw)
    return re.sub(r'\s+',' ',unicodedata.normalize('NFKC',raw).lower()).strip()

def read(path, default):
    return json.loads(Path(path).read_text()) if Path(path).exists() else default

def rows(doc): return doc if isinstance(doc,list) else doc.get('jobs',[])

def linkedin_url(url):
    p=urlsplit(str(url)); return p.scheme=='https' and (p.hostname=='linkedin.com' or str(p.hostname).endswith('.linkedin.com'))

def image_url(url):
    p=urlsplit(str(url)); return p.scheme=='https' and (p.hostname=='media.licdn.com' or bool(re.fullmatch(r'media-exp\d+\.licdn\.com',p.hostname or '')))

def extract(html, expected):
    soup=BeautifulSoup(html,'html.parser')
    org=soup.select_one('a.topcard__org-name-link')
    observed=key(org.get_text(' ',strip=True)) if org else ''
    expected_key=key(expected)
    if not org or observed not in supported_names(expected): return None
    company_url=org.get('href','').split('?')[0]
    if not linkedin_url(company_url) or not re.match(r'^/(company|school|showcase)/[^/]+/?$',urlsplit(company_url).path): return None
    top=org.find_parent(class_='top-card-layout') or soup
    img=top.select_one('img.artdeco-entity-image')
    if not img or is_placeholder(img): return None
    url=img.get('data-delayed-url') or img.get('src','')
    if not image_url(url) or not re.search(r'/(company-logo_|school-logo_|img-crop_)',urlsplit(url).path): return None
    return url,company_url

def thumbnail(raw):
    if len(raw)>1000000: raise ValueError('image too large')
    with Image.open(io.BytesIO(raw)) as im:
        if im.width*im.height>4000000 or min(im.size)<8: raise ValueError('invalid dimensions')
        im=ImageOps.exif_transpose(im).convert('RGBA')
        im.thumbnail((64,64),Image.Resampling.LANCZOS)
        canvas=Image.new('RGBA',(64,64),(255,255,255,0));canvas.alpha_composite(im,((64-im.width)//2,(64-im.height)//2))
        out=io.BytesIO();canvas.save(out,'WEBP',quality=85,method=4)
        data=out.getvalue()
        if len(data)>12000: raise ValueError('thumbnail exceeds budget')
        return data

def candidates(jobs, rss, state, mode):
    grouped={}
    for row in rows(jobs):
        k=key(row.get('company'))
        if k and linkedin_url(row.get('link','')): grouped.setdefault(k,[]).append(row)
    wanted=set(grouped) if mode in ('bootstrap','repair') else {key(r.get('company')) for r in rows(rss)} & set(grouped)
    result=[]
    for k in sorted(wanted):
        old=state.get(k,{})
        if old.get('status')=='ready': continue
        # Retry failures only when RSS mentions the company again, after seven days.
        if old and mode!='repair':
            if mode=='bootstrap':
                if old.get('parserVersion',1)>=PARSER_VERSION: continue
            else:
                checked=datetime.fromisoformat(old['checkedAt'])
                if (datetime.now(timezone.utc)-checked).total_seconds()<7*86400: continue
        group=sorted(grouped[k],key=lambda r:(r.get('jobStatus')!='expired',str(r.get('pushTime') or r.get('firstSeen') or '')),reverse=True)
        corrective=mode=='repair' or (mode=='bootstrap' and old and old.get('parserVersion',1)<PARSER_VERSION)
        result.append((k,group[:6] if corrective else group[:2]))
    return result

def fetch_bytes(session,url,limit):
    with session.get(url,timeout=(15,15),stream=True) as response:
        response.raise_for_status()
        allowed=image_url if image_url(url) else linkedin_url
        if not allowed(response.url): raise ValueError('unexpected redirect')
        data=bytearray()
        for chunk in response.iter_content(16384):
            data.extend(chunk)
            if len(data)>limit: raise ValueError('response too large')
        return bytes(data)

def collect(args):
    state=read(args.state,{})
    batch=candidates(read(args.jobs,{}),read(args.rss,{}),state,args.mode)
    out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    changes={};blocked=0;stats={'candidates':len(batch),'downloaded':0,'missing':0,'placeholders':0,'blocked':0}
    started=time.monotonic()
    with requests.Session() as session:
        session.headers.update({'User-Agent':'Mozilla/5.0','Accept-Language':'en-US,en;q=0.9'})
        for k,group in batch[:args.limit]:
            if time.monotonic()-started>2400: break
            entry={'name':group[0]['company'],'checkedAt':datetime.now(timezone.utc).isoformat(),'status':'missing','parserVersion':PARSER_VERSION,'attempts':[]}
            for row in group:
                try:
                    link=row['link'].split('?')[0]
                    match=re.search(r'(\d+)(?:/)?$',urlsplit(link).path)
                    if not match:
                        entry['attempts'].append({'reason':'invalid_job_link'});continue
                    html=fetch_bytes(session,'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/'+match[1],1500000)
                    found=extract(html.decode('utf-8','replace'),row['company'])
                    if not found:
                        soup=BeautifulSoup(html,'html.parser');org=soup.select_one('a.topcard__org-name-link')
                        observed=org.get_text(' ',strip=True) if org else ''
                        top=(org.find_parent(class_='top-card-layout') or soup) if org else soup
                        placeholder=is_placeholder(top.select_one('img.artdeco-entity-image'))
                        matched=org and key(observed) in supported_names(row['company'])
                        entry['attempts'].append({'jobId':match[1],'reason':'no_employer' if not org else 'name_mismatch' if not matched else 'placeholder_image' if placeholder else 'no_supported_image','observedName':observed,'companyUrl':org.get('href','').split('?')[0] if org else ''})
                        if matched and placeholder:
                            entry['status']='placeholder';break
                        continue
                    data=thumbnail(fetch_bytes(session,found[0],1000000))
                    filename=hashlib.sha256(data).hexdigest()[:24]+'.webp'
                    (out/filename).write_bytes(data)
                    entry.update(status='ready',asset=filename,companyUrl=found[1],sourceJobId=match[1]);blocked=0;break
                except requests.HTTPError as error:
                    entry['attempts'].append({'jobId':match[1],'reason':'http_error','status':error.response.status_code})
                    if error.response.status_code in (403,429,999):
                        blocked+=1;stats['blocked']+=1;break
                except (requests.RequestException,ValueError,OSError,Image.DecompressionBombError) as error:
                    entry['attempts'].append({'jobId':match[1],'reason':type(error).__name__})
                finally: time.sleep(args.delay)
            changes[k]=entry
            stats['downloaded' if entry['status']=='ready' else 'missing']+=1
            if entry['status']=='placeholder': stats['placeholders']+=1
            print(json.dumps({'company':entry['name'],'status':entry['status']}),flush=True)
            if blocked>=5: break  # No challenge retries or alternate routes.
    (out/'updates.json').write_text(json.dumps(changes,ensure_ascii=False,indent=2)+'\n')
    (out/'report.json').write_text(json.dumps(stats,indent=2)+'\n')
    print(json.dumps(stats),flush=True)

def apply(args):
    out=Path(args.apply);updates=read(out/'updates.json',{})
    state=read(args.state,{})
    dest=Path(args.assets);dest.mkdir(parents=True,exist_ok=True)
    for k,entry in updates.items():
        old=state.get(k,{})
        if old.get('status')=='ready' or old.get('checkedAt','')>entry['checkedAt']: continue
        if entry['status']=='ready':
            filename=entry['asset']
            if not re.fullmatch(r'[a-f0-9]{24}\.webp',filename): raise ValueError('unsafe asset name')
            shutil.copyfile(out/filename,dest/filename)
        state[k]=entry
    Path(args.state).parent.mkdir(parents=True,exist_ok=True)
    Path(args.state).write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n')
    manifest={k:'assets/company-logos/'+entry['asset'] for k,entry in sorted(state.items()) if entry.get('status')=='ready' and (dest/entry['asset']).is_file()}
    Path(args.manifest).write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n')
    print(json.dumps({'known':len(state),'ready':len(manifest),'missing':len(state)-len(manifest)}))

def main():
    p=argparse.ArgumentParser();p.add_argument('--mode',choices=['bootstrap','rss','repair'],default='rss');p.add_argument('--jobs',default='jobs.json');p.add_argument('--rss',default='data/n8n/rss-latest.json');p.add_argument('--state',default='data/company-logos/state.json');p.add_argument('--assets',default='assets/company-logos');p.add_argument('--manifest',default='company-logos.json');p.add_argument('--output',default='/tmp/company-logos');p.add_argument('--apply');p.add_argument('--limit',type=int,default=1000);p.add_argument('--delay',type=float,default=1)
    args=p.parse_args();apply(args) if args.apply else collect(args)
if __name__=='__main__': main()
