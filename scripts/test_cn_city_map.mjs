import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {buildIndex,locate,summarize,bucket}=require('../cn-city-map.js');
const atlas=JSON.parse(readFileSync(new URL('../assets/maps/cn-cities.json',import.meta.url),'utf8'));
const index=buildIndex(atlas),job=(city,extra={})=>({city,location:'CN',jobStatus:'active',...extra});
const ids=(city,extra)=>locate(job(city,extra),index).sort();

test('atlas contains city boundaries, four merged municipalities and one undivided neutral Taiwan outline',()=>{
 assert.ok(atlas.cities.length>330);
 assert.equal(new Set(atlas.cities.map(c=>c.id)).size,atlas.cities.length);
 for(const id of ['110000','120000','310000','500000','710000'])assert.ok(index.byId.get(id)?.path.length>30,id);
 assert.equal(atlas.cities.filter(c=>c.id.startsWith('71')).length,1);
 assert.ok(!atlas.cities.some(c=>c.id.startsWith('TW')));
 assert.deepEqual(ids('Taoyuan'),[]);
 for(const city of atlas.cities){assert.ok(!/NaN|Infinity|undefined/.test(city.path+city.inset));assert.equal(city.point.length,2);}
 assert.ok(atlas.seaLines.length>20);
 assert.ok(index.byId.get('110000').point[1]<index.byId.get('310000').point[1]);
 assert.ok(index.byId.get('310000').point[1]<index.byId.get('440100').point[1]);
});
test('Chinese, romanized, apostrophe and city-suffix variants locate exact cities',()=>{
 for(const name of ['Shanghai','上海','上海市','Shanghai City'])assert.deepEqual(ids(name),['310000'],name);
 for(const name of ["Xi'an",'Xi’an','Xian','西安市'])assert.deepEqual(ids(name),['610100'],name);
 assert.deepEqual(ids('Nanshan District'),['440300']);
});
test('multi-city metropolitan labels count each explicitly involved city',()=>{
 assert.deepEqual(ids('Guangzhou–Foshan Metropolitan Area'),['440100','440600']);
 assert.deepEqual(ids('Hangzhou-Shaoxing Metropolitan Area'),['330100','330600']);
 assert.deepEqual(ids('Ningbo-Zhoushan Area'),['330200','330900']);
 assert.deepEqual(ids('Changzhou-Wuxi-Suzhou Metropolitan Area'),['320200','320400','320500']);
 assert.deepEqual(ids('广州、佛山'),['440100','440600']);
 assert.deepEqual(ids('Guangzhou and Foshan'),['440100','440600']);
 assert.deepEqual(ids('Guangzhou-Guangzhou Metropolitan Area'),['440100']);
});
test('ambiguous, missing, provincial, remote and partly unknown locations never get guessed',()=>{
 for(const name of ['','China','Guangdong','广东','Remote','Greater Bay Area','Suzhou','Guangzhou-Unknown Metropolitan Area','Tong Xian','Guangzhou District'])assert.deepEqual(ids(name),[],name);
 assert.deepEqual(ids('Suzhou',{locationRaw:'Suzhou, Jiangsu, China'}),['320500']);
 assert.deepEqual(ids('Suzhou',{locationRaw:'Suzhou, Anhui, China'}),['341300']);
 assert.deepEqual(ids('',{locationRaw:'Shanghai, China'}),['310000']);
});
test('only active CN jobs count; multi-city incidence never inflates distinct job totals',()=>{
 const s=summarize([job('Guangzhou-Foshan Metropolitan Area'),job('Guangzhou'),job('Shanghai'),job('Shanghai',{jobStatus:'expired'}),job('Shanghai',{location:'HK'}),job('Guangdong'),job('Taoyuan',{locationRaw:'Taoyuan, Hebei, China'})],atlas);
 assert.equal(s.total,5);assert.equal(s.mapped,3);assert.equal(s.multi,1);assert.equal(s.mentions,4);assert.equal(s.unmapped,2);
 assert.equal(s.counts.get('440100'),2);assert.equal(s.counts.get('440600'),1);assert.equal(s.counts.get('310000'),1);assert.equal(s.counts.get('710000'),undefined);
});
test('color bins are monotone, make small positive counts visible and handle empty data',()=>{
 assert.equal(bucket(0,0),0);assert.equal(bucket(1,1000),1);assert.equal(bucket(1000,1000),5);
 let last=0;for(let i=0;i<=1000;i++){const next=bucket(i,1000);assert.ok(next>=last);last=next;}
 const s=summarize([],atlas);assert.equal(s.max,0);assert.equal(s.mapped,0);assert.equal(s.mentions,0);
});
test('map is appended after Top 30, starts collapsed, reuses the index and lazy-loads local geometry',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(html.indexOf('id="cnCityMapTitle"')>html.indexOf('id="top50"'));
 assert.match(html,/id="cnCityMapToggle"[^>]+aria-expanded="false"/);assert.match(html,/id="cnCityMap" hidden/);
 const script=readFileSync(new URL('../cn-city-map.js',import.meta.url),'utf8');
 assert.match(script,/window\.__jobsDataPromise/);assert.doesNotMatch(script,/fetch\(['"]jobs-index/);
 assert.match(script,/if\(expanded\)load\(\)/);assert.match(script,/AbortController/);
 const pub=readFileSync(new URL('./public_assets.mjs',import.meta.url),'utf8');
 for(const file of ['cn-city-map.js','cn-city-map.css','assets/maps/cn-cities.json','assets/maps/NOTICE.txt'])assert.ok(pub.includes("'"+file+"'"));
});
