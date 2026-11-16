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

  // The editorial masthead is also a direct route to the job-search tools.
  assert.equal(await page.locator('.nj-browse-roles').getAttribute('href'),'#roles');
  await page.locator('.nj-browse-roles').click();
  assert.equal(await page.evaluate(()=>location.hash),'#roles','Browse all roles targets the full search toolbar without filtering');
  assert.equal(await page.locator('#regions .seg[data-region="all"]').getAttribute('aria-selected'),'true');

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
  // The final day owns a full slot at the right edge, not a sub-pixel sliver.
  const slotPx=await page.evaluate(()=>{const svg=document.querySelector('#dist svg');return Number(document.querySelector('#dist .region-hover-capture').getAttribute('width'))/Number(svg.dataset.dayBins)*svg.getBoundingClientRect().width/svg.viewBox.baseVal.width;});
  await page.mouse.move(box.x+box.width-slotPx*.45,box.y+box.height/2);
  t=await tip(page);
  const finalTotal=await page.evaluate(()=>Number(document.querySelector('#dist svg').dataset.finalTotal));
  const total=Number((t?.text.match(/Total\s+([\d,]+)/)||[])[1]?.replace(/,/g,''));
  assert.equal(total,finalTotal,'the right-edge reading equals the plotted cumulative total');
  await page.mouse.move(0,0);

  // Market Width: open on the latest ended day, while 30-day manual history remains accessible.
  const mw=await page.evaluate(()=>({key:document.getElementById('marketWidthDate').getAttribute('aria-label'),partial:document.getElementById('marketWidthDate').dataset.partial,selected:[...document.querySelectorAll('.mw-strip-day')].findIndex(b=>b.classList.contains('is-selected')),days:document.querySelectorAll('.mw-strip-day').length}));
  assert.equal(mw.partial,'false','Market Width opens on the latest ended calendar date');
  assert.equal(mw.days,30);
  await page.locator('.mw-strip-day').nth(5).click();
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.mw-strip-day')].findIndex(b=>b.classList.contains('is-selected'))),5,'strip selects a day');
  await page.locator('#marketWidthNext').click();
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.mw-strip-day')].findIndex(b=>b.classList.contains('is-selected'))),6,'arrows and strip share one selection');

  // Seven-day loop: starts at day 23, walks newest seven buckets and can be
  // paused. It does not change the accessible 30-day manual date strip.
  const play=page.locator('#marketWidthPlay');
  assert.equal(await play.getAttribute('aria-pressed'),'false');
  await play.click();
  assert.equal(await play.getAttribute('aria-pressed'),'true');
  const selectedDay=()=>page.evaluate(()=>[...document.querySelectorAll('.mw-strip-day')].findIndex(b=>b.classList.contains('is-selected')));
  assert.equal(await selectedDay(),23,'play starts exactly seven calendar buckets from the end');
  if((engine==='chromium'&&theme==='light')||(engine==='webkit'&&theme==='dark')){
   await page.locator('.ac-col-market').screenshot({path:resolve(out,`market-width-playing-${engine}-1280-${theme}.png`),animations:'disabled'});
  }
  // A screenshot can scroll the page under the stationary pointer. Leave the
  // treemap so the intentionally hover-paused transport may resume.
  await page.mouse.move(0,0);
  if(engine==='chromium'&&theme==='light'){
   const diagnostic=await page.evaluate(()=>{
    const panel=document.querySelector('.ac-col-market').getBoundingClientRect();
    return {hover:document.getElementById('marketWidthMap').matches(':hover'),
      focused:document.activeElement?.id,hidden:document.hidden,
      panelVisible:panel.bottom>0&&panel.top<innerHeight};
   });
   assert.equal(diagnostic.hover,false,'timer should advance only after pointer leaves the treemap: '+JSON.stringify(diagnostic));
   assert.equal(diagnostic.panelVisible,true,'the displayed chart must be in view for playback: '+JSON.stringify(diagnostic));
   await page.waitForFunction(()=>[...document.querySelectorAll('.mw-strip-day')].findIndex(b=>b.classList.contains('is-selected'))===24,null,{timeout:7000});
   assert.equal(await selectedDay(),24,'timer advances one real day without losing the selected bar');
  }
  await play.click();
  assert.equal(await play.getAttribute('aria-pressed'),'false','pause is an accessible, persistent state');
  const pausedDay=await selectedDay();
  await play.click();
  assert.equal(await selectedDay(),pausedDay,'resuming the loop must not jump back to the first day');
  await play.click();
  assert.equal(await play.getAttribute('aria-pressed'),'false');
  await page.locator('.mw-strip-day').nth(5).click();
  assert.equal(await selectedDay(),5,'historical day remains available after stopping playback');
  assert.equal(await play.getAttribute('aria-pressed'),'false','manual date selection never reactivates playback');

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
  assert.equal(await page.locator('.nj-browse-roles').getAttribute('href'),'#roles');
  const play=page.locator('#marketWidthPlay');
  await play.tap();
  assert.equal(await play.getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.mw-strip-day')].findIndex(b=>b.classList.contains('is-selected'))),23);
  if(engine==='webkit'&&theme==='dark')await page.locator('.ac-col-market').screenshot({path:resolve(out,'market-width-playing-webkit-390-dark.png'),animations:'disabled'});
  await play.tap();
  assert.equal(await play.getAttribute('aria-pressed'),'false','a second phone tap pauses the seven-day loop');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth<=1),'playback controls cannot introduce sideways scrolling');
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

