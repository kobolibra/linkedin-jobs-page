import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const code=fs.readFileSync(new URL('../company-logos.js',import.meta.url),'utf8');
async function setup(manifest,ok=true,count=1){
  const images=[],idle=[],observations=[],batches=[];let intersect;
  const box={dataset:{},isConnected:true,letter:'D',classList:{add(){}},replaceChildren(img){this.letter=null;this.image=img;}};
  const card={nodeType:1,dataset:{comp:'DBS Bank'},querySelector:()=>box,matches:()=>true};
  const cards=[card,...Array.from({length:count-1},()=>({...card}))];
  const root={nodeType:1,querySelector:()=>card,matches:()=>false,querySelectorAll:()=>cards};
  const context={document:{getElementById:()=>root},window:{requestIdleCallback:fn=>idle.push(fn)},
    Image:class{constructor(w,h){this.width=w;this.height=h;images.push(this);}},
    IntersectionObserver:class{constructor(fn){intersect=fn;}observe(card){observations.push(card);}},
    MutationObserver:class{observe(){}disconnect(){}},AbortController,
    setTimeout(fn,ms){if(ms===0)fn();return 1;},clearTimeout(){},fetch:async()=>({ok,json:async()=>manifest})};
  vm.runInNewContext(code,context);
  assert.equal(images.length,0,'job registration does not download images');
  assert.equal(observations.length,0,'observer registration yields to input first');
  for(let i=0;i<idle.length;i++){const before=observations.length;await idle[i]();batches.push(observations.length-before);}assert.equal(images.length,0,'offscreen cards do not download images');
  intersect([{target:card,isIntersecting:true}]);
  return {images,box,intersect,card,batches,observations};
}
test('visible logos replace the letter only after a successful load without changing dimensions',async()=>{
  const s=await setup({'dbs bank':'assets/company-logos/'+'a'.repeat(24)+'.webp'});
  assert.equal(s.images.length,1);const img=s.images[0];assert.equal(img.fetchPriority,'low');assert.equal(img.decoding,'async');assert.equal(img.loading,'eager');assert.equal(img.width,24);assert.equal(s.box.letter,'D');img.onload();assert.equal(s.box.image,img);
  s.intersect([{target:s.card,isIntersecting:true}]);assert.equal(s.images.length,1);
});
test('an image failure preserves the letter',async()=>{const s=await setup({'dbs bank':'assets/company-logos/'+'a'.repeat(24)+'.webp'});s.images[0].onerror();assert.equal(s.box.letter,'D');});
test('external images and failed manifests produce no image requests',async()=>{
  assert.equal((await setup({'dbs bank':'https://attacker.test/logo.png'})).images.length,0);
  assert.equal((await setup({},false)).images.length,0);
});
test('ten thousand jobs register in idle slices, never one blocking batch',async()=>{const s=await setup({},true,10000);assert.equal(s.observations.length,10000);assert.ok(Math.max(...s.batches)<=150);assert.equal(s.images.length,0);});
