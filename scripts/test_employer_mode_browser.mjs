import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,existsSync,statSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
import {chromium,webkit} from 'playwright';
import {publicPreviewPayload,previewData} from './guest_preview.mjs';
const root=resolve('.');
const dates=createRequire(import.meta.url)('../calendar-date.js');
const output=resolve('artifacts/employer-mode');mkdirSync(output,{recursive:true});
const firms=['HSBC','Citi','Goldman Sachs','Morgan Stanley','JPMorgan Chase','DBS Bank','BlackRock','Michael Page','Hays','Randstad','Unlisted'];
const now=new Date(),day=i=>new Date(now.getTime()-i*86400000).toISOString();
const synthetic=Array.from({length:99},(_,i)=>({title:'Finance Role '+i,company:firms[i%firms.length],employerType:i%firms.length<7?'direct_employer':i%firms.length===10?'unlisted':'recruitment_agency',link:'https://www.linkedin.com/jobs/view/'+(1234567890+i),location:['CN','HK','SG'][i%3],city:['Shanghai','Hong Kong','Singapore'][i%3],firstSeen:day(i%26),postingLastDate:day(i%26),pushTime:day(i%26),jobStatus:'active'}));
const modeOf=j=>j.employerType==='direct_employer'?'direct':'agency';
const postingHistoryDaily={},postingHistoryDailyByMode={direct:{},agency:{}};
for(const row of synthetic){const key=new Date(Date.parse(row.firstSeen)+8*3600000).toISOString().slice(0,10);for(const target of [postingHistoryDaily,postingHistoryDailyByMode[modeOf(row)]]){const daily=target[key]??={};daily[row.location]=(daily[row.location]||0)+1;}}
const canonical=JSON.parse(readFileSync(resolve(root,'jobs-index.json'),'utf8'));
const index=canonical.employerModeSchema===1?canonical:{employerModeSchema:1,source:'jobs.json',dataVersion:'a'.repeat(64),jobs:synthetic,updatedAt:now.toISOString(),companyLogos:{},postingHistoryDaily,postingHistoryDailyByMode};
const jobs=index.jobs;
const scoped=mode=>jobs.filter(j=>mode==='full'||modeOf(j)===mode);
const guest=publicPreviewPayload(previewData(index,{},now.getTime()),index,now.getTime());
const totals=Object.fromEntries(['full','direct','agency'].map(mode=>[mode,scoped(mode).filter(j=>j.jobStatus!=='expired').length]));
const types={'.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2'};
for(const engine of (process.env.MODE_BROWSERS||'chromium').split(',')){
const browser=await ({chromium,webkit}[engine]).launch({headless:true});
try{
 for(const [width,theme,isGuest] of [[1440,'light',false],[390,'dark',false],[390,'light',true],[320,'dark',true]]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  await context.addInitScript(({theme})=>{if(!localStorage.getItem('theme'))localStorage.setItem('theme',theme);},{theme});
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='127.0.0.1'){const cb=url.searchParams.get('jsonpCallback');return route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:cb?'application/javascript':url.pathname.includes('css')?'text/css':'application/json',body:cb?`${cb}({site_pv:1})`:url.pathname.includes('css')?'':'[]'});}
   const path=url.pathname;
   if(path==='/auth/session'){await new Promise(resolve=>setTimeout(resolve,200));return route.fulfill({status:isGuest?401:200,contentType:'application/json',body:JSON.stringify(isGuest?{error:'unauthorized'}:{enabled:true,user:{id:'mode-test',name:'Regression'},csrf:'test-only'})});}
   if(path==='/auth/preferences')return route.fulfill({contentType:'application/json',body:JSON.stringify({userId:'mode-test',entries:[],cursor:0,more:false,acknowledged:[]})});
   if(path==='/jobs-version.json')return route.fulfill({status:isGuest?401:200,contentType:'application/json',body:JSON.stringify(isGuest?{error:'unauthorized'}:{dataVersion:index.dataVersion})});
   if(path==='/jobs-index.json')return route.fulfill({status:isGuest?401:200,contentType:'application/json',body:JSON.stringify(isGuest?{error:'unauthorized'}:index)});
   if(path==='/api/public-preview')return route.fulfill({contentType:'application/json',body:JSON.stringify(guest)});
   const local=resolve(root,path==='/'?'index.html':path.slice(1));
   if(!local.startsWith(root+'/')||!existsSync(local)||!statSync(local).isFile())return route.fulfill({status:404,body:''});
   let body=readFileSync(local);
   if(path==='/'&&isGuest)body=Buffer.from(body.toString().replace('<html ','<html data-auth-state="guest" ').replace('</head>','<link rel="stylesheet" href="/auth-guest.css?v=2"></head>'));
   return route.fulfill({status:200,contentType:types[extname(local)]||'application/octet-stream',body});
  });
  const page=await context.newPage(),errors=[];let indexRequests=0;page.on('request',request=>{const p=new URL(request.url()).pathname;if(p==='/jobs-index.json'||p==='/api/public-preview')indexRequests++;});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&m.text().includes('[jobs]'))errors.push(m.text());});
  await page.goto('http://127.0.0.1:47653/');
  const wait=async mode=>{
   const overview=mode==='full'?guest.previewOverview:guest.previewOverviewByMode[mode];
   const total=isGuest?overview.total:totals[mode];
   await page.waitForFunction(({mode,total})=>document.documentElement.dataset.renderedEmployerMode===mode&&document.getElementById('stat-total')?.textContent.replace(/,/g,'')===String(total)&&typeof renderReady!=='undefined'&&renderReady,{mode,total},{timeout:30000});
   const expected=scoped(mode),expectedRows=isGuest?guest.jobs.filter(j=>mode==='full'||modeOf(j)===mode):expected;
   const snapshot=await page.evaluate(()=>({rows:loadedJobs.length,direct:loadedJobs.filter(j=>j.employerType==='direct_employer').length,regions:Number(document.querySelector('#dist svg')?.dataset.finalTotal),bars:document.querySelectorAll('#spark .rhythm-bar').length,top:top50Rows.length,history:postingHistoryDaily,active:Number(document.getElementById('activeJobCount').textContent.replace(/,/g,''))}));
   assert.equal(snapshot.rows,expectedRows.length);
   assert.equal(snapshot.direct,expectedRows.filter(j=>j.employerType==='direct_employer').length);
   // The regional chart deliberately starts in 2026 when it has 2026
   // observations, and excludes unparseable firstSeen values. Preserve that
   // existing timeline contract rather than force its denominator to equal
   // the open-role headline, which has no date restriction.
   const regionalDates=expected.filter(j=>j.jobStatus!=='expired'&&['CN','HK','SG'].includes(j.location))
     .map(j=>dates.dayStart(dates.key(j.firstSeen))).filter(Number.isFinite);
   const recentDates=regionalDates.filter(t=>t>=dates.dayStart('2026-01-01'));
   const regional=(recentDates.length?recentDates:regionalDates).length;
   assert.equal(snapshot.regions,regional,'regional chart timeline population');
   assert.equal(snapshot.top,isGuest?overview.total:totals[mode],'Top 30 input population');
   assert.equal(snapshot.bars,30);
   assert.deepEqual(snapshot.history,mode==='full'?index.postingHistoryDaily:index.postingHistoryDailyByMode[mode]);
   assert.equal(snapshot.active,total);
   console.log(JSON.stringify({engine,width,theme,isGuest,mode,snapshot:{...snapshot,history:undefined}}));
  };
  // The toolbar lives below the masthead; Playwright's normal click scrolls it
  // into view. Measure a real visible masthead, without injecting that scroll.
  await wait('full');
  await page.evaluate(async()=>{window.scrollTo({top:0,left:0,behavior:'instant'});await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
  const initialFetches=indexRequests;
  const initialHeader=await page.evaluate(()=>{window.__modeQA={header:document.getElementById('headerTools'),theme:document.getElementById('themeToggle'),account:document.getElementById('headerAccount').firstElementChild,select:document.getElementById('employerMode')};const rect=e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];};return [...document.getElementById('headerTools').children].map(rect);});
  let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
  const assertBorderless=async (phase,requireFocus=false)=>{
   const style=await page.locator('#employerMode').evaluate(el=>{
    const c=getComputedStyle(el);
    const wrapper=getComputedStyle(el.parentElement,'::after');
    return {focused:document.activeElement===el,focusVisible:el.matches(':focus-visible'),border:c.borderTopWidth,outline:c.outlineStyle,outlineWidth:c.outlineWidth,shadow:c.boxShadow,background:c.backgroundColor,radius:c.borderRadius,keyboardMark:wrapper.content,keyboardMarkHeight:wrapper.height};
   });
   if(requireFocus)assert.ok(style.focused,'focus must remain on picker: '+phase);
   assert.equal(style.border,'0px',phase);assert.equal(style.outline,'none',phase);
   assert.equal(style.outlineWidth,'0px',phase);assert.equal(style.shadow,'none',phase);
   assert.ok(style.background==='rgba(0, 0, 0, 0)'||style.background==='transparent',phase+': '+style.background);
   assert.equal(style.radius,'0px',phase);
   if(style.focusVisible){assert.notEqual(style.keyboardMark,'none',phase);assert.equal(style.keyboardMarkHeight,'1px',phase);}
  };
  await assertBorderless('rest');
  await page.locator('#employerMode').hover();await assertBorderless('hover');
  for(const mode of ['direct','agency','full']){
   await page.evaluate(()=>{const sample=()=>{const q=window.__modeQA;const r=[...q.header.children].map(e=>{const b=e.getBoundingClientRect();return [b.x,b.y,b.width,b.height];});window.__modeFrames.push(r);if(window.__modeSampling)requestAnimationFrame(sample);};window.__modeFrames=[];window.__modeSampling=true;requestAnimationFrame(sample);});
   // Playwright selectOption alone does not reproduce the native picker
   // retaining focus after a human selects a mode. Exercise that state
   // before, immediately after and several frames after each real switch.
   await page.locator('#employerMode').focus();
   await assertBorderless('focused before '+mode,true);
   await page.selectOption('#employerMode',mode);
   await assertBorderless('focused immediately after '+mode,true);
   await wait(mode);
   await assertBorderless('focused after render '+mode,true);
   const frames=await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);window.__modeSampling=false;return window.__modeFrames;});
   for(const boxes of frames)for(let i=0;i<boxes.length;i++)for(let j=0;j<4;j++)assert.ok(Math.abs(boxes[i][j]-initialHeader[i][j])<=1,'transient header jump '+JSON.stringify({boxes,initialHeader}));
   assert.equal(await page.locator('#employerMode').inputValue(),mode);
   assert.equal(navigations,0,'mode switch must not navigate');
   const stability=await page.evaluate(()=>{const q=window.__modeQA,header=document.getElementById('headerTools'),rect=e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];};return {same:q.header===header&&q.theme===document.getElementById('themeToggle')&&q.account===document.getElementById('headerAccount').firstElementChild&&q.select===document.getElementById('employerMode'),boxes:[...header.children].map(rect),border:getComputedStyle(q.select).borderTopWidth,shadow:getComputedStyle(q.select).boxShadow,accountRight:q.account?.getBoundingClientRect().right};});
   assert.equal(stability.same,true,'header controls must remain mounted');
   assert.equal(stability.border,'0px');assert.equal(stability.shadow,'none');assert.ok(stability.accountRight<=width,'account must not leave viewport');
   for(let i=0;i<stability.boxes.length;i++)for(let j=0;j<4;j++)assert.ok(Math.abs(stability.boxes[i][j]-initialHeader[i][j])<=1,'header geometry changed: '+JSON.stringify(stability));
   const geometry=await page.evaluate(()=>{const about=document.querySelector('.nj-about-link').getBoundingClientRect(),mode=document.getElementById('employerMode').getBoundingClientRect(),theme=document.getElementById('themeToggle').getBoundingClientRect(),brand=document.querySelector('.nj-brand').getBoundingClientRect();return {ordered:about.right<=mode.left+1&&mode.right<=theme.left+1,within:about.left>=0&&theme.right<=innerWidth,brandSeparate:brand.right<=about.left+1||brand.bottom<=about.top+1};});
   assert.deepEqual(geometry,{ordered:true,within:true,brandSeparate:true});
   // Capture before clicking any other element; the select is still focused.
   await page.locator('.nj-brand-row').screenshot({path:resolve(output,engine+'-'+width+'-'+theme+(isGuest?'-guest':'')+'-'+mode+'.png')});
   await assertBorderless('focused after screenshot '+mode,true);
   assert.equal(await page.evaluate(()=>localStorage.getItem('next-journey-employer-mode')),mode);
   assert.equal(await page.evaluate(()=>window.scrollY),0,'switching mode at the masthead must not scroll the page');
   if(!isGuest){
    // Exercise the region filter independently of the visible-header motion
    // test; DOM clicks preserve scroll rather than Playwright auto-scrolling.
    await page.evaluate(()=>document.querySelector('#regions .seg[data-region="CN"]').click());
    await page.waitForFunction(()=>activeRegion==='CN');
    assert.ok(await page.evaluate(()=>listRuntime.view.rows.every(i=>listRuntime.meta[i].region==='CN')));
    await page.evaluate(()=>document.querySelector('#regions .seg[data-region="all"]').click());
    await page.waitForFunction(()=>activeRegion==='all');
    await page.evaluate(async()=>{window.scrollTo({top:0,left:0,behavior:'instant'});await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
   }
  }
  // Three consecutive changes in one task exercise the same document and latest scope.
  await page.evaluate(()=>{EmployerMode.set('direct');EmployerMode.set('agency');EmployerMode.set('direct');});await wait('direct');
  assert.equal(navigations,0);assert.equal(indexRequests,initialFetches,'mode switches must reuse one master snapshot');
  await page.reload();await wait('direct');
  assert.deepEqual(errors,[]);
  await context.close();
 }
}finally{await browser.close();}
}
