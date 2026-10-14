import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').split('// A single delegated gesture handler keeps large lists inexpensive.')[1];
function setup(){
  const events={}, fields={},favs=new Set(),blocked=new Set();let modal=null,selection='',mobile=true;
  const node=()=>({textContent:'',setAttribute(k,v){this[k]=v;}});
  const card={style:{setProperty(k,v){this[k]=v;},removeProperty(k){delete this[k];}},classList:{values:new Set(),add(v){this.values.add(v);},remove(v){this.values.delete(v);}},dataset:{id:'job1',comp:'Bank'},querySelector(s){if(s==='.job-title')return {textContent:'Analyst'};return {click(){const set=s==='.star'?favs:blocked,key=s==='.star'?'job1':'Bank';set.has(key)?set.delete(key):set.add(key);}};}};
  const target={closest(s){return s==='.job'?card:null;}};
  const context={requestAnimationFrame:fn=>{fn();return 1;},cancelAnimationFrame(){},jobsEl:{addEventListener(k,fn){events[k]=fn;}},favs,blocked,performance:{now:()=>100},document:{activeElement:null,body:{appendChild(){}},createElement(){modal={open:false,events:{},setAttribute(){},querySelector(s){return fields[s]??=node();},addEventListener(k,fn){this.events[k]=fn;},showModal(){this.open=true;},close(){this.open=false;this.events.close?.();}};return modal;}},window:{setTimeout:fn=>fn(),matchMedia:()=>({matches:mobile}),getSelection:()=>({toString:()=>selection}),addEventListener(){}}};
  vm.runInNewContext(source,context);
  const send=(kind,overrides={})=>events[kind]({target,pointerId:1,pointerType:'touch',isPrimary:true,clientX:200,clientY:50,timeStamp:100,...overrides});
  return {send,card,get modal(){return modal;},fields,setMobile:v=>mobile=v,setSelection:v=>selection=v};
}
test('left swipe opens actions; state labels support favorite and company block undo',()=>{
 const h=setup();h.send('pointerdown');h.send('pointerup',{clientX:100,timeStamp:300});assert.equal(h.modal.open,true);
 const click=action=>h.modal.events.click({target:{closest:s=>s==='[data-action]'?{dataset:{action}}:null}});
 click('favorite');assert.equal(h.fields['[data-action="favorite"]'].textContent,'取消收藏');click('favorite');assert.equal(h.fields['[data-action="favorite"]'].textContent,'收藏');
 click('block');assert.equal(h.fields['[data-action="block"]'].textContent,'取消屏蔽机构');click('block');assert.equal(h.fields['[data-action="block"]'].textContent,'屏蔽机构');
});
test('vertical scroll, right swipe, mouse, cancelled touches and selected text do not open actions',()=>{
 for(const mode of ['vertical','right','mouse','cancel','selection','slow','desktop','short']){
  const h=setup();if(mode==='selection')h.setSelection('selected');if(mode==='desktop')h.setMobile(false);
  h.send('pointerdown',{pointerType:mode==='mouse'?'mouse':'touch'});if(mode==='cancel')h.send('pointercancel');
  h.send('pointerup',{clientX:mode==='right'?300:mode==='short'?170:100,clientY:mode==='vertical'?250:50,timeStamp:mode==='slow'?2000:300});assert.equal(h.modal,null,mode);
 }
});

test('drag feedback follows only the active row and cancellation clears displacement',()=>{
 const h=setup();h.send('pointerdown');h.send('pointermove',{clientX:120});
 assert.equal(h.card.style['--job-swipe-size'],'80px');assert.equal(h.card.classList.values.has('is-swiping'),true);
 h.send('pointercancel');assert.equal(h.card.style['--job-swipe-size'],undefined);assert.equal(h.card.classList.values.has('is-swiping'),false);assert.equal(h.modal,null);
});
