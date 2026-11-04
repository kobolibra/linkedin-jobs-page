import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const indexSource=readFileSync(new URL('../job-store.js',import.meta.url),'utf8');
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const guestbook=readFileSync(new URL('../guestbook.js',import.meta.url),'utf8');
function indexHarness(fetch){
  const context={AbortController,TextDecoder,setTimeout,clearTimeout,fetch,document:{documentElement:{dataset:{authState:'authenticated'}}}};
  vm.createContext(context);
  vm.runInContext(indexSource.slice(indexSource.indexOf('async function fetchJobsIndex('),indexSource.indexOf('const valid=')),context);
  return context.fetchJobsIndex;
}
test('stalled index requests abort and reject after bounded retries',async()=>{
  let requests=0,aborts=0;
  const load=indexHarness((_url,options)=>{
    requests++;
    options.signal.addEventListener('abort',()=>aborts++);
    return new Promise(()=>{});
  });
  await assert.rejects(load({attemptTimeouts:[5,5],retryDelay:1}),/timeout/);
  assert.equal(requests,2);
  assert.equal(aborts,2);
});
test('index retry covers a failed response and a stalled JSON body',async()=>{
  let requests=0;
  const load=indexHarness(async()=>{
    requests++;
    return requests===1?{ok:true,json:()=>new Promise(()=>{})}:{ok:true,json:async()=>({jobs:[{title:'Ready'}]})};
  });
  const result=await load({attemptTimeouts:[5,20],retryDelay:1});
  assert.equal(result.jobs[0].title,'Ready');
  assert.equal(requests,2);
});
test('progressing index chunks may exceed the idle interval without restarting the download',async()=>{
  let requests=0,aborts=0;
  const bytes=new TextEncoder().encode(JSON.stringify({jobs:[{title:'Slow mobile network'}]}));
  const load=indexHarness(async(_url,options)=>{
    requests++;options.signal.addEventListener('abort',()=>aborts++);
    let offset=0;
    return {ok:true,body:{getReader:()=>({async read(){await new Promise(resolve=>setTimeout(resolve,6));if(offset>=bytes.length)return {done:true};const value=bytes.slice(offset,offset+8);offset+=8;return {done:false,value};},releaseLock(){}})}};
  });
  const data=await load({attemptTimeouts:[250],idleTimeout:20,retryDelay:1});
  assert.equal(data.jobs[0].title,'Slow mobile network');assert.equal(requests,1);assert.equal(aborts,0);
});
test('an index body that stops sending chunks aborts before the total deadline',async()=>{
  let aborted=false;
  const load=indexHarness(async(_url,options)=>{options.signal.addEventListener('abort',()=>aborted=true);return {ok:true,body:{getReader:()=>({read:()=>new Promise(()=>{}),releaseLock(){}})}};});
  await assert.rejects(load({attemptTimeouts:[1000],idleTimeout:5}),/timeout/);assert.equal(aborted,true);
});
test('denied browser storage and corrupt list preferences do not break initialization',()=>{
  const context={};
  Object.defineProperty(context,'localStorage',{get(){throw new Error('denied');}});
  Object.defineProperty(context,'sessionStorage',{get(){throw new Error('denied');}});
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function storageGet('),source.indexOf('const IC=')),context);
  assert.equal(context.storageGet('theme'),null);
  assert.deepEqual(Array.from(context.storageList('favs')),[]);
  assert.doesNotThrow(()=>context.storageSet('favs','[]'));
  for(const value of ['{broken','null','{}','42','"bad"']){
    const c={localStorage:{getItem:()=>value}};vm.createContext(c);
    vm.runInContext(source.slice(source.indexOf('function storageGet('),source.indexOf('const IC=')),c);
    assert.deepEqual(Array.from(c.storageList('favs')),[]);
  }
});
test('guestbook storage failures do not disable reading or posting',()=>{
  const context={LS_LIKES:'gbLikes'};
  Object.defineProperty(context,'localStorage',{get(){throw new Error('denied');}});
  Object.defineProperty(context,'sessionStorage',{get(){throw new Error('denied');}});
  vm.createContext(context);
  vm.runInContext(guestbook.slice(guestbook.indexOf('  function storeGet('),guestbook.indexOf('  // ===== 配置')),context);
  assert.equal(context.storeGet('gbAdminKey',true),null);
  assert.deepEqual(Array.from(context.likedIds()),[]);
  assert.doesNotThrow(()=>context.storeSet('gbLikes','[]'));
  assert.doesNotThrow(()=>context.storeRemove('gbAdminKey'));
});
test('job links allow HTTPS LinkedIn hosts and reject executable or spoofed links',()=>{
  const context={URL};vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function safeJobLink('),source.indexOf('function safeJdHtml(')),context);
  for(const link of ['javascript:alert(1)','data:text/html,hello','https://linkedin.com.evil.test/jobs/view/12345678','https://notlinkedin.com/jobs/view/12345678'])assert.equal(context.safeJobLink(link),'#');
  assert.equal(context.safeJobLink('https://hk.linkedin.com/jobs/view/12345678'),'https://hk.linkedin.com/jobs/view/12345678');
});
function analysisHarness(){
  const entry={descriptionText:'Build and operate reliable data pipelines for core business applications.'};
  const panel={hidden:true},cache={};let calls=0,renders=0,writes=0;
  const card={dataset:{id:'ln:12345678',comp:'ACME',region:'CN'},querySelector(selector){return selector==='.job-title'?{textContent:card.title}:null;},title:'Data Engineer'};
  const context={JEV_MAX_DESCRIPTION_CHARS:24000,JEV_TAXONOMY_VERSION:'jev-taxonomy-v5.1.0',JEV_API_ENDPOINT:'/api/jev/analyze',jdById:new Map([[card.dataset.id,entry]]),jdBlockText:()=>'',jdFingerprint:async text=>text,readJevCache:()=>cache,writeJevCache(){writes++;},hydrateJd:async()=>{},ensureJevPanel:()=>panel,showJevStatus(){},showJevError(){},renderJevResult(){renders++;},AbortController,setTimeout,clearTimeout,fetch:async()=>{calls++;return {ok:true,json:async()=>({analysis:{taxonomyVersion:'jev-taxonomy-v5.1.0'}})};}};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function jevRequestText('),source.indexOf('const jevText='))+'\n'+source.slice(source.indexOf('const jevRuns=new Set();'),source.indexOf('function addJevControls('))+'\nthis.run=runJevAnalysis;',context);
  return {context,card,entry,cache,counts:()=>({calls,renders,writes})};
}
test('JEV cache follows title, company, location, metadata and description',async()=>{
  const h=analysisHarness();await h.context.run(h.card);await h.context.run(h.card);
  assert.equal(h.counts().calls,1);
  h.card.title='Director of Engineering';await h.context.run(h.card);assert.equal(h.counts().calls,2);
  h.card.dataset.comp='New Employer';await h.context.run(h.card);assert.equal(h.counts().calls,3);
  h.card.dataset.region='HK';await h.context.run(h.card);assert.equal(h.counts().calls,4);
  h.entry.jevInput={schema:'jev-input-v4',jd_text:h.entry.descriptionText,employer_metadata:'Business: Global Markets'};await h.context.run(h.card);assert.equal(h.counts().calls,5);
  h.entry.jevInput.jd_text+=' Own hiring decisions.';await h.context.run(h.card);assert.equal(h.counts().calls,6);
});
test('an empty HTTP-200 analysis cannot enter the browser cache',async()=>{
  const h=analysisHarness();h.context.fetch=async()=>({ok:true,json:async()=>({})});
  await h.context.run(h.card);assert.equal(h.counts().writes,0);assert.equal(h.counts().renders,0);
});

test('unresponsive connections retry before the overall download deadline',async()=>{
 let calls=0;const load=indexHarness(()=>{calls++;return new Promise(()=>{});});
 await assert.rejects(load({attemptTimeouts:[1000,1000],connectTimeout:5,retryDelay:1}),/timeout/);
 assert.equal(calls,2);
});
test('a live stream can finish after the connection deadline',async()=>{
 const bytes=new TextEncoder().encode('{"jobs":[]}');let step=0;
 const load=indexHarness(async()=>({ok:true,body:{getReader:()=>({async read(){await new Promise(r=>setTimeout(r,8));return step++?{done:true}:{done:false,value:bytes};},releaseLock(){}})}}));
 assert.equal((await load({attemptTimeouts:[100],connectTimeout:5,idleTimeout:30})).jobs.length,0);
});
test('permission failures do not download the protected index repeatedly',async()=>{
 let calls=0;const load=indexHarness(async()=>{calls++;return {ok:false,status:403};});
 await assert.rejects(load(),/HTTP 403/);assert.equal(calls,1);
});
test('guestbook prefetch waits for jobs and stays deferred while loading',async()=>{
 const start=guestbook.indexOf('  let jobsSettled = '),end=guestbook.indexOf('  document.addEventListener("visibilitychange"',start);
 let finish,requests=0;const queued=[];
 const context={window:{__jobsDataPromise:new Promise(r=>finish=r)},document:{hidden:false},overlay:{classList:{contains:()=>false}},load(){requests++},setTimeout(fn){queued.push(fn)}};
 vm.createContext(context);vm.runInContext(guestbook.slice(start,end)+';this.refresh=refreshUnread;',context);
 context.refresh();assert.equal(requests,0);assert.equal(queued.length,0);
 finish();await Promise.resolve();assert.equal(requests,0);assert.equal(queued.length,1);queued[0]();assert.equal(requests,1);
});

