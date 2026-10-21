import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const regions=['CN','HK','SG'];
const clean=(v,n=240)=>String(v??'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,n);
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>Number.isFinite(Date.parse(v))?Date.parse(v):0;
const number=v=>Number(v).toLocaleString('en-US');
export function previewData(index,details={},now=Date.now()){
 if(!Array.isArray(index.jobs))throw Error('Preview requires a valid index');
 const active=index.jobs.filter(j=>j&&j.jobStatus!=='expired'&&regions.includes(j.location)&&j.title&&j.company&&/^https:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/jobs\/view\//i.test(j.link||''));
 const ordered=[...active].sort((a,b)=>(date(b.firstSeen||b.pushTime)-date(a.firstSeen||a.pushTime))||String(a.link).localeCompare(String(b.link)));
 const selected=[],seen=new Set();
 for(const region of regions){let count=0;for(const j of ordered){if(j.location!==region||seen.has(j.link))continue;seen.add(j.link);selected.push(j);if(++count===4)break;}}
 selected.sort((a,b)=>(date(b.firstSeen||b.pushTime)-date(a.firstSeen||a.pushTime))||String(a.link).localeCompare(String(b.link)));
 const source=details.details||details;
 const jobs=selected.map(j=>{const match=j.link.match(/(?:-|\/)(\d{6,})(?:[/?#]|$)/),id=match?'ln:'+match[1]:'';const entry=id?source[id]:null;
  const raw=String(entry?.descriptionHtml||entry?.description||'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&[a-z0-9#]+;/gi,' ').replace(/\s+/g,' ').trim();
  const stamp=j.firstSeen||j.pushTime;
  return {id,title:clean(j.title,240),company:clean(j.company,160),region:j.location,city:clean(j.city||'',100),date:date(stamp)?new Date(stamp).toISOString().slice(0,10):'',snippet:raw?clean(raw,240)+(raw.length>240?'…':''):''};
 });
 const totals=Object.fromEntries(regions.map(r=>[r,active.filter(j=>j.location===r).length]));
 const days=Array.from({length:14},(_,i)=>{const start=new Date(now);start.setUTCHours(0,0,0,0);start.setUTCDate(start.getUTCDate()-(13-i));return {day:start.toISOString().slice(0,10),count:0};});
 for(const j of active){const time=date(j.firstSeen||j.pushTime);if(!time||time>now)continue;const day=new Date(time).toISOString().slice(0,10),bin=days.find(d=>d.day===day);if(bin)bin.count++;}
 const updated=Math.max(0,...active.map(j=>date(j.pushTime||j.firstSeen)));
 return {jobs,totals,total:active.length,companies:new Set(active.map(j=>j.company.trim().toLowerCase())).size,days,updated:updated?new Date(updated).toISOString():null};
}
export function publicPreviewPayload(data,index){
 const selected=new Map(data.jobs.map(j=>[j.id,j]));
 const jobs=[];const companyLogos={};
 for(const original of index.jobs){const match=String(original.link||'').match(/(?:-|\/)(\d{6,})(?:[/?#]|$)/),id=match?'ln:'+match[1]:'';const preview=selected.get(id);if(!preview)continue;
  const job={title:preview.title,company:preview.company,link:original.link,location:preview.region,firstSeen:preview.date,city:preview.city,hasJd:original.hasJd===true,jobStatus:'active',previewSnippet:preview.snippet};
  if(original.pushTime)job.pushTime=original.pushTime;
  if(typeof original.salary==='string'||typeof original.salary==='number')job.salary=original.salary;
  jobs.push(job);selected.delete(id);
  const key=preview.company.toLowerCase(),asset=index.companyLogos?.[key];if(/^assets\/company-logos\/[a-f0-9]{24}\.(svg|webp)$/.test(asset||''))companyLogos[key]=asset;
 }
 const buckets=new Map();
 for(const job of index.jobs){if(job.jobStatus==='expired'||!['CN','HK','SG'].includes(job.location))continue;const key=JSON.stringify([job.location,String(job.company||''),String(job.firstSeen||job.pushTime||''),String(job.city||''),String(job.locationRaw||''),String(job.pushTime||job.firstSeen||'')]);buckets.set(key,(buckets.get(key)||0)+1);}
 const chartBuckets=[...buckets].map(([key,count])=>[...JSON.parse(key).slice(0,5),count,JSON.parse(key)[5]]);
 return {schemaVersion:'1.1',source:'public-preview',jobs,companyLogos,companyLogoFallback:index.companyLogoFallback||'',previewOverview:{total:data.total,companies:data.companies,updated:data.updated,chartBuckets},dataVersion:'preview-'+String(index.dataVersion||'snapshot')};
}
export function buildGuestPreview(root='.'){
 const index=JSON.parse(readFileSync(resolve(root,'jobs-index.json'),'utf8'));
 const detailPath=resolve(root,'jobs-details.json'),details=existsSync(detailPath)?JSON.parse(readFileSync(detailPath,'utf8')):{};
 const payload=publicPreviewPayload(previewData(index,details),index);
 writeFileSync(resolve(root,'preview-index.json'),JSON.stringify(payload));return payload;
}