// The newly added transport must also fit the smallest supported phone.
async function narrowPlayback(browser,engine){
 const {context,page,errors,timing}=await open(browser,{width:320,theme:'dark',touch:true});
 try{
  const play=page.locator('#marketWidthPlay');
  await play.tap();
  assert.equal(await play.getAttribute('aria-pressed'),'true');
  const bounds=await page.evaluate(()=>{
   const button=document.getElementById('marketWidthPlay').getBoundingClientRect();
   const date=document.getElementById('marketWidthDate').getBoundingClientRect();
   return {left:button.left,right:button.right,top:button.top,bottom:button.bottom,
    dateRight:date.right,overflow:document.documentElement.scrollWidth-innerWidth,
    selected:[...document.querySelectorAll('.mw-strip-day')].findIndex(b=>b.classList.contains('is-selected'))};
  });
  assert.ok(bounds.left>=0&&bounds.right<=320,'seven-day play control must not clip at 320px: '+JSON.stringify(bounds));
  assert.ok(bounds.overflow<=1,'no horizontal scroll at 320px: '+JSON.stringify(bounds));
  assert.equal(bounds.selected,23,'the phone loop must still use only the newest seven days');
  await page.locator('.ac-col-market').screenshot({path:resolve(out,`market-width-playing-${engine}-320-dark.png`),animations:'disabled'});
  await play.tap();
  assert.equal(await play.getAttribute('aria-pressed'),'false');
  assert.deepEqual(errors,[],'320px browser must not emit application errors');
  evidence.push({engine,width:320,theme:'dark',touch:true,timing,playbackBounds:bounds});
 }finally{await context.close();}
}
const engines=(process.env.INTERACTION_BROWSERS||'chromium,webkit').split(',');
for(const [engine,type] of Object.entries({chromium,webkit}).filter(([name])=>engines.includes(name))){
 const browser=await type.launch({headless:true});
 try{
  for(const theme of ['light','dark'])await desktop(browser,engine,theme);
  for(const theme of ['light','dark'])await phone(browser,engine,theme);
  await narrowPlayback(browser,engine);
 }finally{await browser.close();}
}
// Generous ceiling for a cold local boot of the full 15k-row index; the logged
// timings are the evidence, the ceiling only catches gross regressions.
for(const e of evidence)assert.ok(e.timing.charts<15000&&e.timing.list<25000,'load timing regression: '+JSON.stringify(e));
writeFileSync(resolve(out,'results.json'),JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence));
console.log(`Homepage interaction passed: ${evidence.length} cases.`);
