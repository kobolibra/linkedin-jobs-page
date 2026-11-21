/* Temporary diagnostic: evaluate the shipped Last Updated text in real
   Chromium/WebKit at phone and desktop widths, plus the live guest page.
   No production credentials or user state are accessed. */
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from 'playwright';
import {previewData,publicPreviewPayload} from './guest_preview.mjs';
const root=resolve(new URL('..',import.meta.url).pathname);
const base='http://127.0.0.1:47651';
const live='https://linkedin.claudecowork.workers.dev/';
const index=JSON.parse(readFileSync(resolve(root,'jobs-index.json'),'utf8'));
const preview=publicPreviewPayload(previewData(index),index);
const html=readFileSync(resolve(root,'index.html'),'utf8');
const out=resolve(root,'artifacts/last-updated-diagnostic');mkdirSync(out,{recursive:true});
const errors=[];
function measurement(){
 const el=document.querySelector('#stat-updated');
 const visits=document.querySelector('#busuanzi_value_site_pv');
 const group=el?.closest('.stat-meta-group');
 const status=el?.closest('.stat-status');
 const box=node=>{if(!node)return null;const r=node.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),height:Math.round(r.height),scrollWidth:node.scrollWidth,clientWidth:node.clientWidth,display:getComputedStyle(node).display,whiteSpace:getComputedStyle(node).whiteSpace,overflow:getComputedStyle(node).overflow};};
 let tail=null;
 if(el?.firstChild?.nodeType===Node.TEXT_NODE&&el.firstChild.length>=5){
   const text=el.firstChild,range=document.createRange();
   range.setStart(text,Math.max(0,text.length-5));range.setEnd(text,text.length);
   const r=range.getBoundingClientRect();tail={left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width)};
 }
 const data=window.AuthGuest?.overview||null;
 return {url:location.href,viewport:innerWidth,userAgent:navigator.userAgent,
  rootAuth:document.documentElement.dataset.authState,
  updatedText:el?.textContent,
  guestUpdated:data?.updated??null,
  guestDataVersion:data?.dataVersion??null,
  recomputed: data?.updated ? window.JobDates?.formatStamp(data.updated,{compact:true}) : null,
  formatSample:window.JobDates?.formatStamp('2026-11-21T04:01:55.879Z',{compact:true}),
  timeRendered:/\d{1,2}:\d\d$/.test(el?.textContent||''),
  boxes:{el:box(el),status:box(status),group:box(group),visits:box(visits),shell:box(document.querySelector('.shell'))},
  tail,hasOutOfBounds:!!(tail&&((tail.right>(innerWidth+1))||(tail.right>(group?.getBoundingClientRect().right||Infinity)+1)))};
}
async function inspect(page,{engine,width,guest,kind,mode}){
 const pageErrors=[];
 page.on('pageerror',error=>pageErrors.push(error.message));
 try{
   await page.goto(kind==='live'?live:base+'/',{waitUntil:'domcontentloaded',timeout:20000});
   await page.waitForFunction(()=>document.getElementById('stat-updated')?.textContent.trim()!=='—'&&document.getElementById('stat-updated')?.textContent.trim()!=='' ,null,{timeout:60000});
   const metrics=await page.evaluate(measurement);
   const data={engine,width,guest,kind,mode,metrics,pageErrors};
   console.log('STAMP_DIAGNOSTIC '+JSON.stringify(data));
   if(kind==='fixture'){
     assert.ok(metrics.timeRendered,'timestamp must render HH:mm in '+JSON.stringify(data));
     assert.ok(!metrics.hasOutOfBounds,'timestamp must not be clipped in '+JSON.stringify(data));
   }
   const path=resolve(out,engine+'-'+kind+'-'+mode+'-'+width+'.png');
   await page.screenshot({path,fullPage:false});
   return data;
 }catch(err){
   const data={engine,width,guest,kind,mode,error:String(err),pageErrors};
   errors.push(data);console.log('STAMP_ERROR '+JSON.stringify(data));return data;
 }
}
const mime={'.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff':'font/woff'};
const results=[];
for(const [engine,browserType] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await browserType.launch({headless:true});
 try{
  for(const guest of [true,false]){
   for(const width of [320,390,1280]){
    const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:width<=390?3:1,isMobile:width<=390,hasTouch:width<=390,locale:'zh-CN',timezoneId:'Asia/Shanghai'});
    await context.route('**/*',async route=>{
      const u=new URL(route.request().url()),path=u.pathname;
      if(u.origin!==base){const cb=u.searchParams.get('jsonpCallback');return route.fulfill({contentType:cb?'application/javascript':path.endsWith('.css')?'text/css':'application/json',headers:{'access-control-allow-origin':'*'},body:cb?cb+'({site_pv:1})':path.endsWith('.css')?'':'{}'});}
      const json=(doc,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(doc)});
      if(path==='/auth/session')return json(guest?{error:'unauthorized'}:{enabled:true,user:{id:'diagnostic',name:'Test'},csrf:'test-only'},guest?401:200);
      if(path==='/auth/preferences')return json({userId:'diagnostic',entries:[],cursor:0,more:false,acknowledged:[]});
      if(path==='/api/public-preview')return json(preview);
      if(path==='/jobs-index.json')return guest?json({error:'unauthorized'},401):json(index);
      if(path==='/jobs-version.json')return guest?json({error:'unauthorized'},401):json({dataVersion:index.dataVersion});
      if(path==='/')return route.fulfill({contentType:'text/html',body:html.replace('<html lang="zh-CN">','<html lang="zh-CN" data-auth-state="'+(guest?'guest':'authenticated')+'">')});
      const file=resolve(root,'.'+decodeURIComponent(path));
      if(!file.startsWith(root+'/'))return route.fulfill({status:403,body:''});
      if(existsSync(file))return route.fulfill({contentType:mime[extname(file)]||'application/octet-stream',body:readFileSync(file)});
      if(/\.(png|webp|ico|woff2?|svg)$/.test(path))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>'});
      return route.fulfill({status:404,body:''});
    });
    results.push(await inspect(await context.newPage(),{engine,width,guest,kind:'fixture',mode:guest?'guest':'authenticated'}));
    await context.close();
   }
  }
  for(const width of [390,1280]){
   const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:width<=390?3:1,isMobile:width<=390,hasTouch:width<=390,locale:'zh-CN',timezoneId:'Asia/Shanghai'});
   const page=await context.newPage();
   const result=await inspect(page,{engine,width,guest:true,kind:'live',mode:'guest'});
   if(!result.error) {
    try{result.preview=await page.evaluate(async()=>{const r=await fetch('/api/public-preview',{cache:'no-store'});const p=await r.json();return {status:r.status,updated:p.previewOverview?.updated,version:p.dataVersion,latest:p.jobs?.slice(0,3)?.map(x=>({pushTime:x.pushTime,firstSeen:x.firstSeen}))};}); console.log('LIVE_DATA '+JSON.stringify({engine,width,preview:result.preview}));}catch(e){console.log('LIVE_FETCH_ERROR '+e.message);}
   }
   results.push(result);await context.close();
  }
 }finally{await browser.close();}
}
writeFileSync(resolve(out,'results.json'),JSON.stringify(results,null,2));
const fixtureErrors=errors.filter(x=>x.kind==='fixture');
if(fixtureErrors.length)throw Error('Diagnostic fixture failure: '+JSON.stringify(fixtureErrors));
console.log('STAMP_DIAGNOSTIC_COMPLETE '+JSON.stringify({fixture:results.filter(x=>x.kind==='fixture').length,live:results.filter(x=>x.kind==='live').length,errors:errors.length}));
