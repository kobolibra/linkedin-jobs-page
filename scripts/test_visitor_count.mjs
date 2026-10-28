import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../visitor-count.js',import.meta.url),'utf8');
function element(){return {textContent:'—',title:'',attributes:{},style:{},children:[],events:{},setAttribute(k,v){this.attributes[k]=v;},replaceChildren(...children){this.children=children;this.textContent=children.map(c=>c.textContent).join('');},addEventListener(k,fn){this.events[k]=fn;},remove(){this.removed=true;}};}
function page({present=true,readyState='loading'}={}){
  const el=element(),scripts=[],timers=[],events=[],window={};
  vm.runInNewContext(source,{
    document:{readyState,getElementById:()=>present?el:null,createElement:element,head:{appendChild:s=>scripts.push(s)}},
    window,localStorage:{getItem:()=>null,setItem:()=>{}},addEventListener:(...args)=>events.push(args),
    fetch:()=>assert.fail('No snapshot or replacement counter may be requested'),
    setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout:()=>{},
  });
  const respond=(data,index=scripts.length-1)=>window[new URL(scripts[index].src).searchParams.get('jsonpCallback')](data);
  return {el,scripts,timers,events,window,respond,retry:()=>el.children[0].events.click()};
}
test('requests the original live cumulative metric immediately with its original referrer',()=>{
  for(const readyState of ['loading','interactive','complete']){
    const p=page({readyState});assert.equal(p.scripts.length,1);assert.equal(p.events.length,0);
    const url=new URL(p.scripts[0].src);assert.equal(url.origin+url.pathname,'https://busuanzi.ibruce.info/busuanzi');
    assert.match(url.searchParams.get('jsonpCallback'),/^BusuanziCallback_Live_/);
    assert.equal(p.scripts[0].referrerPolicy,'origin');assert.equal(p.scripts[0].async,true);
  }
});
test('slow requests are never classified as unavailable or retried by a timer',()=>{
  const p=page();assert.equal(p.timers.length,1);assert.equal(p.timers[0].ms,10000);assert.equal(p.el.textContent,'…');assert.equal(p.el.attributes['aria-busy'],'true');
  assert.equal(p.el.children.length,0);assert.equal(p.scripts.length,1);
  p.respond({site_pv:4907});assert.equal(p.el.textContent,'4,907');assert.equal(p.el.attributes['aria-busy'],'false');
});
test('displays the original total without an offset, cached substitute or start-time label',()=>{
  const p=page();p.respond({site_pv:4884});p.scripts[0].onload();
  assert.equal(p.el.textContent,'4,884');assert.equal(p.el.title,'');assert.equal(p.el.attributes['aria-label'],'访问数 4,884');
});
test('zero and integer strings are valid live counts',()=>{
  for(const [site_pv,value] of [[0,'0'],['0','0'],['4884','4,884']]){
    const p=page();p.respond({site_pv});assert.equal(p.el.textContent,value);
  }
});
test('invalid values fall back without displaying a fabricated count',()=>{
  for(const site_pv of [undefined,null,true,'',' ','-1','1.5','NaN',-1,1.5,Infinity,Number.MAX_SAFE_INTEGER+1]){
    const p=page();p.respond({site_pv});assert.equal(p.el.textContent,'—');
    assert.match(p.el.title,/统计服务暂不可用/);assert.equal(p.el.attributes['aria-busy'],'false');
    assert.equal(p.scripts.length,1);
  }
});
test('network failure leaves an honest unavailable state, without duplicate visits',()=>{
  const p=page();p.scripts[0].onerror();assert.equal(p.el.textContent,'—');
  assert.equal(p.scripts.length,1);assert.equal(p.el.attributes['aria-busy'],'false');
  assert.equal(p.scripts[0].removed,true);
});
test('a loaded script with no JSONP callback enters unavailable state',()=>{
  const p=page();p.scripts[0].onload();assert.equal(p.el.textContent,'—');
  assert.match(p.el.title,/统计服务暂不可用/);
});
test('a pending timeout displays a fallback without making another counted request',()=>{
  const p=page();assert.equal(p.timers.length,1);
  p.timers[0].fn();assert.equal(p.scripts.length,1);
  assert.equal(p.el.textContent,'—');assert.match(p.el.title,/统计服务暂不可用/);
  // The late JSONP callback remains available after timeout and can still succeed.
  p.respond({site_pv:4908});assert.equal(p.el.textContent,'4,908');
});
test('errors or callbacks after success cannot erase or replace a confirmed count',()=>{
  const p=page(),cb=p.window[new URL(p.scripts[0].src).searchParams.get('jsonpCallback')];
  cb({site_pv:4884});p.scripts[0].onerror();cb({site_pv:2});p.scripts[0].onload();assert.equal(p.el.textContent,'4,884');
});
test('pages without a counter make no network requests',()=>{
  const p=page({present:false});assert.equal(p.scripts.length,0);assert.equal(p.timers.length,0);
});
