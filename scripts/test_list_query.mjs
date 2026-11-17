import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const ctx={};vm.runInNewContext(readFileSync(new URL('../list-query.js',import.meta.url),'utf8'),ctx);const {query,ageMatch}=ctx.JobListQuery;
test('data filtering preserves all combinations, active totals and company age distribution',()=>{
 const records=Array.from({length:12000},(_,i)=>({id:String(i),comp:'C'+i%17,title:i%2?'risk analyst':'manager',search:'risk analyst manager city'+i%9,city:'city'+i%9,region:['CN','HK','SG'][i%3],age:i%40,status:i%5?'active':'expired'}));
 for(let n=0;n<240;n++){const state={favorites:['3','6','9','30','33'],blocked:n%7?[]:['C0','C3'],keywords:n%13?[]:['manager'],region:n%4?['CN','HK','SG'][n%3]:'all',city:n%6?'all':'city3',company:n%5?'all':'C3',favoriteOnly:n%11===0,activeOnly:n%2===0,age:['all','1-7','8-14','22+'][n%4],q:n%9?'':'analyst'};
 const base=records.filter(r=>!state.blocked.includes(r.comp)&&!state.keywords.some(k=>r.title.includes(k))&&(state.region==='all'||r.region===state.region)&&(state.city==='all'||r.city===state.city)&&(state.company==='all'||r.comp===state.company)&&(!state.favoriteOnly||state.favorites.includes(r.id))&&(!state.q||r.search.includes(state.q)));
 const expected=base.filter(r=>(!state.activeOnly||r.status!=='expired')&&ageMatch(state.age,r.age));const actual=query(records,state);
 assert.deepEqual(Array.from(actual.indices),expected.map(r=>+r.id));assert.equal(actual.active,expected.filter(r=>r.status!=='expired').length);assert.deepEqual(Array.from(actual.company),state.company==='all'?[]:base.map(r=>+r.id));
 }
});
test('missing dates remain excluded from bounded age filters',()=>{assert.equal(ageMatch('all',null),true);assert.equal(ageMatch('1-7',null),false);assert.equal(ageMatch('22+',22),true);});
test('versioned deployment strips only tracking keys, preserves job identity, and rebuilds deterministically',async()=>{
 const {mkdtempSync,writeFileSync,readFileSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{embedCompanyLogos}=await import('./build_jd_shards.mjs');const root=mkdtempSync(join(tmpdir(),'index-revision-'));try{const index=join(root,'jobs-index.json'),manifest=join(root,'company-logos.json'),state=join(root,'state.json');writeFileSync(index,JSON.stringify({jobs:[{link:'https://hk.linkedin.com/jobs/view/12345678?position=3&currentJobId=12345678&refId=abc&trackingId=def&pageNum=9',title:'Risk Analyst'},{link:'https://example.com/jobs?trackingId=keep'}]}));writeFileSync(manifest,'{}');writeFileSync(state,'{}');embedCompanyLogos(index,manifest,state);const doc=JSON.parse(readFileSync(index));assert.equal(doc.jobs[0].link,'https://hk.linkedin.com/jobs/view/12345678?currentJobId=12345678');assert.equal(doc.jobs[1].link,'https://example.com/jobs?trackingId=keep');assert.match(doc.dataVersion,/^[a-f0-9]{64}$/);assert.equal(JSON.parse(readFileSync(join(root,'jobs-version.json'))).dataVersion,doc.dataVersion);const first=readFileSync(index,'utf8');embedCompanyLogos(index,manifest,state);assert.equal(readFileSync(index,'utf8'),first);doc.jobs[0].title='Senior Risk Analyst';writeFileSync(index,JSON.stringify(doc));embedCompanyLogos(index,manifest,state);assert.notEqual(JSON.parse(readFileSync(index)).dataVersion,doc.dataVersion);}finally{rmSync(root,{recursive:true,force:true});}
});

test('diagnostic: identify Deutsche Bank Shanghai CFO saved-role IDs in canonical index',()=>{
 const {readFileSync}=require('node:fs');
 const index=JSON.parse(readFileSync(new URL('../jobs-index.json',import.meta.url),'utf8'));
 const rows=index.jobs.filter(j=>/deutsche/i.test(j.company||'')&&/CFO.*Financial.*Reporting|Financial Reporting.*(?:Manager|Specialist)/i.test(j.title||''));
 console.log('DIAG_DEUTSCHE_CFO',JSON.stringify(rows.map(j=>({id:(String(j.link).match(/\/jobs\/view\/(\d+)/)||[])[1],title:j.title,firstSeen:j.firstSeen,postingLastDate:j.postingLastDate,pushTime:j.pushTime,jobStatus:j.jobStatus,location:j.location,city:j.city}))));
});
