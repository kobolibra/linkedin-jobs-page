import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const ctx={};vm.runInNewContext(readFileSync(new URL('../list-query.js',import.meta.url),'utf8'),ctx);const {query,ageMatch}=ctx.JobListQuery;
test('data filtering preserves all combinations, active totals and company age distribution',()=>{
 const records=Array.from({length:12000},(_,i)=>({id:String(i),comp:'C'+i%17,title:i%2?'risk analyst':'manager',search:'risk analyst manager city'+i%9,city:'city'+i%9,region:['CN','HK','SG'][i%3],age:i%105,status:i%5?'active':'expired'}));
 for(let n=0;n<240;n++){const state={favorites:['3','6','9','30','33'],blocked:n%7?[]:['C0','C3'],keywords:n%13?[]:['manager'],region:n%4?['CN','HK','SG'][n%3]:'all',city:n%6?'all':'city3',company:n%5?'all':'C3',favoriteOnly:n%11===0,activeOnly:n%2===0,age:['all','1-7','8-14','22-28','29-35','36-42','43-49','50-56','57-63','64-70','71+'][n%11],q:n%9?'':'analyst'};
 const base=records.filter(r=>!state.blocked.includes(r.comp)&&!state.keywords.some(k=>r.title.includes(k))&&(state.region==='all'||r.region===state.region)&&(state.city==='all'||r.city===state.city)&&(state.company==='all'||r.comp===state.company)&&(!state.favoriteOnly||state.favorites.includes(r.id))&&(!state.q||r.search.includes(state.q)));
 const expected=base.filter(r=>(!state.activeOnly||r.status!=='expired')&&ageMatch(state.age,r.age));const actual=query(records,state);
 assert.deepEqual(Array.from(actual.indices),expected.map(r=>+r.id));assert.equal(actual.active,expected.filter(r=>r.status!=='expired').length);assert.deepEqual(Array.from(actual.company),state.company==='all'?[]:base.map(r=>+r.id));
 }
});
test('missing dates remain excluded from bounded age filters',()=>{assert.equal(ageMatch('all',null),true);assert.equal(ageMatch('1-7',null),false);assert.equal(ageMatch('22+',22),true);});

