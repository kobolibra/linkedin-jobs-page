"""Cache verified LinkedIn employer logos; never mutate job records."""
import argparse, hashlib, io, json, re, shutil, time, unicodedata
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageOps

from jobspy.logo_sources import extract, key, linkedin_url, image_url, logo_image_url, validate_hint, supported_names
from logo_http import RequestPolicy, CollectionStopped, RateLimitStopped

Image.MAX_IMAGE_PIXELS=4000000
PARSER_VERSION=5

def read(path, default):
    return json.loads(Path(path).read_text()) if Path(path).exists() else default

def rows(doc): return doc if isinstance(doc,list) else doc.get('jobs',[])

def placeholder_svg(raw):
    # LinkedIn's default employer image is SVG. Preserve its actual shapes,
    # accepting only inert, bounded vector markup without external references.
    if len(raw)>12000 or b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper(): raise ValueError('unsafe placeholder SVG')
    try: root=ET.fromstring(raw)
    except ET.ParseError as error: raise ValueError('invalid placeholder SVG') from error
    ns='http://www.w3.org/2000/svg'
    if root.tag!='{'+ns+'}svg' or not re.fullmatch(r'[\d.eE+\-\s,]+',root.get('viewBox','')): raise ValueError('invalid placeholder SVG root')
    viewbox=[float(n) for n in root.get('viewBox').replace(',',' ').split()]
    if len(viewbox)!=4 or not (8<=viewbox[2]<=4096 and 8<=viewbox[3]<=4096): raise ValueError('invalid placeholder SVG dimensions')
    tags={'svg','g','path','rect','circle','ellipse','line','polygon','polyline'}
    attrs={'viewBox','width','height','id','d','fill','fill-rule','stroke','stroke-width','stroke-linecap','stroke-linejoin','opacity','fill-opacity','stroke-opacity','transform','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','points'}
    nodes=list(root.iter())
    if len(nodes)>150: raise ValueError('placeholder SVG exceeds budget')
    for node in nodes:
        if node.tag not in {'{'+ns+'}'+tag for tag in tags} or any(a not in attrs for a in node.attrib): raise ValueError('unsupported placeholder SVG markup')
        for attr in ('fill','stroke'):
            if attr in node.attrib and not re.fullmatch(r'#[a-fA-F0-9]{3,8}|[a-zA-Z]+',node.attrib[attr]): raise ValueError('unsafe placeholder SVG paint')
    ET.register_namespace('',ns)
    return ET.tostring(root,encoding='utf-8')

def cached_image(raw, placeholder):
    if placeholder and raw.lstrip().startswith(b'<'): return placeholder_svg(raw),'svg'
    return thumbnail(raw),'webp'

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
    # Every RSS publication retries all retained companies without a cached
    # logo, even when the latest RSS batch does not mention them. Keep the rss
    # argument for compatibility; canonical jobs determine the candidate set.
    wanted=set(grouped)
    result=[]
    for k in sorted(wanted,key=lambda k:(state.get(k,{}).get("checkedAt", ""),k)):
        old=state.get(k,{})
        if old.get('status')=='ready': continue
        # Bootstrap revisits failures after parser upgrades. RSS and explicit
        # repair runs retry unresolved entries without a cooldown. Legacy
        # placeholder records remain unresolved until their image is cached.
        if old and mode=='bootstrap' and old.get('parserVersion',1)>=PARSER_VERSION: continue
        group=sorted(grouped[k],key=lambda r:(r.get('jobStatus')!='expired',str(r.get('pushTime') or r.get('firstSeen') or '')),reverse=True)
        corrective=mode=='repair' or (mode=='bootstrap' and old and old.get('parserVersion',1)<PARSER_VERSION)
        result.append((k,group[:6] if corrective else group[:2]))
    return result

def fetch_bytes(session,url,limit):
    with (session.logo_policy.get(session,url) if hasattr(session,"logo_policy") else session.get(url,timeout=(15,15),stream=True)) as response:
        response.raise_for_status()
        allowed=logo_image_url if logo_image_url(url) else linkedin_url
        if not allowed(response.url): raise ValueError('unexpected redirect')
        data=bytearray()
        for chunk in response.iter_content(16384):
            data.extend(chunk)
            if len(data)>limit: raise ValueError('response too large')
        return bytes(data)

