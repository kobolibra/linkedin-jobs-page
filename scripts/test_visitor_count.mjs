import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../visitor-count.js',import.meta.url),'utf8');
function page({present=true,readyState='loading'}={}){
  const el={textContent:'—',title:'',attributes:{},setAttribute(k,v){this.attributes[k]=v;}};
  const scripts=[],timers=new Map(),events=[];let next=0;
  const window={};
  vm.runInNewContext(source,{
    document:{readyState,getElementById:()=>present?el:null,createElement:()=>({}),head:{appendChild:s=>scripts.push(s)}},
    window,addEventListener:(...args)=>events.push(args),
    fetch:()=>assert.fail('No snapshots or first-party replacement counter may be requested'),
    setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
  });
  return {el,scripts,timers,events,window,timeout:()=>{for(const [id,t] of [...timers])if(t.ms===8000&&timers.delete(id))t.fn();}};
}
test('requests the original live cumulative metric immediately, before window load',()=>{
  for(const readyState of ['loading','interactive','complete']){
    const p=page({readyState});assert.equal(p.scripts.length,1);assert.equal(p.events.length,0);
    assert.equal(p.scripts[0].src,'https://busuanzi.ibruce.info/busuanzi?jsonpCallback=BusuanziCallback_Live');
    assert.equal(p.scripts[0].referrerPolicy,'origin');assert.equal(p.scripts[0].async,true);
  }
});
test('displays the returned original total without an offset or start-time label',()=>{
  const p=page();p.window.BusuanziCallback_Live({site_pv:4884});p.scripts[0].onload();
  assert.equal(p.el.textContent,'4,884');assert.equal(p.el.title,'');assert.equal(p.timers.size,0);
  assert.equal(p.el.attributes['aria-label'],'访问数 4,884');
});
test('zero and integer strings are valid live counts',()=>{
  for(const [site_pv,value] of [[0,'0'],['0','0'],['4884','4,884']]){
    const p=page();p.window.BusuanziCallback_Live({site_pv});assert.equal(p.el.textContent,value);
  }
});
test('invalid values never become fake zero or a historical fallback',()=>{
  for(const site_pv of [undefined,null,true,'',' ','-1','1.5','NaN',-1,1.5,Infinity,Number.MAX_SAFE_INTEGER+1]){
    const p=page();p.window.BusuanziCallback_Live({site_pv});assert.equal(p.el.textContent,'暂不可用');
  }
});
test('network failure reports unavailable and makes no duplicate counting requests',()=>{
  const p=page();p.scripts[0].onerror();assert.equal(p.el.textContent,'暂不可用');
  assert.equal(p.scripts.length,1);assert.equal(p.timers.size,0);
});
test('a script response without a usable callback does not stay loading forever',()=>{
  const p=page();p.scripts[0].onload();assert.equal(p.el.textContent,'暂不可用');
});
test('timeout has no fallback and a late valid live response still recovers',()=>{
  const p=page();p.timeout();assert.equal(p.el.textContent,'暂不可用');
  p.window.BusuanziCallback_Live({site_pv:4885});assert.equal(p.el.textContent,'4,885');assert.equal(p.el.title,'');
  assert.equal(p.scripts.length,1);
});
test('errors after a valid callback cannot erase a confirmed live value',()=>{
  const p=page();p.window.BusuanziCallback_Live({site_pv:4884});p.scripts[0].onerror();p.timeout();
  assert.equal(p.el.textContent,'4,884');
});
test('pages without a counter make no network requests',()=>{
  const p=page({present:false});assert.equal(p.scripts.length,0);assert.equal(p.timers.size,0);
});
