import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../row-hover.js',import.meta.url),'utf8');
function setup(){
 const events={},windowEvents={},docEvents={},frames=new Map(),created=[];let next=0,hostReads=0;
 const classes=()=>{const s=new Set();return{add:k=>s.add(k),remove:k=>s.delete(k),contains:k=>s.has(k)};};
 const fine={matches:true,addEventListener:(name,fn)=>fine.changed=fn};
 const host={scrollTop:0,contains:row=>row.owner===host,addEventListener:(k,fn)=>events[k]=fn,getBoundingClientRect:()=>{hostReads++;return{top:100};},appendChild:n=>{n.isConnected=true;created.push(n);}};
 const context={window:{matchMedia:()=>fine,addEventListener:(k,fn)=>windowEvents[k]=fn},document:{getElementById:()=>host,addEventListener:(k,fn)=>docEvents[k]=fn,createElement:()=>({classList:classes(),style:{},offsetWidth:4,setAttribute(k,v){this[k]=v;}})},requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id),getComputedStyle:row=>({getPropertyValue:()=>row.color})};
 vm.runInNewContext(source,context);
 const row=(top,height,color='#9c2a33')=>({owner:host,isConnected:true,color,classList:classes(),reads:0,getBoundingClientRect(){this.reads++;return{top,height};}});
 const over=(row,type='mouse')=>events.pointerover({pointerType:type,target:{closest:()=>row}});
 const flush=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());};
 return{events,windowEvents,docEvents,fine,host,row,over,flush,created,get hostReads(){return hostReads;}};
}
test('one shared full-height rail follows rows; moving inside a row does no extra measurement',()=>{
 const h=setup(),a=h.row(150,80),b=h.row(230,116,'#b07c22');h.over(a);h.flush();
 assert.equal(h.created.length,1);const rail=h.created[0];assert.equal(rail.style.height,'80px');assert.equal(rail.style.transform,'translate3d(0,50px,0)');assert.equal(rail['aria-hidden'],'true');
 h.over(a);h.flush();assert.equal(a.reads,1);h.over(b);h.flush();assert.equal(h.created.length,1);assert.equal(rail.style.height,'116px');assert.equal(rail.style.transform,'translate3d(0,130px,0)');assert.equal(rail.style.backgroundColor,'#b07c22');assert.ok(rail.classList.contains('is-visible'));assert.equal(h.hostReads,2);
});
test('rapid switching batches only the last row and never scans offscreen jobs',()=>{
 const h=setup(),a=h.row(150,80),b=h.row(300,90);h.over(a);h.over(b);h.flush();assert.equal(a.reads,0);assert.equal(b.reads,1);assert.equal(h.created.length,1);
});
test('leaving, cancelled pointers and filters hide the rail and cancel queued work',()=>{
 for(const event of ['pointerleave','pointercancel','jobsfilterchange']){
  const h=setup(),a=h.row(150,80);h.over(a);h.flush();(h.events[event]||h.docEvents[event])();assert.ok(!h.created[0].classList.contains('is-visible'));
  h.over(a);(h.events[event]||h.docEvents[event])();h.flush();assert.equal(a.reads,1);
 }
});
test('touch/coarse input creates no marker; hidden or detached rows are never measured',()=>{
 const h=setup(),a=h.row(150,80);h.over(a,'touch');h.flush();assert.equal(h.created.length,0);h.fine.matches=false;h.over(a);h.flush();assert.equal(h.created.length,0);
 h.fine.matches=true;a.isConnected=false;h.over(a);h.flush();assert.equal(a.reads,0);a.isConnected=true;a.classList.add('hidden');h.over(a);h.flush();assert.equal(a.reads,0);
});
test('scroll offsets and resize follow only the active row; a breakpoint change clears it',()=>{
 const h=setup(),a=h.row(150,80);h.host.scrollTop=20;h.over(a);h.flush();assert.equal(h.created[0].style.transform,'translate3d(0,70px,0)');h.windowEvents.resize();h.flush();assert.equal(a.reads,2);h.fine.matches=false;h.fine.changed();assert.ok(!h.created[0].classList.contains('is-visible'));
});
