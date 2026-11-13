/* Shared assertions for real browser projection geometry; no request stubs. */
import assert from 'node:assert/strict';
export async function assertRegionProjections(page){
 await page.waitForFunction(()=>document.querySelector('#dist .region-projections')?.dataset.ready==='true');
 await page.evaluate(async()=>{await document.fonts.ready;for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
 const state=await page.evaluate(()=>{
  const svg=document.querySelector('#dist .region-time-svg'),box=svg.getBoundingClientRect();
  const sx=svg.viewBox.baseVal.width/box.width,sy=svg.viewBox.baseVal.height/box.height;
  const labels=[...document.querySelectorAll('#dist .region-end-label')].map(n=>{const r=n.getBoundingClientRect();return {x1:(r.left-box.left-6)*sx,x2:(r.right-box.left+6)*sx,y1:(r.top-box.top-4)*sy,y2:(r.bottom-box.top+4)*sy};});
  const refs=[...svg.querySelectorAll('.region-measure-reference')].map(n=>({level:+n.dataset.level,x:+n.getAttribute('x2'),y:+n.getAttribute('y1'),opacity:+getComputedStyle(n).opacity})).filter(r=>r.level>0);
  const groups=[...svg.querySelectorAll('.region-projection')].map(n=>({level:+n.dataset.level,start:+n.dataset.start,end:+n.dataset.end,y:+n.dataset.y,segments:[...n.querySelectorAll('line')].map(l=>({a:+l.getAttribute('x1'),b:+l.getAttribute('x2'),y1:+l.getAttribute('y1'),y2:+l.getAttribute('y2'),opacity:+getComputedStyle(l).opacity,events:getComputedStyle(l).pointerEvents}))}));
  return {labels,refs,groups,right:+svg.dataset.plotRight};
 });
 assert.deepEqual(state.groups.map(g=>g.level),state.refs.map(r=>r.level),'only unique, nonzero cumulative boundaries are projected');
 for(const [i,g] of state.groups.entries()){
  const ref=state.refs[i];assert.equal(g.start,ref.x);assert.equal(g.end,state.right);assert.equal(g.y,ref.y);
  let last=g.start;
  for(const s of g.segments){
   assert.ok(s.b>s.a&&s.a>=last-.002&&s.b<=g.end+.002,'segments are ordered and bounded');last=s.b;
   assert.equal(s.y1,g.y);assert.equal(s.y2,g.y);
   assert.ok(s.opacity>0&&s.opacity<ref.opacity,'far projections remain lighter than local measures');assert.equal(s.events,'none');
   for(const r of state.labels)if(g.y>=r.y1&&g.y<=r.y2)assert.ok(s.b<=r.x1+.002||s.a>=r.x2-.002,'projection must not cross a padded label box');
  }
  // Independently sample the intended span: every unblocked point must have
  // a projection, and every padded text interval must remain a real gap.
  for(let k=0;k<=100;k++){
   const x=g.start+(g.end-g.start)*k/100;
   const blocked=state.labels.some(r=>g.y>=r.y1&&g.y<=r.y2&&x>r.x1+.003&&x<r.x2-.003);
   const visible=g.segments.some(s=>x>=s.a-.002&&x<=s.b+.002);
   if(blocked)assert.equal(visible,false);else if(!state.labels.some(r=>g.y>=r.y1&&g.y<=r.y2&&Math.min(Math.abs(x-r.x1),Math.abs(x-r.x2))<.004))assert.equal(visible,true,'unblocked span must reach the actual curve endpoint');
  }
 }
 return state;
}

// Check the complete weight hierarchy, not only line existence.
export async function assertRegionVisualBalance(page){
 const state=await page.evaluate(()=>{
  const all=selector=>[...document.querySelectorAll('#dist '+selector)].map(n=>{const s=getComputedStyle(n);return {width:parseFloat(s.strokeWidth),opacity:Number(s.opacity),font:s.fontFamily,size:parseFloat(s.fontSize),weight:s.fontWeight,color:s.color};});
  return {viewport:innerWidth,dark:document.documentElement.dataset.theme==='dark',siteFont:getComputedStyle(document.body).fontFamily,refs:all('.region-measure-reference'),projections:all('.region-projection-line'),arrows:all('.region-measure-height'),tips:all('.region-measure-arrow'),contours:all('.region-spark-line'),names:all('.region-end-name'),counts:all('.region-end-count'),shares:all('.region-end-share')};
 });
 for(const n of state.refs){assert.equal(n.width,.85);assert.equal(n.opacity,.42);}
 for(const n of state.projections){assert.equal(n.width,.85);assert.equal(n.opacity,state.dark?.34:.36);}
 for(const n of state.arrows){assert.equal(n.width,.85);assert.equal(n.opacity,.6);}
 for(const n of state.tips){assert.equal(n.width,.85);assert.equal(n.opacity,.64);}
 for(const n of state.contours)assert.equal(n.width,1.6,'data contours remain primary');
 for(const [kind,weight] of [['names','500'],['counts','400'],['shares','400']])for(const n of state[kind]){
  assert.equal(n.font,state.siteFont);assert.equal(n.weight,weight);assert.equal(n.opacity,1,'readable text is not faded');
 }
 for(const n of state.counts)assert.equal(n.size,state.viewport<=360?14.5:state.viewport<=720?15:16);
 for(const n of state.names)assert.ok(n.size>=10&&n.size<=10.5);
 for(const n of state.shares)assert.ok(n.size>=9.5&&n.size<=10.5);
 return state;
}
