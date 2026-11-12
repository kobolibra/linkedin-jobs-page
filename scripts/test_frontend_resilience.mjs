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



test('C-style columns keep original blue and regional trend keeps the original area colors',()=>{
 const css=readFileSync(new URL('../styles-refinement.css',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(css,/#spark\s*\{\s*--viz-blue:\s*#334EAC\s*;\s*\}/);
 assert.match(css,/\[data-theme="dark"\]\s+#spark\s*\{\s*--viz-blue:\s*#7096D1\s*;\s*\}/);
 assert.match(css,/\.rhythm-line,\[data-theme="dark"\] \.rhythm-line\s*\{[^}]*stroke:var\(--viz-blue\)/s);
 assert.match(css,/\.rhythm-node,\[data-theme="dark"\] \.rhythm-node\s*\{[^}]*stroke:var\(--viz-blue\)/s);
 assert.match(html,/styles-refinement\.css\?v=region-visible-window-4/);
 assert.match(html,/New Postings: A Rolling 30-Day Snapshot/);
 assert.match(css,/#spark \.rhythm-bar\s*\{[^}]*fill:var\(--viz-blue\)/s);
 assert.match(css,/#dist \.region-series\.cn\{--region-ink:#b33a36;--region-band:21%\}/);
 assert.match(css,/#dist \.region-series\.hk\{--region-ink:#b27a22;--region-band:24%\}/);
 assert.match(css,/#dist \.region-series\.sg\{--region-ink:#6e8f3b;--region-band:27%\}/);
 assert.doesNotMatch(css,/#dist \.region-series\.other/);
 assert.match(source,/const regionOrder=\["SG","HK","CN"\];/);
 assert.match(source,/const totalBuckets=Array\.from\(/);
 assert.match(source,/const horizon=\[7,14,30\]\.find\(n=>/);
 assert.match(source,/series\.map\(layer=>layer\.area\)\.join\(''\)/);
 assert.match(source,/series\.map\(layer=>layer\.outline\)\.join\(''\)/);
 assert.match(source,/const contour=runs\.map\(indices=>'M'\+indices\.map/);
 assert.match(source,/class="region-stack-band"/);
 assert.match(css,/#dist \.region-stack-band\{/);
 assert.match(css,/--region-band:27%/);
 assert.match(css,/#spark \.rhythm-bar\{\s*fill:var\(--viz-blue\);opacity:1/);
 assert.doesNotMatch(source,/First-observed active roles by geography|New postings per day<\/text>/);
 assert.match(source,/const bucketCounts=regionOrder\.map\(k=>Array\.from\(\{length:bins\},\(\)=>0\)\)/);
 assert.match(source,/regionRecords\[k\]\.forEach\(x=>\{/);
 assert.match(source,/const rcounts=\{\};chartData\.forEach\(j=>/);
 assert.match(source,/const bars=days\.map\(\(d,i\)=>/);
 assert.match(source,/const dateLabels=\[0,7,14,21,29\]/);
 assert.match(html,/app\.js\?v=region-visible-window-4/);

 assert.doesNotMatch(css,/:root\s*\{\s*--viz-blue:#334EAC/);
});

test('masthead and summary labels use natural case, while geography acronyms remain intact',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../next-journey-masthead.css',import.meta.url),'utf8');
 for(const label of ['The Hiring Landscape','Market Coverage','The Landscape in Numbers','Active Roles','Institutions','Last Updated','Visits']){
  assert.ok(html.includes(label),'missing case-correct label: '+label);
 }
 assert.match(html,/class="nj-source">Source <span aria-hidden="true">\/<\/span> LinkedIn<\/span>/);
 for(const legacy of ['THE HIRING LANDSCAPE','MARKET COVERAGE','THE LANDSCAPE IN NUMBERS','ACTIVE ROLES','INSTITUTIONS','LAST UPDATED','>VISITS<','> LINKEDIN<\/span>']){
  assert.ok(!html.includes(legacy),'unexpected all-caps label: '+legacy);
 }
 assert.match(html,/>CN<\/button>/);
 assert.match(html,/New Postings: A Rolling 30-Day Snapshot/);
 assert.match(html,/next-journey-masthead\.css\?v=9/);
 assert.match(css,/\.nj-eyebrow\{[^}]*letter-spacing:\.045em/);
 assert.match(css,/\.nj-market-heading\{[^}]*letter-spacing:\.035em/);
 assert.match(css,/\.nj-masthead-folio\{[^}]*letter-spacing:\.035em/);
});

test('active-only status uses Mainland ring color without recoloring the label',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../styles-list.css',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(html,/styles-list\.css\?v=mainland-ring-2/);
 assert.match(html,/<button type="button" class="active-only-toggle" id="activeOnlyToggle" aria-pressed="false"[^>]*>有效<svg class="active-only-ring"/);
 assert.match(html,/class="active-only-ring"[^>]*aria-hidden="true" focusable="false"/);
 assert.match(html,/M8 24 C6 14 20 6 42 5/);
 const baseCss=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 assert.match(baseCss,/--cn:#9c2a33/);
 assert.match(baseCss,/\[data-theme="dark"\][\s\S]*?--cn:#df8b79/);
 assert.match(css,/\.count \.active-only-toggle \.active-only-ring\s*\{[^}]*color:var\(--cn\)/s);
 assert.match(css,/\.count \.active-only-toggle\s*\{[^}]*color:inherit;font:inherit/s);
 assert.match(css,/\.count \.active-only-toggle\[aria-pressed="true"\]\s*\{[^}]*color:inherit/s);
 assert.doesNotMatch(css,/--active-ring-color|\.count \.active-only-toggle:hover\s*\{[^}]*color:/s);
 assert.doesNotMatch(css,/\.count \.active-only-toggle\[aria-pressed="true"\]\s*\{[^}]*font-weight:/s);
 assert.match(css,/\.count \.active-only-toggle\[aria-pressed="true"\] \.active-only-ring\s*\{\s*opacity:1/);
 assert.match(css,/\.count \.active-only-toggle\[aria-pressed="true"\]\s*\{[^}]*background:transparent/s);
 assert.doesNotMatch(css,/\.count \.active-only-toggle\[aria-pressed="true"\]\s*\{[^}]*background:var\(--navy\)/s);
 assert.match(app,/activeOnlyEl\.setAttribute\("aria-pressed",String\(activeOnly\)\)/);
 assert.match(css,/\.count \.active-only-toggle:focus-visible\s*\{[^}]*outline:2px solid var\(--cn\)/s);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
