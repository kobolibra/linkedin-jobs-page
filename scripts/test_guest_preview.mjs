import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {previewData,publicPreviewPayload,buildGuestPreview} from './guest_preview.mjs';
const now=Date.parse('2026-10-21T10:00:00Z');
function fixture(){const jobs=[];for(const location of ['CN','HK','SG'])for(let i=0;i<8;i++)jobs.push({title:location+' Analyst '+i,company:'Bank '+i,location,city:'City',link:'https://www.linkedin.com/jobs/view/'+(1000000+jobs.length),firstSeen:`2026-10-${String(20-i).padStart(2,'0')}`,pushTime:'2026-10-21T09:00:00Z',private:'MUST_NOT_PUBLISH'});return {jobs,companyLogos:{},dataVersion:'main-version',private:'TOP_SECRET'};}
test('guest preview takes the first 12 in homepage order, without per-region quotas',()=>{const index=fixture();index.jobs.push({...index.jobs[0],title:'Expired role',jobStatus:'expired',firstSeen:'2026-10-21'});const data=previewData(index,{},now);assert.equal(data.jobs.length,12);assert.equal(data.total,24);assert.deepEqual(data.jobs.map(j=>j.region),Array.from({length:12},(_,i)=>['CN','HK','SG'][i%3]));assert.ok(!JSON.stringify(data).includes('MUST_NOT_PUBLISH'));});
test('guest selection follows firstSeen day, not later repost date',()=>{const index=fixture();index.jobs.forEach((job,i)=>{job.firstSeen=`2026-10-${String(30-i).padStart(2,'0')}`;job.postingLastDate=`2026-10-${String(21-i%7).padStart(2,'0')}`;job.pushTime=new Date(Date.parse('2026-10-21T09:00:00Z')+i*60000).toISOString();});const data=previewData(index,{},now),rank={CN:0,HK:1,SG:2};const expected=index.jobs.map((job,index)=>({job,index})).sort((a,b)=>Date.parse(b.job.firstSeen)-Date.parse(a.job.firstSeen)||Date.parse(b.job.pushTime)-Date.parse(a.job.pushTime)||(rank[a.job.location]-rank[b.job.location])||a.index-b.index).slice(0,12).map(x=>x.job.title);assert.deepEqual(data.jobs.map(j=>j.title),expected);const payload=publicPreviewPayload(data,index);assert.ok(payload.jobs.every(j=>j.postingLastDate));});
test('guest first-seen buckets use UTC+8 across midnight',()=>{const index=fixture();index.jobs[0].firstSeen='2026-10-20T16:05:00Z';index.jobs[0].pushTime='2026-10-20T16:05:00Z';index.jobs[0].postingLastDate='2026-10-21';const result=previewData(index,{},Date.parse('2026-10-20T16:30:00Z'));assert.equal(result.days.at(-1).day,'2026-10-21');assert.equal(result.days.at(-1).count,1);assert.equal(result.jobs.find(j=>j.title===index.jobs[0].title).date,'2026-10-21');});
test('guest overview retains initial-day and repost-day separately for all charts',()=>{
 const index=fixture();index.jobs[0].firstSeen='2026-10-02';index.jobs[0].postingLastDate='2026-10-21';
 const data=previewData(index,{},now),payload=publicPreviewPayload(data,index);
 const row=payload.previewOverview.chartBuckets.find(b=>b[1]===index.jobs[0].company&&b[0]===index.jobs[0].location);
 assert.equal(row[2],'2026-10-21','posting-event chart keeps latest publication day');
 assert.equal(row[7],'2026-10-02','all age/lifetime charts keep original firstSeen');
 const guestScript=readFileSync(new URL('../auth-guest.js',import.meta.url),'utf8');
 assert.match(guestScript,/firstSeen:firstSeen\|\|''/);
 assert.match(guestScript,/ageDays\(j\.firstSeen\)/);
});
test('Market Breadth preview counts retained closed roles only on firstSeen date',()=>{
 const index=fixture();
 index.jobs[0].company='HSBC';index.jobs[0].firstSeen='2026-10-02';
 index.jobs[0].postingLastDate='2026-10-21';
 index.jobs.push({...index.jobs[0],link:'https://www.linkedin.com/jobs/view/9999999',jobStatus:'expired',postingLastDate:'2026-10-20'});
 const payload=publicPreviewPayload(previewData(index,{},now),index);
 const buckets=payload.previewOverview.marketBreadthBuckets;
 const original=buckets.find(row=>row[0]==='CN'&&row[1]==='HSBC'&&row[2]==='2026-10-02');
 assert.equal(original?.[3],2,'closing or reposting does not change initial-day count');
 assert.equal(buckets.filter(row=>row[1]==='HSBC'&&row[2]==='2026-10-21').length,0);
 assert.ok(!JSON.stringify(payload).includes('MUST_NOT_PUBLISH'));
 assert.equal(payload.previewOverview.chartBuckets.reduce((n,row)=>n+row[5],0),24,'public posting cohorts remain active-only');
});
test('refresh and query changes cannot rotate the public selection',()=>{const index=fixture();assert.deepEqual(previewData(index,{},now).jobs,previewData(index,{},now+86400000).jobs);});
test('same index schema feeds the existing renderer but excludes full descriptions and private metadata',()=>{const index=fixture(),details={details:{'ln:1000000':{descriptionHtml:'<script>SECRET()</script><p>'+('Useful work. '.repeat(80))+'</p>',jevInput:{secret:'PRIVATE_JEV'}}}};const payload=publicPreviewPayload(previewData(index,details,now),index),json=JSON.stringify(payload);assert.equal(payload.jobs.length,12);assert.equal(payload.previewOverview.total,24);assert.equal(payload.previewOverview.chartBuckets.reduce((n,b)=>n+b[5],0),24);assert.ok(payload.previewOverview.chartBuckets.every(b=>b.length===8));assert.ok(payload.dataVersion.startsWith('preview-'));assert.ok(!['MUST_NOT_PUBLISH','TOP_SECRET','SECRET()','PRIVATE_JEV','Useful work. '.repeat(30)].some(x=>json.includes(x)));assert.ok(payload.jobs.every(j=>!('descriptionHtml' in j)&&!('description' in j)));assert.ok(payload.jobs.every(j=>j.previewSnippet.length<=241));});
test('empty input stays empty and no second HTML page is generated',()=>{const root=mkdtempSync(join(tmpdir(),'shared-preview-'));try{writeFileSync(join(root,'jobs-index.json'),JSON.stringify({jobs:[]}));const payload=buildGuestPreview(root);assert.equal(payload.jobs.length,0);assert.equal(payload.previewOverview.total,0);assert.deepEqual(JSON.parse(readFileSync(join(root,'preview-index.json'),'utf8')),payload);}finally{rmSync(root,{recursive:true,force:true});}});
test('guest mode bypasses full-index cache and signed-in mode reuses one prepared request',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const loader=readFileSync(new URL('../job-store.js',import.meta.url),'utf8');
 assert.match(app,/window\.__jobsIndexDocument\|\|window\.JobIndexStore\.load\(\)/);
 assert.match(loader,/if\(document.documentElement.dataset.authState==='guest'\)return fetcher\(\);/);
 assert.match(loader,/authState==='guest'\?"\/api\/public-preview":"jobs-index.json"/);
 assert.ok(!readFileSync(new URL('../index.html',import.meta.url),'utf8').includes('/guest.html'));
});

test('Last Updated prefers canonical source when the newest job pushTime has no HH:mm',()=>{
 const index=fixture();
 index.jobs.forEach(job=>{job.pushTime='2026-10-21';});
 index.updatedAt='2026-10-21T09:14:25.000Z';
 const preview=publicPreviewPayload(previewData(index,{},now),index);
 assert.equal(preview.previewOverview.updated,'2026-10-21T09:14:25.000Z');
 delete index.updatedAt;
 assert.equal(previewData(index,{},now).updated,'2026-10-20T16:00:00.000Z','legacy fallback cannot recover the missing observation time');
});

test('confirmed job replacements stay in the authenticated index',()=>{
 const index=fixture();
 index.linkedinJobReplacements={'ln:1234567':'ln:1234568'};
 const payload=publicPreviewPayload(previewData(index,{},now),index);
 assert.equal(payload.linkedinJobReplacements,undefined);
});
