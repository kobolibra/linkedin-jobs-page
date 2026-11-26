import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,existsSync,statSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import {publicPreviewPayload,previewData} from './guest_preview.mjs';
const root=resolve('.');
const output=resolve('artifacts/employer-mode');mkdirSync(output,{recursive:true});
const firms=['HSBC','Citi','Goldman Sachs','Morgan Stanley','JPMorgan Chase','DBS Bank','BlackRock','Michael Page','Hays','Randstad','Unlisted'];
const now=new Date(),day=i=>new Date(now.getTime()-i*86400000).toISOString();
const jobs=Array.from({length:99},(_,i)=>({title:'Finance Role '+i,company:firms[i%firms.length],employerType:i%firms.length<7?'direct_employer':i%firms.length===10?'unlisted':'recruitment_agency',link:'https://www.linkedin.com/jobs/view/'+(1234567890+i),location:['CN','HK','SG'][i%3],city:['Shanghai','Hong Kong','Singapore'][i%3],firstSeen:day(i%26),postingLastDate:day(i%26),pushTime:day(i%26),jobStatus:'active'}));
const index={employerModeSchema:1,source:'jobs.json',dataVersion:'a'.repeat(64),jobs,updatedAt:now.toISOString(),companyLogos:{},postingHistoryDaily:{},postingHistoryDailyByMode:{direct:{},agency:{}}};
const guest=publicPreviewPayload(previewData(index,{},now.getTime()),index,now.getTime());
const totals={full:jobs.length,direct:jobs.filter(j=>j.employerType==='direct_employer').length,agency:jobs.filter(j=>j.employerType!=='direct_employer').length};
const types={'.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2'};
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 for(const [width,theme,isGuest] of [[1440,'light',false],[390,'dark',false],[390,'light',true]]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  await context.addInitScript(({theme})=>{if(!localStorage.getItem('theme'))localStorage.setItem('theme',theme);},{theme});
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='mode.test')return route.abort();
   const path=url.pathname;
   if(path==='/auth/session')return route.fulfill({status:isGuest?401:200,contentType:'application/json',body:JSON.stringify({enabled:false})});
   if(path==='/jobs-version.json')return route.fulfill({contentType:'application/json',body:JSON.stringify({dataVersion:index.dataVersion})});
   if(path==='/jobs-index.json')return route.fulfill({contentType:'application/json',body:JSON.stringify(index)});
   if(path==='/api/public-preview')return route.fulfill({contentType:'application/json',body:JSON.stringify(guest)});
   const local=resolve(root,path==='/'?'index.html':path.slice(1));
   if(!local.startsWith(root+'/')||!existsSync(local)||!statSync(local).isFile())return route.fulfill({status:404,body:''});
   let body=readFileSync(local);
   if(path==='/'&&isGuest)body=Buffer.from(body.toString().replace('<html lang="zh-CN">','<html lang="zh-CN" data-auth-state="guest">'));
   return route.fulfill({status:200,contentType:types[extname(local)]||'application/octet-stream',body});
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://mode.test/');
  const wait=async mode=>page.waitForFunction(({mode,total})=>document.documentElement.dataset.employerMode===mode&&document.getElementById('stat-total')?.textContent.replace(/,/g,'')===String(total),{mode,total:totals[mode]},{timeout:30000});
  await wait('full');
  for(const mode of ['direct','agency','full']){
   await page.selectOption('#employerMode',mode);
   await wait(mode);
   assert.equal(await page.locator('#employerMode').inputValue(),mode);
   const geometry=await page.evaluate(()=>{const about=document.querySelector('.nj-about-link').getBoundingClientRect(),mode=document.getElementById('employerMode').getBoundingClientRect(),theme=document.getElementById('themeToggle').getBoundingClientRect(),brand=document.querySelector('.nj-brand').getBoundingClientRect();return {ordered:about.right<=mode.left+1&&mode.right<=theme.left+1,within:about.left>=0&&theme.right<=innerWidth,brandSeparate:brand.right<=about.left+1||brand.bottom<=about.top+1};});
   assert.deepEqual(geometry,{ordered:true,within:true,brandSeparate:true});
   await page.locator('.nj-brand-row').screenshot({path:resolve(output,width+'-'+theme+(isGuest?'-guest':'')+'-'+mode+'.png')});
   await page.reload();await wait(mode);
  }
  assert.deepEqual(errors,[]);
  await context.close();
 }
}finally{await browser.close();}
