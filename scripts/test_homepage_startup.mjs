import {assertRegionProjections,assertRegionVisualBalance} from './assert_region_projections.mjs';
/* Full homepage boot: charts AND populated job-list, using actual shipped scripts.
   Auth APIs are local fixtures, never a real user session or security bypass. */
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from 'playwright';
import {previewData,publicPreviewPayload,weeklyFlow} from './guest_preview.mjs';
const root=resolve(new URL('..',import.meta.url).pathname);
const base='http://127.0.0.1:47651';
const index=JSON.parse(readFileSync(resolve(root,'jobs-index.json'),'utf8'));
const html=readFileSync(resolve(root,'index.html'),'utf8');
const source=readFileSync(resolve(root,'app.js'),'utf8');
const out=resolve(root,'artifacts/homepage-startup');mkdirSync(out,{recursive:true});
const mime={'.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff':'font/woff'};
const evidence=[];
function originalBug(text){
 const start=text.indexOf("    const regionTickFormat=new Intl.DateTimeFormat(");
 const end=text.indexOf('    // Snapshot counts and share labels',start);
 assert.ok(start>=0&&end>start);
 const part=text.slice(start,end);
 assert.ok(part.includes('const regionAxisDayLabel='));
 return text.slice(0,start)+part.replaceAll('regionAxisDayLabel','dayLabel')+text.slice(end);
}
async function check(browser,engine,{guest=false,width=390,theme='light',broken=false,document=index,label='canonical'}={}){
 const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1,colorScheme:theme,locale:'zh-CN',timezoneId:'Asia/Shanghai'});
 const page=await context.newPage(),errors=[],requests=[],consoleErrors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error'&&message.text().includes('[jobs]'))consoleErrors.push(message.text());});
 const preview=publicPreviewPayload(previewData(document),document);
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  if(url.origin!==base){
   // Real cross-origin API responses require CORS headers. Fulfil requests
   // locally with the correct response contract; never contact the service.
   const callback=url.searchParams.get('jsonpCallback');
   const guestbook=url.hostname==='guestbook-api.claudecowork.workers.dev';
   return route.fulfill({
    status:200,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'Content-Type,X-Admin-Key'},
    contentType:callback?'application/javascript':path.includes('css')?'text/css':'application/json',
    body:callback?`${callback}({site_pv:1})`:path.includes('css')?'':guestbook&&request.method()==='GET'?'[]':JSON.stringify({messages:[],data:[],total:0})
   });
  }
  requests.push(path);
  const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(path==='/auth/session')return json(guest?{error:'unauthorized'}:{enabled:true,user:{id:'startup-test',name:'Regression'},csrf:'test-only'},guest?401:200);
  if(path==='/auth/preferences')return json({userId:'startup-test',entries:[],cursor:0,more:false,acknowledged:[]});
  if(path==='/api/public-preview')return json(preview);
  if(path==='/jobs-index.json')return guest?json({error:'unauthorized'},401):json(document);
  if(path==='/jobs-version.json')return guest?json({error:'unauthorized'},401):json({dataVersion:document.dataVersion});
  if(path==='/')return route.fulfill({contentType:'text/html',body:html.replace('<html lang="zh-CN">',`<html lang="zh-CN" data-auth-state="${guest?'guest':'authenticated'}">`)});
  if(path==='/app.js')return route.fulfill({contentType:'application/javascript',body:broken?originalBug(source):source});
  const file=resolve(root,'.'+decodeURIComponent(path));
  if(!file.startsWith(root+'/'))return route.fulfill({status:403,body:''});
  if(existsSync(file))return route.fulfill({contentType:mime[extname(file)]||'application/octet-stream',body:readFileSync(file)});
  // Decorative assets are not necessary for behavior; never stub application code.
  if(/\.(?:png|webp|ico|woff2?|svg)$/.test(path))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/>'});
  return route.fulfill({status:404,body:'Not found'});
 });
 try{
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#empty.show')||document.querySelector('#jobs .job'),null,{timeout:30000});
  const state=await page.evaluate(()=>({ready:typeof renderReady!=='undefined'&&renderReady,rows:document.querySelectorAll('#jobs .job').length,days:document.querySelectorAll('#jobs .day').length,empty:document.querySelector('#empty')?.classList.contains('show'),message:document.querySelector('#empty .big')?.textContent,chart:!!document.querySelector('#dist svg'),bars:document.querySelectorAll('#spark .rhythm-bar').length,active:document.querySelector('#activeJobCount')?.textContent,loaded:typeof loadedJobs==='undefined'?null:loadedJobs?.length,total:typeof listRuntime==='undefined'?null:listRuntime?.meta.length,firstHeading:document.querySelector('#jobs .day-date')?.textContent}));
  assert.equal(state.chart,true,'regional chart renders');assert.equal(state.bars,30);
  if(broken){
   assert.equal(state.rows,0);assert.equal(state.empty,true);
   assert.ok(consoleErrors.some(s=>/Invalid time value|date value is not finite|invalid date/i.test(s)),'negative control must reproduce the actual date exception');
  }else{
   await assertRegionProjections(page);
   await assertRegionVisualBalance(page);
   // New This Week has one definition for guests and signed-in readers:
   // roles first seen in the 7 days to the latest update, including closed ones.
   const flow=weeklyFlow(document.jobs);
   await page.waitForFunction(n=>Number(document.getElementById('stat-week')?.textContent.replace(/\D/g,''))===n,flow?.current??-1,{timeout:5000});
   if(flow?.prior)assert.match(await page.locator('#stat-week-note').textContent(),/% vs the prior 7 days|level with the prior 7 days/);
   assert.equal(state.ready,true);assert.equal(state.empty,false);assert.ok(state.rows>0);assert.ok(state.days>0);
   assert.match(state.firstHeading||'',/\d{1,2} [A-Z][a-z]{2} 20\d\d/,'job-list uses the canonical day–month–year display');
   assert.equal(consoleErrors.length,0,consoleErrors.join('\n'));assert.equal(errors.length,0,errors.join('\n'));
   if(guest){
    assert.ok(!requests.includes('/jobs-index.json')&&!requests.includes('/jobs-version.json')&&!requests.includes('/auth/preferences'),'guest never requests protected index or account data');
    assert.ok(state.total<=12);assert.ok(state.loaded<=12);
   }else{
    assert.ok(state.total>0);assert.equal(state.total,state.loaded);
    await page.locator('#regions .seg[data-region="CN"]').click();
    await page.waitForFunction(()=>activeRegion==='CN');
    const cn=await page.evaluate(()=>listRuntime.view.rows.every(i=>listRuntime.meta[i].region==='CN'));
    assert.ok(cn,'region filter still works');
    await page.locator('#regions .seg[data-region="all"]').click();
    await page.locator('#search').fill('HSBC');
    await page.waitForFunction(()=>searchEl.value==='HSBC'&&listRuntime.view.rows.every(i=>listRuntime.meta[i].search.includes('hsbc')));
    await page.locator('#search').fill('');
    await page.waitForFunction(()=>listRuntime.view.rows.length===listRuntime.meta.length);
   }
   if(!guest){
    if(label==='canonical'){
     await page.locator('#search').fill('CFO - Financial Reporting Manager - VP');
     await page.waitForFunction(()=>listRuntime.view.rows.length===1);
     const role=await page.evaluate(()=>{
      const m=listRuntime.meta[listRuntime.view.rows[0]];
      return {day:m.day,age:m.age,expectedAge:window.JobDates.calendarAge('2026-08-26'),label:m.label};
     });
     assert.equal(role.day,'2026-10-29','verified repost moves list heading to pushTime');
     assert.equal(role.age,role.expectedAge,'repost never resets age');
     assert.match(role.label,/29 Oct 2026/);
     await page.locator('#search').fill('');
     await page.waitForFunction(()=>listRuntime.view.rows.length===listRuntime.meta.length);
    }
   }
   await page.locator('#jobs').scrollIntoViewIfNeeded();
   await page.screenshot({path:resolve(out,`${engine}-${guest?'guest':'signed'}-${width}-${theme}-${label}.png`)});
   if(label==='canonical'){
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof renderReady!=='undefined'&&renderReady&&document.querySelector('#jobs .job'),null,{timeout:30000});
    assert.equal(await page.locator('#empty').evaluate(el=>el.classList.contains('show')),false,'reload must remain functional');
   }
   assert.equal(consoleErrors.length,0);assert.equal(errors.length,0,errors.join('\n'));
  }
  const result={engine,guest,width,theme,label,negativeControl:broken,state,pageErrors:errors,renderErrors:consoleErrors};
  evidence.push(result);console.log(JSON.stringify(result));
 }catch(error){
  await page.screenshot({path:resolve(out,`FAIL-${engine}-${width}-${label}.png`)}).catch(()=>{});
  console.error('Startup diagnostics',JSON.stringify({engine,guest,width,label,errors,consoleErrors}));throw error;
 }finally{await context.close();}
}
for(const engine of (process.env.STARTUP_BROWSERS||'chromium,webkit').split(',')){
 assert.ok(['chromium','webkit'].includes(engine));
 const browser=await ({chromium,webkit}[engine]).launch({headless:true,...(process.env.STARTUP_EXECUTABLE?{executablePath:process.env.STARTUP_EXECUTABLE}:{})});
 try{
  await check(browser,engine,{broken:true,guest:true,label:'pre-fix'});
  for(const config of [{width:390},{width:390,guest:true},{width:1280},{width:390,theme:'dark'}])await check(browser,engine,config);
  const edge={...index,jobs:[
   {title:'HSBC Analyst',company:'HSBC',location:'CN',city:'Shanghai',link:'https://www.linkedin.com/jobs/view/123456701',firstSeen:'2026-11-12T16:30:00Z',pushTime:'2026-11-13T00:30:00+08:00'},
   {title:'HSBC Associate',company:'HSBC',location:'SG',link:'https://www.linkedin.com/jobs/view/123456702',firstSeen:'2026-11-12T09:00:00.123456+00:00',pushTime:'2026-11-12T09:00:00.123456+00:00'},
   {title:'HSBC Intern',company:'HSBC',location:'HK',link:'https://www.linkedin.com/jobs/view/123456703',firstSeen:'invalid',pushTime:'invalid'}
  ]};
  await check(browser,engine,{document:edge,label:'date-edge-cases'});
 }finally{await browser.close();}
}
writeFileSync(resolve(out,'results.json'),JSON.stringify(evidence,null,2));
console.log(`Homepage startup passed: ${evidence.length} full-boot cases, including pre-fix negative controls.`);
