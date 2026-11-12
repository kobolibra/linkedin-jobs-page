import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {FIRMS,DISPLAY,COMPACT,MICRO,REGIONS,firmIndex,aggregate,daily,limit,treemap,toneOf}=require('../market-width.js');
const root=new URL('../',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');

test('tracked institutions match the 18-company collector registry and About list',()=>{
 const collector=read('scripts/jobspy/fetch_linkedin_requests.py'),about=read('about.html');
 const names=[...collector.matchAll(/^    "([^"]+)": \{"canonical":/gm)].map(m=>m[1]);
 assert.deepEqual(FIRMS,names);
 assert.equal(new Set(FIRMS).size,18);
 const aboutBrands=[...((about.match(/<div class="about-company-list">([\s\S]*?)<\/div>/)||[])[1]||'').matchAll(/<span>([^<]+)<\/span>/g)].map(x=>x[1]);
 assert.deepEqual(DISPLAY,aboutBrands,'chart labels must match the canonical About-page brands exactly');
 assert.equal(DISPLAY[1],'Standard Chartered');
 assert.equal(DISPLAY[12],'Morgan Stanley');
 assert.ok(DISPLAY.every(name=>!name.endsWith(' St.')&&!name.endsWith(' C.')));

 assert.equal((about.match(/<div class="about-company-list">([\s\S]*?)<\/div>/)||[])[1].match(/<span>/g).length,18);
 assert.deepEqual(REGIONS,['all','CN','HK','SG']);
});

test('recognized aliases count exactly once per firm and never accept unrelated companies',()=>{
 assert.equal(firmIndex('Société Générale'),5);
 assert.equal(firmIndex('Schroder Investment Management'),16);
 assert.equal(firmIndex('Invesco Ltd.'),17);
 assert.equal(firmIndex('JPMorgan'),3);
 assert.equal(firmIndex('Bank of America Merrill Lynch'),10);
 assert.equal(firmIndex('Citi Ventures'),-1);
 assert.equal(firmIndex('Fidelity Investments'),-1);
 assert.equal(firmIndex('Unknown Firm'),-1);
});

test('daily first-seen roles exclude legacy inventory, expired roles, non-roster firms and repost push times',()=>{
 const days=['2026-11-09','2026-11-10','2026-11-11'];
 const job=(company,location,firstSeen,pushTime='2026-11-11T09:00:00Z',jobStatus='active')=>({company,location,firstSeen,pushTime,jobStatus});
 const rows=[
  job('HSBC','CN','2026-11-10T07:00:00Z'),
  job('HSBC','HK','2026-11-10T12:00:00Z'),
  job('Invesco','SG','2026-11-10T09:00:00Z'),
  job('Schroders','CN','2026-11-09T08:00:00Z'),
  job('HSBC','CN','2026-10-01T09:00:00Z'),
  job('HSBC','CN','2026-11-11T08:00:00Z',undefined,'expired'),
  job('Other','HK','2026-11-10T09:00:00Z')
 ];
 const series=aggregate(rows,days);
 assert.equal(series.counts.all[1][0],2);
 assert.equal(series.counts.CN[1][0],1);
 assert.equal(series.counts.HK[1][0],1);
 assert.equal(series.counts.SG[1][17],1);
 assert.equal(series.counts.all[0][16],1);
 assert.equal(series.counts.all[2].reduce((a,b)=>a+b,0),0);
 const sum=region=>series.counts[region].flat().reduce((a,b)=>a+b,0);
 assert.equal(sum('all'),sum('CN')+sum('HK')+sum('SG'));
 assert.equal(sum('all'),4);
});

test('7-day average and firm breadth describe daily additions, never all active inventory',()=>{
 const series=aggregate([
  {company:'HSBC',location:'CN',firstSeen:'2026-11-09',jobStatus:'active'},
  {company:'HSBC',location:'CN',firstSeen:'2026-11-10',jobStatus:'active'},
  {company:'Citi',location:'HK',firstSeen:'2026-11-10',jobStatus:'active'}
 ],['2026-11-09','2026-11-10']);
 const x=daily(series,'all',1),hk=daily(series,'HK',1);
 assert.equal(x.total,2);
 assert.equal(x.firms,2);
 assert.equal(x.average[0],1);
 assert.equal(x.average[2],.5);
 assert.equal(hk.total,1);
 assert.equal(hk.firms,1);
 assert.equal(limit(0),1);
 assert.equal(limit(3),5);
 assert.equal(limit(12),20);
 assert.equal(limit(89),100);
});

test('treemap area ratios equal actual positive daily posting counts, not a minimum floor',()=>{
 const values=[{i:0,count:1},{i:1,count:2},{i:2,count:5},{i:3,count:10},{i:4,count:0}];
 const result=treemap(values,600,330);
 assert.equal(result.length,4);
 assert.ok(!result.some(item=>item.i===4),'zero-role firms must never receive fake tile area');
 const canvas=600*330;
 const total=values.reduce((sum,v)=>sum+v.count,0);
 for(const tile of result){
  assert.ok(tile.x>=-1e-7&&tile.y>=-1e-7);
  assert.ok(tile.x+tile.w<=600+1e-6&&tile.y+tile.h<=330+1e-6);
  assert.ok(tile.w>0&&tile.h>0);
  assert.ok(Math.abs(tile.w*tile.h/canvas-tile.count/total)<1e-8,
   'strict area encoding for '+tile.i+': '+JSON.stringify(tile));
 }
 for(let i=0;i<result.length;i++)for(let j=i+1;j<result.length;j++){
  const a=result[i],b=result[j];
  const dx=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x));
  const dy=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
  assert.ok(dx*dy<1e-5,'tiles must not overlap');
 }
 const sumArea=result.reduce((sum,t)=>sum+t.w*t.h,0);
 assert.ok(Math.abs(sumArea-canvas)<1e-5,'the positive tiles cover the full map');
});