test('age badges and all-time selector partition every day through 10 weeks, including boundaries',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const select=html.match(/<select[^>]*id="age"[^>]*>(.*?)<\\/select>/)?.[1];
 assert.ok(select,'age filter must remain in the main toolbar');
 const options=[...select.matchAll(/<option value="([^"]+)"([^>]*)>([^<]*)<\\/option>/g)]
   .map(([,value,flags,label])=>({value,label,hidden:/\\bhidden\\b/.test(flags)}));
 const bins=[
   ['0','今天',0,0],['1-7','1 周内',1,7],['8-14','2 周内',8,14],
   ['15-21','3 周内',15,21],['22-28','4 周内',22,28],
   ['29-35','5 周内',29,35],['36-42','6 周内',36,42],
   ['43-49','7 周内',43,49],['50-56','8 周内',50,56],
   ['57-63','9 周内',57,63],['64-70','10 周内',64,70],
   ['71+','10 周+',71,Infinity]
 ];
 assert.deepEqual(options.filter(x=>!x.hidden).map(x=>[x.value,x.label]),
   [['all','全部时间'],...bins.map(([v,label])=>[v,label])]);
 const fromApp=name=>{
   const declaration=app.match(new RegExp('^const '+name+'=.*;, preserves job identity, and rebuilds deterministically',async()=>{
 const {mkdtempSync,writeFileSync,readFileSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{embedCompanyLogos}=await import('./build_jd_shards.mjs');const root=mkdtempSync(join(tmpdir(),'index-revision-'));try{const index=join(root,'jobs-index.json'),manifest=join(root,'company-logos.json'),state=join(root,'state.json');writeFileSync(index,JSON.stringify({jobs:[{link:'https://hk.linkedin.com/jobs/view/12345678?position=3&currentJobId=12345678&refId=abc&trackingId=def&pageNum=9',title:'Risk Analyst'},{link:'https://example.com/jobs?trackingId=keep'}]}));writeFileSync(manifest,'{}');writeFileSync(state,'{}');embedCompanyLogos(index,manifest,state);const doc=JSON.parse(readFileSync(index));assert.equal(doc.jobs[0].link,'https://hk.linkedin.com/jobs/view/12345678?currentJobId=12345678');assert.equal(doc.jobs[1].link,'https://example.com/jobs?trackingId=keep');assert.match(doc.dataVersion,/^[a-f0-9]{64}$/);assert.equal(JSON.parse(readFileSync(join(root,'jobs-version.json'))).dataVersion,doc.dataVersion);const first=readFileSync(index,'utf8');embedCompanyLogos(index,manifest,state);assert.equal(readFileSync(index,'utf8'),first);doc.jobs[0].title='Senior Risk Analyst';writeFileSync(index,JSON.stringify(doc));embedCompanyLogos(index,manifest,state);assert.notEqual(JSON.parse(readFileSync(index)).dataVersion,doc.dataVersion);}finally{rmSync(root,{recursive:true,force:true});}
});

,'m'))?.[0];
   assert.ok(declaration,'app.js must define '+name);
   return vm.runInNewContext(declaration+'\\n'+name);
 };
 const appMatch=fromApp('ageMatch'),ageLabel=fromApp('ageLabel');
 for(let day=0;day<=140;day++){
   const expected=day===0?'今天':day>=71?'10周+':Math.ceil(day/7)+'周内';
   assert.equal(ageLabel(day),expected,'age badge at day '+day);
   const selected=bins.filter(([value,,min,max])=>{
     const matched=day>=min&&day<=max;
     assert.equal(ageMatch(value,day),matched,'query age bucket '+value+' day '+day);
     assert.equal(appMatch(value,day),matched,'fallback age bucket '+value+' day '+day);
     return matched;
   });
   assert.equal(selected.length,1,'each age must belong to exactly one bucket: '+day);
 }
 assert.equal((app.match(/ageLabel\\(_ad\\)/g)||[]).length,2,
   'desktop and mobile badges must share the same age label function');
 assert.doesNotMatch(app,/3周\\+/);
 assert.equal(ageMatch('71+',null),false);
 assert.equal(ageMatch('all',null),true);
 assert.equal(appMatch('71+',71),true);
 assert.equal(appMatch('71+',70),false);
 // Company Insight still clicks its 22+ aggregate; keep a hidden selector value.
 assert.deepEqual(options.filter(x=>x.hidden).map(x=>[x.value,x.label]),[['22+','4 周及以上']]);
 assert.equal(ageMatch('22+',21),false);
 assert.equal(ageMatch('22+',22),true);
 assert.equal(appMatch('22+',70),true);
});

test('versioned deployment strips only tracking keys, preserves job identity, and rebuilds deterministically',async()=>{
 const {mkdtempSync,writeFileSync,readFileSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{embedCompanyLogos}=await import('./build_jd_shards.mjs');const root=mkdtempSync(join(tmpdir(),'index-revision-'));try{const index=join(root,'jobs-index.json'),manifest=join(root,'company-logos.json'),state=join(root,'state.json');writeFileSync(index,JSON.stringify({jobs:[{link:'https://hk.linkedin.com/jobs/view/12345678?position=3&currentJobId=12345678&refId=abc&trackingId=def&pageNum=9',title:'Risk Analyst'},{link:'https://example.com/jobs?trackingId=keep'}]}));writeFileSync(manifest,'{}');writeFileSync(state,'{}');embedCompanyLogos(index,manifest,state);const doc=JSON.parse(readFileSync(index));assert.equal(doc.jobs[0].link,'https://hk.linkedin.com/jobs/view/12345678?currentJobId=12345678');assert.equal(doc.jobs[1].link,'https://example.com/jobs?trackingId=keep');assert.match(doc.dataVersion,/^[a-f0-9]{64}$/);assert.equal(JSON.parse(readFileSync(join(root,'jobs-version.json'))).dataVersion,doc.dataVersion);const first=readFileSync(index,'utf8');embedCompanyLogos(index,manifest,state);assert.equal(readFileSync(index,'utf8'),first);doc.jobs[0].title='Senior Risk Analyst';writeFileSync(index,JSON.stringify(doc));embedCompanyLogos(index,manifest,state);assert.notEqual(JSON.parse(readFileSync(index)).dataVersion,doc.dataVersion);}finally{rmSync(root,{recursive:true,force:true});}
});

