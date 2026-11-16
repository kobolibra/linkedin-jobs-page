/* Homepage interaction acceptance on the real shipped page and canonical data:
   keyboard, touch, date navigation, drill-down, mobile density and overflow,
   tooltip bounds and load timing. Auth endpoints are local fixtures only. */
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from 'playwright';
const root=resolve(new URL('..',import.meta.url).pathname);
const base='http://127.0.0.1:47652';
const index=JSON.parse(readFileSync(resolve(root,'jobs-index.json'),'utf8'));
const html=readFileSync(resolve(root,'index.html'),'utf8');
const out=resolve(root,'artifacts/homepage-interaction');mkdirSync(out,{recursive:true});
const mime={'.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff':'font/woff'};
const evidence=[];

async function open(browser,{width,theme='light',touch=false}){
 const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1,colorScheme:theme,locale:'zh-CN',timezoneId:'Asia/Shanghai',hasTouch:touch,isMobile:touch&&width<=720,reducedMotion:'reduce'});
 await context.addInitScript(t=>{try{localStorage.setItem('theme',t);}catch{}},theme);
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&m.text().includes('[jobs]'))errors.push(m.text());});
 await context.route('**/*',route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  if(url.origin!==base){const cb=url.searchParams.get('jsonpCallback');return route.fulfill({status:200,contentType:cb?'application/javascript':'application/json',body:cb?`${cb}({site_pv:1})`:'{}'});}
  const json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  if(path==='/auth/session')return json({enabled:true,user:{id:'interaction-test',name:'Regression'},csrf:'test-only'});
  if(path==='/auth/preferences')return json({userId:'interaction-test',entries:[],cursor:0,more:false,acknowledged:[]});
  if(path==='/jobs-index.json')return json(index);
  if(path==='/jobs-version.json')return json({dataVersion:index.dataVersion});
  if(path==='/')return route.fulfill({contentType:'text/html',body:html.replace('<html lang="zh-CN">','<html lang="zh-CN" data-auth-state="authenticated">')});
  const file=resolve(root,'.'+decodeURIComponent(path));
  if(file.startsWith(root+'/')&&existsSync(file))return route.fulfill({contentType:mime[extname(file)]||'application/octet-stream',body:readFileSync(file)});
  if(/\.(?:png|webp|ico|woff2?|svg)$/.test(path))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'});
  return route.fulfill({status:404,body:''});
 });
 const t0=Date.now();
 await page.goto(base+'/',{waitUntil:'domcontentloaded'});
 await page.waitForSelector('#dist svg',{state:'attached',timeout:30000});
 const charts=Date.now()-t0;
 await page.waitForFunction(()=>typeof renderReady!=='undefined'&&renderReady&&document.querySelector('#jobs .job'),null,{timeout:30000});
 const list=Date.now()-t0;
 await page.evaluate(()=>document.fonts.ready);
 return {context,page,errors,timing:{charts,list}};
}
// Let scroll events from scrollIntoView fire before pointer input.
const settle=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const tip=page=>page.evaluate(()=>{const t=document.querySelector('.viz-tip');if(!t||t.hidden)return null;const r=t.getBoundingClientRect();return {text:t.innerText,left:r.left,right:r.right,top:r.top,bottom:r.bottom};});
const inViewport=(box,width)=>box&&box.left>=0&&box.right<=width&&box.top>=0&&box.bottom<=900;

