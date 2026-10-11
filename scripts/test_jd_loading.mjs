import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,writeFileSync,mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildJdShards,jdShard} from './build_jd_shards.mjs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function loader(fetch) {
  const context={fetch,AbortController,setTimeout,clearTimeout};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('const jdById=new Map();'),source.indexOf('const JEV_CACHE_KEY'))+'\nthis.load=loadJdDetails;this.entries=jdById;this.shard=jdShard;',context);
  return context;
}
test('partitions preserve every JD, preprocessing and revision exactly; rebuild removes stale files',()=>{
  const root=mkdtempSync(join(tmpdir(),'jd-parts-'));
  try {
    const details=Object.fromEntries(Array.from({length:11185},(_,i)=>['ln:'+i,{descriptionHtml:'<p>'+i+'</p>',jevInput:{schema:'jev-input-v4',jd_text:'analysis '+i},jdDiffHtml:'<ins>'+i+'</ins>'}]));
    const input=join(root,'input.json'),out=join(root,'parts');
    writeFileSync(input,JSON.stringify({schemaVersion:'1.1',source:'jobs.json',details}));
    const stats=buildJdShards(input,out);assert.equal(stats.entries,11185);
    assert.equal(readdirSync(out).length,256);
    const restored={};
    for(const file of readdirSync(out)) Object.assign(restored,JSON.parse(readFileSync(join(out,file))).details);
    assert.deepEqual(restored,details);
    for(const id of Object.keys(details)) assert.deepEqual(JSON.parse(readFileSync(join(out,jdShard(id)+'.json'))).details[id],details[id]);
    assert.ok(stats.maxBytes<Buffer.byteLength(JSON.stringify(details))/100);
    writeFileSync(join(out,'stale.json'),'{}');buildJdShards(input,out);assert.equal(readdirSync(out).length,256);
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('opening JD and clicking JEV concurrently download one partition, never the full corpus',async()=>{
  const calls=[];let release;
  const pending=new Promise(resolve=>release=resolve);
  const c=loader((url,options)=>{calls.push({url,options});return pending;});
  const a=c.load('ln:4478047631'),b=c.load('ln:4478047631');assert.equal(a,b);
  assert.equal(calls.length,1);assert.equal(calls[0].url,'jd-parts/'+jdShard('ln:4478047631')+'.json');
  assert.equal(calls[0].options.cache,'no-cache');assert.ok(calls[0].options.signal);
  release({ok:true,json:async()=>({details:{'ln:4478047631':{descriptionText:'verified'}}})});
  await a;await c.load('ln:4478047631');assert.equal(calls.length,1);assert.equal(c.entries.get('ln:4478047631').descriptionText,'verified');
});
test('failed requests can be retried and distinct partitions load independently',async()=>{
  const calls=[];
  const c=loader(async url=>{calls.push(url);if(calls.length===1)return {ok:false,status:503};return {ok:true,json:async()=>({details:{}})};});
  await assert.rejects(c.load('ln:1'),/503/);await c.load('ln:1');await c.load('ln:2');assert.equal(calls.length,3);assert.notEqual(calls[1],calls[2]);
  for(const id of ['ln:1','ln:4478047631','ln:4468639951'])assert.equal(c.shard(id),jdShard(id));
});
test('both JEV and JD expansion pass the job ID to the partition loader',()=>{
  assert.match(source,/await loadJdDetails\(id\)/);
  assert.match(source,/await loadJdDetails\(card.dataset.id\)/);
  assert.doesNotMatch(source,/fetch\("jobs-details.json"/);
  assert.match(source,/jdFingerprint\(jevRequestText\(entry\).slice\(0,JEV_MAX_DESCRIPTION_CHARS\)\)/);
});
