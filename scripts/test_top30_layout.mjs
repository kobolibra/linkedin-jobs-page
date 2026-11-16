import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {computeLayout,buildSvg,DOMINANT_SHARE}=require('../top30-layout.js');

const entry=(name,CN,HK,SG,age)=>[name,{total:CN+HK+SG,CN,HK,SG,ages:Array.from({length:CN+HK+SG},(_,i)=>age+i%5)}];

test('Top 30 colour encodes the market holding at least 60% of an institution’s active roles',()=>{
 assert.equal(DOMINANT_SHARE,.6);
 const layout=computeLayout([
  entry('Mainland Bank',60,30,10,10),
  entry('Harbour Bank',10,70,20,20),
  entry('Lion Bank',5,5,40,30),
  entry('Balanced Bank',40,35,25,40),
  entry('Edge Bank',60,40,0,50)
 ]);
 assert.deepEqual(layout.points.map(p=>p.region),['CN','HK','SG','MIX','CN']);
 const svg=buildSvg(layout);
 for(const r of ['cn','hk','sg','mix'])assert.match(svg,new RegExp('bubble-row bubble-drill region-'+r));
 assert.doesNotMatch(svg,/fill="#/,'bubble paint comes from the shared region tokens, not inline palette colours');
 assert.match(svg,/data-cn="60" data-hk="30" data-sg="10"/,'the tooltip reads exact per-market counts');
});

test('bubble positions and sizes are unchanged by colour: exact mean/median projection and monotonic radius',()=>{
 const layout=computeLayout([entry('A',30,0,0,10),entry('B',0,20,0,30),entry('C',0,0,10,50)]);
 for(const p of layout.points){
  assert.equal(p.px,p.rawX);assert.equal(p.py,p.rawY);
 }
 const radii=layout.points.map(p=>p.r);
 assert.ok(radii[0]>radii[1]&&radii[1]>radii[2],'larger institutions always draw larger bubbles');
});
