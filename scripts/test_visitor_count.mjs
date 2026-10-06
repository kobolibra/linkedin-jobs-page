import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import worker from '../worker.js';

const source=readFileSync(new URL('../visitor-count.js',import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const visitId='12345678-1234-4123-8123-123456789abc';
const payload={site_pv:1234,startedAt:'2026-10-07T00:00:00Z',source:'first-party-live'};
const response=data=>({ok:true,json:async()=>data});
function page(fetch=async()=>response(payload),present=true,hostname='linkedin.claudecowork.workers.dev'){
  const el={textContent:'—',title:'',attributes:{},setAttribute(k,v){this.attributes[k]=v;}};
  const requests=[],timers=new Map();let timerId=0,ids=0;
  vm.runInNewContext(source,{
    document:{getElementById:()=>present?el:null},
    location:{hostname},
    crypto:{randomUUID:()=>{ids++;return visitId;}},AbortController,
    fetch:(...args)=>{requests.push(args);return fetch(...args);},
    setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},
    clearTimeout:id=>timers.delete(id),
  });
  return {el,requests,timers,get ids(){return ids;},tick:ms=>{for(const [id,t] of [...timers])if(t.ms===ms&&timers.delete(id))t.fn();}};
}
async function exhaust(p){await flush();p.tick(500);await flush();p.tick(1500);await flush();}

test('displays the actual live count and discloses the new counting period',async()=>{
  const p=page();await flush();
  assert.equal(p.el.textContent,'1,234');assert.match(p.el.title,/本站实时统计.*不含旧服务历史数据/);
  assert.equal(p.requests.length,1);assert.equal(p.requests[0][0],'/api/visits');
  assert.equal(p.requests[0][1].method,'POST');assert.equal(p.requests[0][1].cache,'no-store');
  assert.equal(p.timers.size,0);
});
test('a failed or lost response retries with the same page-view ID',async()=>{
  let attempt=0;
  const p=page(async()=>{if(++attempt<3)throw Error('lost response');return response(payload);});
  await exhaust(p);assert.equal(p.el.textContent,'1,234');assert.equal(p.requests.length,3);
  assert.equal(p.ids,1);assert.equal(new Set(p.requests.map(([,r])=>JSON.parse(r.body).visitId)).size,1);
});
test('HTTP and malformed JSON failures recover through the live endpoint only',async()=>{
  for(const failure of [{ok:false}, {ok:true,json:async()=>{throw Error('bad JSON');}}]){
    let attempt=0;const p=page(async()=>++attempt===1?failure:response(payload));
    await exhaust(p);assert.equal(p.el.textContent,'1,234');assert.equal(p.requests.length,2);
    assert.ok(p.requests.every(([url])=>url==='/api/visits'));
  }
});
test('invalid and historical values never masquerade as a live count',async()=>{
  for(const bad of [null,{}, {...payload,source:'busuanzi-server-side'}, {...payload,startedAt:null}, ...[null,undefined,true,'1234',-1,1.5,Number.MAX_SAFE_INTEGER+1].map(site_pv=>({...payload,site_pv}))]){
    const p=page(async()=>response(bad));await exhaust(p);
    assert.equal(p.el.textContent,'暂不可用');assert.equal(p.requests.length,3);
  }
});
test('real zero is valid and never replaced by an invented historical number',async()=>{
  const p=page(async()=>response({...payload,site_pv:0}));await flush();assert.equal(p.el.textContent,'0');
});
test('three timed-out attempts stop loading with an explicit live error',async()=>{
  const p=page((_,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout')),{once:true})));
  for(const ms of [4000,500,4000,1500,4000]){p.tick(ms);await flush();}
  assert.equal(p.el.textContent,'暂不可用');assert.equal(p.requests.length,3);
  assert.equal(p.timers.size,0);assert.match(p.el.attributes['aria-label'],/实时访问统计暂不可用/);
});
test('pages without a counter make no requests',async()=>{
  const p=page(undefined,false);await flush();assert.equal(p.requests.length,0);assert.equal(p.ids,0);
});

const url='https://linkedin.example/api/visits';
const request=(method='POST',body=JSON.stringify({visitId}),headers={origin:'https://linkedin.example','content-type':'application/json'})=>new Request(url,{method,headers,...(method==='GET'?{}:{body})});
function binding(){const calls=[];return {calls,VISITS:{idFromName:name=>name,get:id=>({fetch:async req=>{calls.push({id,method:req.method,body:req.method==='POST'?await req.json():null});return new Response(JSON.stringify(payload),{headers:{'cache-control':'no-store'}});}})}};}
test('the Worker routes live requests to the stable persistent counter, uncached',async()=>{
  const env=binding();const res=await worker.fetch(request(),env);assert.equal(res.status,200);
  assert.deepEqual(await res.json(),payload);assert.equal(res.headers.get('cache-control'),'no-store');
  assert.deepEqual(env.calls,[{id:'site-pv-v1',method:'POST',body:{visitId}}]);
});
test('read-only verification forwards GET without registering a visit',async()=>{
  const env=binding();const res=await worker.fetch(request('GET'),env);assert.equal(res.status,200);
  assert.equal(env.calls[0].method,'GET');assert.equal(env.calls[0].body,null);
});
test('cross-origin, invalid and oversized requests never touch storage',async()=>{
  const env=binding();const cases=[
    [request('POST',JSON.stringify({visitId}),{'content-type':'application/json'}),403],
    [request('POST',JSON.stringify({visitId}),{origin:'https://evil.example','content-type':'application/json'}),403],
    [request('POST',JSON.stringify({visitId}),{origin:'https://linkedin.example','content-type':'text/plain'}),415],
    [request('POST','broken'),400], [request('POST','{}'),400],
    [request('POST',JSON.stringify({visitId:'not-a-uuid'})),400], [request('POST',' '.repeat(257)),413],
    [request('PUT',''),405],
  ];
  for(const [req,status] of cases)assert.equal((await worker.fetch(req,env)).status,status);
  assert.equal(env.calls.length,0);
});
test('missing configuration and storage failure return errors, never fake numbers',async()=>{
  let res=await worker.fetch(request(),{});assert.equal(res.status,503);assert.deepEqual(await res.json(),{error:'counter_not_configured'});
  const env={VISITS:{idFromName:()=>{throw Error('storage unavailable');}}};
  res=await worker.fetch(request(),env);assert.equal(res.status,503);assert.deepEqual(await res.json(),{error:'counter_unavailable'});
});

test('GitHub Pages uses the same live Cloudflare counter',async()=>{
  const p=page(undefined,true,'kobolibra.github.io');await flush();
  assert.equal(p.requests[0][0],'https://linkedin.claudecowork.workers.dev/api/visits');
  const env=binding();const req=request('POST',JSON.stringify({visitId}),{origin:'https://kobolibra.github.io','content-type':'application/json'});
  const res=await worker.fetch(req,env);assert.equal(res.status,200);assert.equal(res.headers.get('access-control-allow-origin'),'https://kobolibra.github.io');
});
test('only the two site origins are allowed through CORS preflight',async()=>{
  for(const origin of ['https://linkedin.example','https://kobolibra.github.io','https://evil.example']){
    const env=binding();const res=await worker.fetch(new Request(url,{method:'OPTIONS',headers:{origin}}),env);
    assert.equal(res.status,origin==='https://evil.example'?403:204);
    assert.equal(env.calls.length,0);
  }
});