async function desktop(browser,engine,theme){
 const width=1280,{context,page,errors,timing}=await open(browser,{width,theme});
 try{
  // Layout density: no metric overflows its cell and the page never scrolls sideways.
  const density=await page.evaluate(()=>({
   overflow:document.documentElement.scrollWidth-innerWidth,
   stats:[...document.querySelectorAll('.stats .stat')].map(n=>({cls:n.className,clipped:n.scrollWidth>n.clientWidth+1})),
   top30Open:!document.getElementById('top50').hidden,
   ageText:document.getElementById('stat-age').textContent
  }));
  assert.ok(density.overflow<=1,'no horizontal overflow at '+width);
  assert.ok(density.stats.every(s=>!s.clipped),'no metric is clipped: '+JSON.stringify(density.stats));
  assert.equal(density.top30Open,false,'Top 30 starts folded so the job list stays close to the fold');
  const toolbarTop=await page.evaluate(()=>Math.round(document.querySelector('.toolbar').getBoundingClientRect().top+scrollY));
  assert.ok(toolbarTop<1700,'job-list controls stay within two screens on desktop: '+toolbarTop);
  assert.match(density.ageText,/^\d+$/,'median listing age is a whole number of days');

  // Hero coverage rows filter the list by market.
  await page.locator('.nj-market-row[data-region="HK"]').click();
  await page.waitForFunction(()=>activeRegion==='HK');
  assert.ok(await page.evaluate(()=>listRuntime.view.rows.every(i=>listRuntime.meta[i].region==='HK')),'hero row applies the HK filter');
  await page.locator('#regions .seg[data-region="all"]').click();

  // Daily flow: one tab stop, arrow keys move by day, the tooltip follows focus.
  const spark=page.locator('#spark');await spark.scrollIntoViewIfNeeded();
  const stops=await page.evaluate(()=>[...document.querySelectorAll('#spark .rhythm-point')].filter(n=>n.tabIndex===0).length);
  assert.equal(stops,1,'thirty columns share one tab stop');
  await page.locator('#spark .rhythm-point[tabindex="0"]').focus();
  let t=await tip(page);assert.ok(t&&/so far/.test(t.text),'latest column reads as still collecting');
  await page.keyboard.press('ArrowLeft');
  const focused=await page.evaluate(()=>document.activeElement?.dataset.day);
  assert.equal(focused,'28','ArrowLeft moves to the previous day');
  t=await tip(page);assert.ok(t&&/Total/.test(t.text)&&/7-day average/.test(t.text),'keyboard focus shows the daily breakdown');
  assert.ok(inViewport(t,width),'tooltip stays inside the viewport');
  await page.keyboard.press('Home');
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset.day),'0');
  await page.keyboard.press('End');
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset.day),'29');
  // Segments always add up to the printed daily count.
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('#spark .rhythm-point')].every(g=>[...g.querySelectorAll('.rhythm-seg')].reduce((n,s)=>n+Number(s.dataset.count),0)===Number(g.dataset.total))));

  // Fig. 01 crosshair reading matches the plotted right-edge total.
  const capture=page.locator('#dist .region-hover-capture');await capture.scrollIntoViewIfNeeded();await settle(page);
  const box=await capture.boundingBox();
  await page.mouse.move(box.x+box.width-.2,box.y+box.height/2);
  t=await tip(page);
  const finalTotal=await page.evaluate(()=>Number(document.querySelector('#dist svg').dataset.finalTotal));
  const total=Number((t?.text.match(/Total\s+([\d,]+)/)||[])[1]?.replace(/,/g,''));
  assert.equal(total,finalTotal,'the right-edge reading equals the plotted cumulative total');
  await page.mouse.move(0,0);

  // Market Width: the default is the latest complete day; strip and arrows navigate.
  const mw=await page.evaluate(()=>({key:document.getElementById('marketWidthDate').getAttribute('aria-label'),partial:document.getElementById('marketWidthDate').dataset.partial,selected:[...document.querySelectorAll('.mw-strip-day')].findIndex(b=>b.classList.contains('is-selected')),days:document.querySelectorAll('.mw-strip-day').length}));
  assert.equal(mw.partial,'false','Market Width opens on a fully collected day');
  assert.equal(mw.days,30);
  await page.locator('.mw-strip-day').nth(5).click();
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.mw-strip-day')].findIndex(b=>b.classList.contains('is-selected'))),5,'strip selects a day');
  await page.locator('#marketWidthNext').click();
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.mw-strip-day')].findIndex(b=>b.classList.contains('is-selected'))),6,'arrows and strip share one selection');

  // Top 30: opening it is remembered across visits.
  await page.locator('#top50Toggle').click();
  assert.equal(await page.locator('#top50').isHidden(),false);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof renderReady!=='undefined'&&renderReady&&document.querySelector('#top50 .bubble-row'),null,{timeout:30000});
  assert.equal(await page.locator('#top50').isHidden(),false,'an opened Top 30 stays open on the next visit');
  assert.equal(await page.locator('#top50Toggle').getAttribute('aria-expanded'),'true');
  // Keyboard focus shows exact numbers; Enter drills into the institution.
  const bubble=page.locator('#top50 .bubble-row').last();await bubble.scrollIntoViewIfNeeded();
  await bubble.focus();
  t=await tip(page);const company=await bubble.getAttribute('data-company');
  assert.ok(t&&t.text.includes(company)&&/Active roles/.test(t.text),'focused bubble shows its exact numbers');
  assert.ok(await page.evaluate(()=>document.querySelector('#top50').classList.contains('is-inspecting')));
  await page.keyboard.press('Enter');
  await page.waitForFunction(name=>document.getElementById('company').value===name,company);
  await page.screenshot({path:resolve(out,`${engine}-${width}-${theme}.png`)});
  assert.equal(errors.length,0,errors.join('\n'));
  evidence.push({engine,width,theme,timing,marketWidthDefault:mw.key});
 }finally{await context.close();}
}

