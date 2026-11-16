import {assertRegionProjections,assertRegionVisualBalance,assertRegionContourEdge} from './assert_region_projections.mjs';
/* Visual geometry for actual shipped left charts, paired with full homepage boot CI. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
const root=new URL('../',import.meta.url),read=name=>readFileSync(new URL(name,root),'utf8');
const html=read('index.html'),app=read('app.js');
const analytics=html.match(/<div class="analytics reveal"[\s\S]*?(?=<\/header>)/)?.[0];assert.ok(analytics);
const styles=['styles.css','styles-list.css','layout-fixes.css','styles-company.css','styles-refinement.css','cn-city-map.css','market-width.css','next-journey-masthead.css','home.css'].map(read).join('\n');
const start=app.indexOf('    const rc={CN:0,HK:0,SG:0,OTHER:0};'),tag="    requestAnimationFrame(()=>sparkEl.classList.add('is-ready'));",end=app.indexOf(tag,start)+tag.length;
assert.ok(start>=0&&end>start);const draw=app.slice(start,end);
const rows=JSON.parse(read('jobs-index.json')).jobs.filter(j=>j.jobStatus!=='expired');
const out=new URL('artifacts/calendar-axes/',root);mkdirSync(out,{recursive:true});
const results=[];
// CALENDAR_BROWSERS=chromium lets hosts without WebKit libraries run the Chromium half.
const engines=(process.env.CALENDAR_BROWSERS||'chromium,webkit').split(',');
for(const [engine,type] of Object.entries({chromium,webkit}).filter(([name])=>engines.includes(name))){
 const browser=await type.launch({headless:true});
 try{for(const width of [320,390,1440])for(const theme of ['light','dark']){
  const page=await browser.newPage({viewport:{width,height:1000},colorScheme:theme,timezoneId:'Asia/Shanghai'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<!doctype html><html data-theme="'+theme+'"><head><style>'+styles+'</style></head><body><div class="shell"><header class="masthead">'+analytics+'</header></div></body></html>');
  await page.addScriptTag({content:read('market-width.js')});
  await page.evaluate(({draw,rows})=>{
   const norm=loc=>['HK','SG','CN'].includes(loc)?loc:'OTHER',seenAt=j=>j.firstSeen||j.pushTime;
   const keyOf=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
   const dayKey=d=>keyOf(new Date(d)),REGIONS={HK:{label:'Hong Kong'},SG:{label:'Singapore'},CN:{label:'Mainland China'},OTHER:{label:'Other'}},cityEl=document.createElement('select');
   new Function('chartData','norm','seenAt','dayKey','keyOf','REGIONS','cityEl',draw)(rows,norm,seenAt,dayKey,keyOf,REGIONS,cityEl);
  },{draw,rows});
  const projections=await assertRegionProjections(page);
  const visualBalance=await assertRegionVisualBalance(page);
  const rightEdge=await assertRegionContourEdge(page);
  const state=await page.evaluate(()=>{
   const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width};};
   const svg=document.querySelector('#dist svg');
   return {plot:rect(svg),dates:[...document.querySelectorAll('#dist .region-spark-date')].map(n=>({text:n.textContent,date:n.dataset.date,box:rect(n)})),weeks:[...document.querySelectorAll('#spark .rhythm-axis-label')].map(n=>({text:n.textContent,day:Number(n.dataset.day),date:n.dataset.date,box:rect(n)})),labels:[...document.querySelectorAll('.region-end-label')].map(n=>({region:n.dataset.region,count:Number(n.dataset.count),box:rect(n)})),arrows:[...document.querySelectorAll('.region-measure-height')].map(n=>({region:n.dataset.region,count:Number(n.dataset.count),lo:Number(n.dataset.lower),hi:Number(n.dataset.upper),x:Number(n.getAttribute('x1')),y1:Number(n.getAttribute('y1')),y2:Number(n.getAttribute('y2'))})),max:Number(svg.dataset.axisMax),total:Number(svg.dataset.finalTotal),ranges:document.querySelectorAll('.chart-date-range').length,scrollWidth:document.documentElement.scrollWidth};
  });
  const type = await page.evaluate(()=>[...document.querySelectorAll('.region-end-label')].map(label=>{
   const parts=['name','count','share'].map(part=>{
    const node=label.querySelector('.region-end-'+part),r=node.getBoundingClientRect(),s=getComputedStyle(node);
    return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,font:s.fontFamily,size:parseFloat(s.fontSize),weight:s.fontWeight,numeric:s.fontVariantNumeric};
   });
   return {parts,siteFont:getComputedStyle(document.body).fontFamily};
  }));
  for(const {parts:[name,count,share],siteFont} of type){
   assert.ok(name.bottom+2<=count.y,'region acronym must occupy a separate first line');
   assert.ok(Math.abs(name.x-count.x)<1,'both lines must share their left edge');
   assert.ok(share.x>=count.right+5,'percentage must not crowd the count');
   assert.ok(share.y<count.bottom&&share.bottom>count.y,'count and share stay on the second line');
   for(const part of [name,count,share])assert.equal(part.font,siteFont,'reuse the site sans family');
   assert.equal(name.weight,'500');assert.equal(count.weight,'400');assert.equal(share.weight,'400');
   assert.equal(count.size,width<=360?14.5:width<=720?15:16);assert.ok(count.size>name.size&&count.size>share.size);
   assert.ok(count.numeric.includes('tabular-nums'),'keep aligned figures without monospaced letterforms');
  }
  for(const marks of [state.dates,state.weeks])for(let i=1;i<marks.length;i++)assert.ok(marks[i].box.x>=marks[i-1].box.right-1,'calendar text collision');
  for(let i=1;i<state.weeks.length;i++)assert.equal(state.weeks[i].day-state.weeks[i-1].day,7);
  assert.ok(state.weeks.every(t=>new Date(t.date+'T00:00:00Z').getUTCDay()===1));
  for(let i=0;i<state.arrows.length;i++){
   const a=state.arrows[i];assert.equal(a.x,[78,143,222][i]);assert.equal(a.count,a.hi-a.lo);
   assert.ok(Math.abs(a.y1-a.y2-a.count/state.max*308)<.03,'true-height arrow changed');
   const label=state.labels.find(l=>l.region===a.region);assert.equal(label.count,a.count);
   assert.ok(Math.abs(label.box.x-(state.plot.x+a.x/520*state.plot.width)-16)<1,'arrow and label must move together');
   assert.ok(label.box.right<=state.plot.right+1,'annotation overflow');
   assert.ok(label.box.x>=state.plot.x,'annotation must stay inside the plot');
   if(i){const prev=state.labels[i-1];assert.ok(label.box.x-prev.box.x>=state.plot.width*64/520,'annotations must breathe horizontally');assert.ok(label.box.bottom<=prev.box.y+1,'regional labels overlap');}
  }
  assert.equal(state.labels.reduce((s,l)=>s+l.count,0),state.total);assert.equal(state.ranges,0);assert.ok(state.scrollWidth<=width+2);assert.deepEqual(errors,[]);
  await page.locator('.analytics-left').screenshot({path:new URL(engine+'-'+width+'-'+theme+'.png',out).pathname,animations:'disabled'});
  results.push({engine,width,theme,state,typography:type,projections,visualBalance,rightEdge,errors});
  // Text must stay unobstructed after rotation and a late change in font metrics.
  if(width===390){
   await page.setViewportSize({width:320,height:1000});await assertRegionProjections(page);await assertRegionContourEdge(page);
   await page.addStyleTag({content:'#dist .region-end-label{letter-spacing:.15em} #dist .region-end-count{font-size:20px}'});
   await assertRegionProjections(page);
  }
  await page.close();
 }}finally{await browser.close();}
}
writeFileSync(new URL('results.json',out),JSON.stringify(results,null,2));console.log('Calendar/annotation visual matrix passed: '+results.length+' cases.');
