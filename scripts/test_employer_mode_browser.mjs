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
   if(path==='/auth/session')return route.fulfill({status:isGuest?401:200,contentType:'application/json',body:JSON.stringify(isGuest?{error:'unauthorized'}:{enabled:true,user:{id:'mode-test',name:'Regression'},csrf:'test-only'})});
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
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&m.text().includes('[jobs]'))errors.push(m.text());});
  await page.goto('http://127.0.0.1:47653/');
  const wait=async mode=>{
   const overview=mode==='full'?guest.previewOverview:guest.previewOverviewByMode[mode];
   const total=isGuest?overview.total:totals[mode];
   await page.waitForFunction(({mode,total})=>document.documentElement.dataset.employerMode===mode&&document.getElementById('stat-total')?.textContent.replace(/,/g,'')===String(total)&&typeof renderReady!=='undefined'&&renderReady,{mode,total},{timeout:30000});
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
   if(!isGuest){await page.locator('#regions .seg[data-region="CN"]').click();await page.waitForFunction(()=>activeRegion==='CN');assert.ok(await page.evaluate(()=>listRuntime.view.rows.every(i=>listRuntime.meta[i].region==='CN')));await page.locator('#regions .seg[data-region="all"]').click();}
   console.log(JSON.stringify({engine,width,theme,isGuest,mode,snapshot:{...snapshot,history:undefined}}));
  };
  await wait('full');
  for(const mode of ['direct','agency','full']){
   await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.selectOption('#employerMode',mode)]);
   await wait(mode);
   assert.equal(await page.locator('#employerMode').inputValue(),mode);
   const geometry=await page.evaluate(()=>{const about=document.querySelector('.nj-about-link').getBoundingClientRect(),mode=document.getElementById('employerMode').getBoundingClientRect(),theme=document.getElementById('themeToggle').getBoundingClientRect(),brand=document.querySelector('.nj-brand').getBoundingClientRect();return {ordered:about.right<=mode.left+1&&mode.right<=theme.left+1,within:about.left>=0&&theme.right<=innerWidth,brandSeparate:brand.right<=about.left+1||brand.bottom<=about.top+1};});
   assert.deepEqual(geometry,{ordered:true,within:true,brandSeparate:true});
   await page.locator('.nj-brand-row').screenshot({path:resolve(output,engine+'-'+width+'-'+theme+(isGuest?'-guest':'')+'-'+mode+'.png')});
   await page.reload();await wait(mode);
  }
  assert.deepEqual(errors,[]);
  await context.close();
 }
}finally{await browser.close();}
}
