import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),dates=require('../calendar-date.js');
const {FIRMS,firmIndex}=require('../market-width.js');
const regions=['CN','HK','SG'];
const clean=(v,n=240)=>String(v??'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,n);
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>Number.isFinite(dates.timestamp(v))?dates.timestamp(v):0;
const postedAt=j=>j.postingLastDate||j.firstSeen||j.pushTime;
const number=v=>Number(v).toLocaleString('en-US');
// New-role flow, shared definition with app.js weeklyFlow(): CN/HK/SG roles
// first recorded in the 7 local calendar days through today, including roles
// that have since closed; prior = the 7 days before that. The guest payload
// cannot carry closed roles, so the counts are computed here from the index.
export function weeklyFlow(jobs,now=Date.now()){
  const regions=["CN","HK","SG"],seen=new Set();
  const day=v=>dates.dayStart(dates.key(v));
  const end=dates.timestamp(now),endDay=day(now),week=7*864e5;
  if(!Number.isFinite(end)||!Number.isFinite(endDay))return null;
  let current=0,prior=0,valid=0;
  for(const j of jobs){
    if(!j||!regions.includes(j.location))continue;
    const key=j.link||JSON.stringify([j.company,j.title,j.firstSeen]);if(seen.has(key))continue;seen.add(key);
    const t=day(j.firstSeen);if(!Number.isFinite(t))continue;valid++;
    const age=endDay-t;if(age<0)continue;
    if(age<week)current++;else if(age<2*week)prior++;
  }
  return valid?{current,prior,end:new Date(end).toISOString()}:null;
}
export function previewData(index,details={},now=Date.now()){
 if(!Array.isArray(index.jobs))throw Error('Preview requires a valid index');
 const active=index.jobs.filter(j=>j&&j.jobStatus!=='expired'&&regions.includes(j.location)&&j.title&&j.company&&/^https:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/jobs\/view\//i.test(j.link||''));
 // Follow the homepage's original first-recorded day order; observation breaks
 // same-day ties. Never invent regional sample quotas.
 const rank={CN:0,HK:1,SG:2};
 const ordered=active.map((job,index)=>({job,index})).sort((a,b)=>{
  const time=date(b.job.firstSeen)-date(a.job.firstSeen);
  if(time)return time;
  const capture=date(b.job.pushTime||b.job.firstSeen)-date(a.job.pushTime||a.job.firstSeen);
  if(capture)return capture;
  const region=(rank[a.job.location]??9)-(rank[b.job.location]??9);
  return region||a.index-b.index;
 });
 const selected=[],seen=new Set();
 for(const {job} of ordered){if(seen.has(job.link))continue;seen.add(job.link);selected.push(job);if(selected.length===12)break;}
 const source=details.details||details;
 const jobs=selected.map(j=>{const match=j.link.match(/(?:-|\/)(\d{6,})(?:[/?#]|$)/),id=match?'ln:'+match[1]:'';const entry=id?source[id]:null;
  const raw=String(entry?.descriptionHtml||entry?.description||'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&[a-z0-9#]+;/gi,' ').replace(/\s+/g,' ').trim();
  const stamp=j.firstSeen;
  return {id,title:clean(j.title,240),company:clean(j.company,160),region:j.location,city:clean(j.city||'',100),date:dates.key(stamp),snippet:raw?clean(raw,240)+(raw.length>240?'…':''):''};
 });
 const totals=Object.fromEntries(regions.map(r=>[r,active.filter(j=>j.location===r).length]));
 const today=dates.key(now),days=Array.from({length:14},(_,i)=>({day:dates.addDays(today,i-13),count:0}));
 for(const j of active){const day=dates.key(postedAt(j)),time=dates.dayStart(day);if(!Number.isFinite(time)||time>now)continue;const bin=days.find(d=>d.day===day);if(bin)bin.count++;}
 const updated=Math.max(0,...active.map(j=>date(j.pushTime||j.firstSeen)));
 // Prefer the exact source-observation timestamp forwarded from jobs.json.
 // Legacy date-only job fields do not supply an HH:mm.
 const observed=typeof index.updatedAt==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(index.updatedAt)
   &&Number.isFinite(dates.timestamp(index.updatedAt))?index.updatedAt:null;
 return {jobs,totals,total:active.length,companies:new Set(active.map(j=>j.company.trim().toLowerCase())).size,days,updated:observed||(updated?new Date(updated).toISOString():null),weekly:weeklyFlow(index.jobs,now)};
}
export function publicPreviewPayload(data,index){
 const selected=new Map(data.jobs.map(j=>[j.id,j]));
 const jobs=[];const companyLogos={};
 for(const original of index.jobs){const match=String(original.link||'').match(/(?:-|\/)(\d{6,})(?:[/?#]|$)/),id=match?'ln:'+match[1]:'';const preview=selected.get(id);if(!preview)continue;
  const job={title:preview.title,company:preview.company,link:original.link,location:preview.region,firstSeen:original.firstSeen||null,city:preview.city,locationRaw:String(original.locationRaw||''),hasJd:original.hasJd===true,jobStatus:'active',previewSnippet:preview.snippet};
  if(original.pushTime)job.pushTime=original.pushTime;
  if(original.postingLastDate)job.postingLastDate=original.postingLastDate;
  if(original.salary!=null)job.salary=original.salary;
  jobs.push(job);selected.delete(id);
  const key=preview.company.toLowerCase(),asset=index.companyLogos?.[key];if(/^assets\/company-logos\/[a-f0-9]{24}\.(svg|webp)$/.test(asset||''))companyLogos[key]=asset;
 }
 const buckets=new Map();
 for(const job of index.jobs){if(job.jobStatus==='expired'||!['CN','HK','SG'].includes(job.location))continue;const key=JSON.stringify([job.location,String(job.company||''),String(postedAt(job)||''),String(job.city||''),String(job.locationRaw||''),String(job.pushTime||job.firstSeen||''),String(job.firstSeen||'')]);buckets.set(key,(buckets.get(key)||0)+1);}
 // Carry original firstSeen separately from latest posting day. Guests need both clocks:
  // lifetime charts/list age from firstSeen; publication flow from latest posting.
  const chartBuckets=[...buckets].map(([key,count])=>{const fields=JSON.parse(key);return [...fields.slice(0,5),count,fields[5],fields[6]];});
 // Only aggregate, public 18-firm first-recorded dates; include retained closed roles.
 const breadth=new Map();
 for(const job of index.jobs){
  if(!job||!regions.includes(job.location))continue;
  const firm=firmIndex(job.company),day=dates.key(job.firstSeen);
  if(firm<0||!day)continue;
  const key=JSON.stringify([job.location,FIRMS[firm],day]),entry=breadth.get(key)||{count:0,pushTime:''};
  entry.count++;
  if(date(job.pushTime)>date(entry.pushTime))entry.pushTime=job.pushTime;
  breadth.set(key,entry);
 }
 const marketBreadthBuckets=[...breadth].map(([key,entry])=>[...JSON.parse(key),entry.count,entry.pushTime]);
 return {schemaVersion:'1.1',source:'public-preview',jobs,companyLogos,companyLogoFallback:index.companyLogoFallback||'',previewOverview:{total:data.total,companies:data.companies,updated:data.updated,weekly:data.weekly,chartBuckets,marketBreadthBuckets,postingHistoryDaily:index.postingHistoryDaily||null},dataVersion:'preview-'+String(index.dataVersion||'snapshot')};
}
export function buildGuestPreview(root='.'){
 const index=JSON.parse(readFileSync(resolve(root,'jobs-index.json'),'utf8'));
 const detailPath=resolve(root,'jobs-details.json'),details=existsSync(detailPath)?JSON.parse(readFileSync(detailPath,'utf8')):{};
 const payload=publicPreviewPayload(previewData(index,details),index);
 writeFileSync(resolve(root,'preview-index.json'),JSON.stringify(payload));return payload;
}