def collect(args):
    state=read(args.state,{})
    batch=candidates(read(args.jobs,{}),None,state,args.mode)
    out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    changes={};images={};blocked=0;stop_reason=None
    stats={'candidates':len(batch),'downloaded':0,'missing':0,'placeholders':0,'blocked':0,'reusedSources':0}
    policy=RequestPolicy(time.monotonic()+2400,attempts=getattr(args,'http_attempts',3),base_delay=getattr(args,'retry_base',15))
    with requests.Session() as session:
        session.logo_policy=policy
        session.headers.update({'User-Agent':'Mozilla/5.0','Accept-Language':'en-US,en;q=0.9'})
        def save_image(source,entry,job_id):
            url=source['url']
            if url not in images: images[url]=cached_image(fetch_bytes(session,url,1000000),source['imageKind']=='placeholder')
            data,extension=images[url]
            filename=hashlib.sha256(data).hexdigest()[:24]+'.'+extension
            (out/filename).write_bytes(data)
            entry.update(status='ready',asset=filename,imageKind=source['imageKind'],sourceUrl=url,companyUrl=source['companyUrl'],sourceJobId=job_id)
        for k,group in batch[:args.limit]:
            if policy.clock()>=policy.deadline: stop_reason='collection time budget exhausted';break
            entry={'name':group[0]['company'],'checkedAt':datetime.now(timezone.utc).isoformat(),'status':'missing','parserVersion':PARSER_VERSION,'attempts':[]}
            event_start=len(policy.events)
            for row in group:
                job_id='';stage='job'
                try:
                    link=row['link'].split('?')[0]
                    match=re.search(r'(\d+)(?:/)?$',urlsplit(link).path)
                    if not match:
                        entry['attempts'].append({'reason':'invalid_job_link'});continue
                    job_id=match[1]
                    hint=row.get('companyLogoSource')
                    if validate_hint(hint,row['company'],link):
                        stage='image'
                        try:
                            save_image(hint,entry,job_id);stats['reusedSources']+=1;blocked=0;break
                        except requests.HTTPError as error:
                            if error.response.status_code not in (404,410): raise
                            entry['attempts'].append({**(policy.last or {}),'jobId':job_id,'reason':'stale_image_source','stage':'image'})
                    stage='job'
                    html=fetch_bytes(session,'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/'+job_id,1500000)
                    found=extract(html.decode('utf-8','replace'),row['company'])
                    if not found:
                        soup=BeautifulSoup(html,'html.parser');org=soup.select_one('a.topcard__org-name-link')
                        observed=org.get_text(' ',strip=True) if org else ''
                        blocked_page=bool(soup.select_one('.authwall, #challenge, form.login__form, input[name=session_key]'))
                        reason='login_or_challenge' if blocked_page else 'no_employer' if not org else 'name_mismatch' if key(observed) not in supported_names(row['company']) else 'no_supported_image'
                        entry['attempts'].append({**(policy.last or {}),'jobId':job_id,'reason':reason,'stage':'job','observedName':observed,'companyUrl':org.get('href','').split('?')[0] if org else ''})
                        if blocked_page: stop_reason='LinkedIn returned a login or challenge page';break
                        continue
                    stage='image'
                    save_image({'url':found[0],'companyUrl':found[1],'imageKind':'placeholder' if found[2] else 'company'},entry,job_id)
                    blocked=0;break
                except RateLimitStopped as error:
                    stats['blocked']+=1;stop_reason=str(error)
                    entry['attempts'].append({**(policy.last or {}),'jobId':job_id,'reason':'rate_limited','stage':stage});break
                except CollectionStopped as error:
                    stop_reason=str(error);entry['attempts'].append({'jobId':job_id,'reason':'collection_budget','stage':stage});break
                except requests.HTTPError as error:
                    entry['attempts'].append({**(policy.last or {}),'jobId':job_id,'reason':'http_error','status':error.response.status_code,'stage':stage})
                    if error.response.status_code in (403,429,999): blocked+=1;stats['blocked']+=1;break
                except (requests.RequestException,ValueError,OSError,Image.DecompressionBombError) as error:
                    entry['attempts'].append({'jobId':job_id,'reason':type(error).__name__,'stage':stage})
                finally:
                    if not stop_reason: time.sleep(args.delay)
            if len(policy.events)>event_start: entry['httpRetries']=policy.events[event_start:]
            changes[k]=entry
            stats['downloaded' if entry['status']=='ready' else 'missing']+=1
            if entry.get('imageKind')=='placeholder': stats['placeholders']+=1
            print(json.dumps({'company':entry['name'],'status':entry['status']}),flush=True)
            if stop_reason or blocked>=5: break
    stats['httpRetries']=sum(bool(event.get('retried')) for event in policy.events)
    if stop_reason: stats['stoppedReason']=stop_reason
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
            if not re.fullmatch(r'[a-f0-9]{24}\.(webp|svg)',filename): raise ValueError('unsafe asset name')
            shutil.copyfile(out/filename,dest/filename)
        state[k]=entry
    Path(args.state).parent.mkdir(parents=True,exist_ok=True)
    Path(args.state).write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n')
    manifest={k:'assets/company-logos/'+entry['asset'] for k,entry in sorted(state.items()) if entry.get('status')=='ready' and (dest/entry['asset']).is_file()}
    Path(args.manifest).write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n')
    print(json.dumps({'known':len(state),'ready':len(manifest),'missing':len(state)-len(manifest)}))

def main():
    p=argparse.ArgumentParser();p.add_argument('--mode',choices=['bootstrap','rss','repair'],default='rss');p.add_argument('--jobs',default='jobs.json');p.add_argument('--rss',default='data/n8n/rss-latest.json');p.add_argument('--state',default='data/company-logos/state.json');p.add_argument('--assets',default='assets/company-logos');p.add_argument('--manifest',default='company-logos.json');p.add_argument('--output',default='/tmp/company-logos');p.add_argument('--apply');p.add_argument('--limit',type=int,default=1000);p.add_argument('--delay',type=float,default=1);p.add_argument('--http-attempts',type=int,default=3);p.add_argument('--retry-base',type=float,default=15)
    args=p.parse_args();apply(args) if args.apply else collect(args)
if __name__=='__main__': main()