async function phone(browser,engine,theme){
 const width=390,{context,page,errors,timing}=await open(browser,{width,theme,touch:true});
 try{
  const state=await page.evaluate(()=>({
   overflow:document.documentElement.scrollWidth-innerWidth,
   top30Open:!document.getElementById('top50').hidden,
   stats:[...document.querySelectorAll('.stats .stat')].map(n=>n.scrollWidth>n.clientWidth+1),
   smallest:Math.min(...[...document.querySelectorAll('.fig-dek,.stat-note,.mw-summary,.nj-market-row')].map(n=>parseFloat(getComputedStyle(n).fontSize)))
  }));
  assert.ok(state.overflow<=1,'no horizontal page overflow on a phone');
  assert.equal(state.top30Open,false,'Top 30 starts folded on phones');
  assert.ok(state.stats.every(c=>!c),'metrics fit their cells on a phone');
  assert.ok(state.smallest>=11,'body copy on phones stays at least 11px');
  // Touch: the first tap on a bubble reads it, the second opens its roles.
  await page.locator('#top50Toggle').tap();
  const bubble=page.locator('#top50 .bubble-row').first();
  await page.evaluate(()=>document.querySelector('#top50').scrollLeft=0);
  await bubble.scrollIntoViewIfNeeded();
  const company=await bubble.getAttribute('data-company');
  const before=await page.evaluate(()=>document.getElementById('company').value);
  await bubble.locator('.bubble-point').tap({force:true});
  const t=await tip(page);
  assert.ok(t&&t.text.includes(company),'first tap shows the institution');
  assert.ok(t.left>=0&&t.right<=width,'tooltip stays on screen on a phone');
  assert.equal(await page.evaluate(()=>document.getElementById('company').value),before,'first tap does not navigate');
  await bubble.locator('.bubble-point').tap({force:true});
  await page.waitForFunction(name=>document.getElementById('company').value===name,company);
  // Daily flow on touch: a tap reads the column and the reading stays after lift.
  await page.locator('#spark').scrollIntoViewIfNeeded();
  await page.locator('#spark .rhythm-point[data-day="20"] .rhythm-bar-hit').tap({force:true});
  assert.ok((await tip(page))?.text.includes('Total'),'tap on a day shows its breakdown');
  await page.locator('.mw-encoding').tap();
  assert.equal(await tip(page),null,'tapping elsewhere dismisses the reading');
  await page.screenshot({path:resolve(out,`${engine}-${width}-${theme}-touch.png`)});
  assert.equal(errors.length,0,errors.join('\n'));
  evidence.push({engine,width,theme,touch:true,timing});
 }finally{await context.close();}
}

const engines=(process.env.INTERACTION_BROWSERS||'chromium,webkit').split(',');
for(const [engine,type] of Object.entries({chromium,webkit}).filter(([name])=>engines.includes(name))){
 const browser=await type.launch({headless:true});
 try{
  for(const theme of ['light','dark'])await desktop(browser,engine,theme);
  for(const theme of ['light','dark'])await phone(browser,engine,theme);
 }finally{await browser.close();}
}
// Generous ceiling for a cold local boot of the full 15k-row index; the logged
// timings are the evidence, the ceiling only catches gross regressions.
for(const e of evidence)assert.ok(e.timing.charts<15000&&e.timing.list<25000,'load timing regression: '+JSON.stringify(e));
writeFileSync(resolve(out,'results.json'),JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence));
console.log(`Homepage interaction passed: ${evidence.length} cases.`);
