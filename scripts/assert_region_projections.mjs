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
