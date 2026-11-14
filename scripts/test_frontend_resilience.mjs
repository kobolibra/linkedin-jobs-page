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
test('offline index fallback is labeled and access-denied responses remain protected',()=>{
 assert.match(indexSource,/cacheState:'fresh'/);
 assert.match(indexSource,/this\.cacheState='stale'/);
 assert.match(indexSource,/status===0/); // transport-only fallback
 assert.doesNotMatch(indexSource,/status>=500/); // auth-service failures must not reveal cached roles
 assert.match(source,/stage==='render'/);
 assert.match(source,/stage==='scripts'/);
});
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



test('New Postings keeps its blue while stacked regions follow the approved sand/sage/terracotta palette',()=>{
 const css=readFileSync(new URL('../styles-refinement.css',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(css,/#spark\s*\{\s*--viz-blue:\s*#334EAC\s*;\s*\}/);
 assert.match(css,/\[data-theme="dark"\]\s+#spark\s*\{\s*--viz-blue:\s*#7096D1\s*;\s*\}/);
 assert.match(css,/\.rhythm-line,\[data-theme="dark"\] \.rhythm-line\s*\{[^}]*stroke:var\(--viz-blue\)/s);
 assert.match(css,/\.rhythm-node,\[data-theme="dark"\] \.rhythm-node\s*\{[^}]*stroke:var\(--viz-blue\)/s);
 assert.match(html,/styles-refinement\.css\?v=region-legend-lines-20261113/);
 assert.match(html,/New Postings: A Rolling 30-Day Snapshot/);
 assert.match(css,/#spark \.rhythm-bar\s*\{[^}]*fill:var\(--viz-blue\)/s);
 assert.match(css,/#dist \.region-series\.cn,\.region-chart-legend \.cn\{--region-ink:#b33a36;--region-fill:#e1b3b0\}/);
 assert.match(css,/#dist \.region-series\.hk,\.region-chart-legend \.hk\{--region-ink:#b27a22;--region-fill:#ddc6a6\}/);
 assert.match(css,/#dist \.region-series\.sg,\.region-chart-legend \.sg\{--region-ink:#6e8f3b;--region-fill:#c1d3ad\}/);
 assert.doesNotMatch(css,/#dist \.region-series\.other/);
 assert.match(source,/const regionOrder=\["HK","SG","CN"\];/);
 assert.match(source,/const cumulativeSeries=bucketCounts\.map\(daily=>/);
 assert.match(source,/const snapshotCounts=cumulativeSeries\.map\(values=>values\[bins\]\)/,
  'regional snapshot shares must derive from the same cumulative series as the chart');
 assert.match(source,/const shareTenths=rawShareTenths\.map\(n=>Math\.floor\(n\)\)/,
  'percentages are computed rather than hardcoded');
 assert.match(source,/const endBoundaries=regionOrder\.map/,'final cumulative boundaries are summed by region');
 assert.match(source,/const bandMiddleY=regionOrder\.map/,'direct label position follows the final band midpoints');
 assert.doesNotMatch(source,/dimensionSegments|dimensionCaps|dimensionScale|measureValues|endpointRules|region-end-guide|region-end-tick/,
  'approved terminal labels must not create a redundant ruler, axis or long guides');
 assert.match(source,/const directLabels='<div class="region-end-labels"/,'labels are overlaid inside the main plot, not in a header');
 assert.match(source,/const shortHistory=bins<100;/);
 assert.match(css,/#dist \.region-measure-reference\{/);
 assert.match(css,/#dist \.region-measure-height\{/);
 assert.match(css,/#dist \.region-measure-arrow\{/);
 assert.doesNotMatch(css,/#dist \.region-end-meta|#dist \.region-end-dot|#dist \.region-spark-grid/);
 assert.doesNotMatch(source,/class="region-spark-grid"/,'full-width gridlines must be removed');
 assert.match(source,/const TW=520,TH=360,left=43,right=17,top=18,base=326/);
 assert.match(source,/const cumulativeLevels=\[0,\.\.\.endBoundaries\]/);
 assert.match(source,/const referenceLines=\[\.\.\.new Set\(cumulativeLevels\)\]/);
 assert.match(source,/const verticalMeasures=regionOrder\.map/);
 assert.match(source,/const measureX=\{HK:78,SG:143,CN:222\}/,'region annotations use coordinated staggered inset alignment');
 assert.match(source,/class="region-date-tick"/);
 assert.match(source,/class="rhythm-date-tick"/);
 assert.doesNotMatch(css,/\.region-dimension-span|\.region-dimension-cap|\.region-end-guide|\.region-end-tick/);
 assert.match(css,/#dist \.region-end-label\{/);
 assert.doesNotMatch(source,/region-current-key|region-stat-|region-mix-|summaryCols=|const legend=|const composition=/);
 assert.match(css,/#spark \.rhythm-bar\.weekend\{opacity:\.63\}/);
 assert.match(css,/\[data-theme="dark"\] #spark \.rhythm-bar\.weekend\{opacity:\.71\}/);
 assert.match(source,/const bins=Math\.max\(1,Math\.round\(\(tMax-tMin\)\/dayMs\)\);/,'every UTC calendar day remains a distinct observation');
 assert.match(source,/const endTotal=cumulativeSeries\.reduce\(/,'region y-axis uses the final summed cumulative count');
 assert.match(source,/const upper=sumBoundary\(ri\+1,cumulativeSeries\);/,'each stacked boundary is a sum of regional cumulative data');
 assert.match(source,/const lower=sumBoundary\(ri,cumulativeSeries\);/,'ribbons share the correct lower cumulative baseline');
 assert.doesNotMatch(source,/distNote|首次抓取/);
 assert.doesNotMatch(html,/id="distNote"|region-density-note/);
 assert.doesNotMatch(source,/bucketDays|每 7 天汇总|每 3 天汇总/);
 assert.match(source,/const observedTimes=allTimes\.filter\(t=>/);
 assert.match(source,/series\.map\(layer=>layer\.area\)\.join\(''\)/);
 assert.match(source,/series\.map\(layer=>layer\.outline\)\.join\(''\)/);
 assert.match(source,/const contour=active\?contourPath\(upper,upperSlope\):'';/);
 assert.match(source,/const knotDays=bins===1\?\[1\]:\[1,bins\]/);
 assert.match(source,/const cubicAt=\(values,slopes,a,b,day\)=>/);
 assert.match(source,/curveErrorPx=worstError/);
 assert.match(source,/worstError<=\.58/);
 assert.match(source,/regionSlopes=cumulativeSeries\.map\(values=>slopeAtKnots/);
 assert.match(source,/const area=active\?'<path class="region-stack-band"/);
 assert.match(source,/class="region-stack-band"/);
 assert.match(css,/#dist \.region-stack-band\{/);
 assert.match(css,/#dist \.region-stack-band\{fill:var\(--region-fill\)/);
 assert.doesNotMatch(css,/--region-band/);
 assert.match(css,/#dist \.region-spark-line\{[^}]*stroke-width:1\.6/);
 assert.match(css,/#spark \.rhythm-bar\{\s*fill:var\(--viz-blue\);opacity:1/);
 assert.doesNotMatch(source,/First-observed active roles by geography|New postings per day<\/text>/);
 assert.match(source,/const bucketCounts=regionOrder\.map\(\(\)=>Array\.from\(\{length:bins\},\(\)=>0\)\)/);
 assert.match(source,/regionRecords\[k\]\.forEach\(x=>\{/);
 assert.match(source,/const rcounts=\{\};chartData\.forEach\(j=>/);
 assert.match(source,/const bars=days\.map\(\(d,i\)=>/);
 assert.match(source,/const calendarCandidates=\[\]/);
 assert.match(source,/const calendarMode=bins>180/);
 assert.match(source,/const rhythmMarks=days\.map/);
 assert.match(source,/d\.date\.getDay\(\)===1/);
 assert.doesNotMatch(source,/const dateLabels=\[0,7,14,21,29\]/);
 assert.match(html,/app\.js\?v=region-editorial-stagger-20261114/);

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