test('one positive, all zero and all 18 positive are handled deterministically',()=>{
 assert.deepEqual(treemap(Array(18).fill(0).map((count,i)=>({count,i})),500,300),[]);
 const single=treemap([{i:12,count:1},...Array.from({length:17},(_,i)=>({i:30+i,count:0}))],500,300);
 assert.deepEqual(single,[{i:12,count:1,x:0,y:0,w:500,h:300}]);
 const equal=Array.from({length:18},(_,i)=>({i,count:1}));
 const dense=treemap(equal,640,340);
 assert.equal(dense.length,18);
 assert.deepEqual(dense,treemap(equal,640,340),'same data returns same layout');
 assert.ok(dense.every(r=>r.w>0&&r.h>0));
 assert.equal(treemap([{i:11,count:3},{i:2,count:3}],640,340)[0].i,2,'stable equal-count tie');
 assert.deepEqual([0,1,2,3,4,7,8,15,16].map(toneOf),[1,1,2,2,3,3,4,4,5]);
});

test('homepage replaces 30-day duplicate matrix with a daily market-structure map',()=>{
 const html=read('index.html'),css=read('market-width.css'),js=read('market-width.js');
 const pos=s=>html.indexOf(s);
 assert.ok(pos('class="analytics-left"')<pos('id="dist"')&&pos('id="dist"')<pos('id="spark"'));
 assert.ok(pos('id="spark"')<pos('id="marketWidth"')&&pos('id="marketWidth"')<pos('id="top50"'));
 assert.ok(pos('id="top50"')<pos('id="cnCityMap"'));
 assert.match(css,/\.analytics-card > \.analytics-left[\s\S]*?grid-column:1/);
 assert.match(css,/\.analytics-card > \.ac-col-market[\s\S]*?grid-column:2/);
 assert.match(css,/@media\s*\(max-width:720px\)/);
 assert.equal((html.match(/data-market-region=/g)||[]).length,4);
 assert.ok(html.includes('Market Width: 18 institutions we watch closely'));
 assert.ok(html.includes('new postings across'));
 assert.ok(html.includes('Area = new postings'));
 assert.ok(html.includes('id="marketWidthMap"'));
 assert.doesNotMatch(html,/marketWidthZeroNames|marketWidthZeroPanel|No new postings<\/span>/);
 assert.ok(html.includes('id="marketWidthDetail"'));
 assert.doesNotMatch(html,/mw-matrix|mw-cell|mw-legend-chip|mw-axis-tick|18 institutions · 30 days|Explore exact|New roles · selected day|radar chart/);
 assert.doesNotMatch(js,/mw-matrix|mw-cell|mw-level-[0-9]|pointerover.+replaceChildren/);
 for(const src of ['market-width.js?v=market-width-8','market-width.css?v=market-width-8'])assert.ok(html.includes(src));
 assert.match(read('app.js'),/window\.MarketWidth\?\.render\(chartData,days\)/);
 assert.match(read('account.js'),/'top30-layout\.js','market-width\.js'/);
 assert.match(read('scripts/browser_assets.mjs'),/'\/market-width\.js'/);
 assert.ok(read('scripts/public_assets.mjs').includes("'market-width.js', 'market-width.css'"));
 assert.match(read('about.html'),/Market Width maps the day's newly observed/);
 assert.doesNotMatch(read('about.html'),/remain visible outside the map/);
});

test('map is hover-safe, includes only positive companies, and prints names and counts in every tile',()=>{
 const html=read('index.html'),css=read('market-width.css'),js=read('market-width.js');
 assert.doesNotMatch(html,/First observed on LinkedIn|Zero means no qualifying roles recorded|id="marketWidthStatus"|id="marketWidthDetails"/);
 assert.match(js,/function treemap\(/);
 assert.doesNotMatch(js,/zeroPanel|zeroItems|mw-zero-name/);
 assert.match(js,/const active=values\.map/);
 assert.match(js,/const active=values\.map/);
 assert.match(js,/name\.textContent=tiny\?MICRO\[tile\.i\]:compact\?COMPACT\[tile\.i\]:DISPLAY\[tile\.i\]/);
 assert.match(js,/DISPLAY\[tile\.i\]/);
 assert.match(js,/document\.createElement\('button'\)/);
 assert.match(js,/face\.append\(name,amount\)/);
 assert.match(js,/board\.addEventListener\('pointerover'/);
 assert.match(js,/board\.addEventListener\('keydown'/);
 assert.match(js,/selectedFirm===chosen/);
 assert.match(css,/\.mw-detail\s*\{[\s\S]*?position:absolute/);
 assert.match(css,/\.mw-detail\[hidden\]/);
 assert.doesNotMatch(css,/\.mw-zero-panel|\.mw-zero-name|\.mw-map-layout\.is-sparse/);
 assert.match(css,/background:var\(--glass-light\)/);
 assert.match(css,/--mw-tone-5:#5b5264/);
 assert.match(css,/\.mw-tile\[aria-pressed="true"\]/);
 assert.match(css,/\.mw-tile-tiny/);
 assert.equal(COMPACT.length,18);
 assert.equal(MICRO.length,18);
 assert.equal(COMPACT[12],'Morgan Stanley');
 assert.equal(MICRO[12],'MS');
 assert.equal(MICRO[1],'SC');
 assert.equal(COMPACT[10],'BofA');
 assert.equal(MICRO[11],'FIL');
 assert.ok(!COMPACT.some(v=>v.endsWith(' St.')||v.endsWith(' C.')));
 assert.ok(COMPACT.every(Boolean)&&MICRO.every(Boolean));
});
