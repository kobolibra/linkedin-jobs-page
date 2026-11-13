import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {anonymousBrowserAsset} from './browser_assets.mjs';
const source=readFileSync(new URL('../job-store.js',import.meta.url),'utf8');
function harness({cached=null,version='a'.repeat(64),guest=false,denied=false}={}){
 const events=[],context={window:{},document:{documentElement:{dataset:{authState:guest?'guest':'authenticated'}}},AbortController,TextDecoder,setTimeout,clearTimeout,
  fetch:async path=>{events.push(path);return {ok:true,json:async()=>({dataVersion:version})};},
  indexedDB:{open(){events.push('storage');if(denied)throw Error('storage unavailable');const request={};setTimeout(()=>{const db={close(){},transaction(){return {objectStore(){return {get(){const r={};queueMicrotask(()=>{r.result=cached;r.onsuccess();});return r;},put(){}};}};}};request.result=db;request.onsuccess();},10);return request;}}};
 vm.runInNewContext(source,context);return {load:context.window.JobIndexStore.load,events};
}
test('repeat visits validate version alongside disk access and reuse only a matching complete snapshot',async()=>{
 const cached={jobs:[{title:'Cached role'}],dataVersion:'a'.repeat(64)},h=harness({cached});let calls=0;
 const loading=h.load(async()=>{calls++;throw Error('should not redownload');});
 assert.deepEqual(h.events,['jobs-version.json','storage']);
 assert.equal(await loading,cached);assert.equal(calls,0);
});
test('a changed deployment downloads fresh data once instead of showing stale roles',async()=>{
 const h=harness({cached:{jobs:[{title:'Old'}],dataVersion:'b'.repeat(64)}});let calls=0;
 const fresh={jobs:[{title:'New'}],dataVersion:'a'.repeat(64)};
 assert.equal(await h.load(async()=>{calls++;return fresh;}),fresh);assert.equal(calls,1);
});
test('offline version failure recovers only a clearly labeled existing local snapshot',async()=>{
 const cached={jobs:[{title:'Previously loaded'}],dataVersion:'a'.repeat(64)};
 const h=harness({cached,version:'invalid'});
 assert.equal(await h.load(async()=>{throw Error('offline');}),cached);
 assert.equal(h.cacheState,'stale');
});
test('explicit access denial cannot fall back to an authenticated snapshot',async()=>{
 const h=harness({cached:{jobs:[{title:'Private role'}],dataVersion:'b'.repeat(64)}});
 await assert.rejects(h.load(async()=>{throw Object.assign(Error('forbidden'),{status:403});}),/forbidden/);
 assert.equal(h.cacheState,'fresh');
});
test('guest preview never opens authenticated storage or requests its version',async()=>{
 const h=harness({guest:true,cached:{jobs:[{title:'Private role'}],dataVersion:'a'.repeat(64)}}),preview={jobs:[{title:'Preview'}]};
 assert.equal(await h.load(async()=>preview),preview);assert.deepEqual(h.events,[]);
});
test('blocked browser storage still loads the fresh index',async()=>{
 const h=harness({denied:true}),fresh={jobs:[],dataVersion:'a'.repeat(64)};
 assert.equal(await h.load(async()=>fresh),fresh);
});
test('early script downloads match the executed versions and expose only existing public code',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const sources=JSON.parse(html.match(/id="appScripts">([^<]+)/)[1]);
 const preloads=[...html.matchAll(/rel="preload" as="script" href="([^"]+)"/g)].map(x=>x[1]);
 for(const src of sources){assert.equal(preloads.filter(x=>x===src).length,1,src);assert.equal(anonymousBrowserAsset('/'+src.split('?')[0]),true);}
 assert.ok(!preloads.some(x=>x.includes('account-sync')||x.includes('jobs-index')));
 assert.equal((html.match(/src="account.js\?/g)||[]).length,1);
 assert.match(html,/<script src="account.js\?[^\"]+" defer><\/script>/);
});
