import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {FIRMS,DISPLAY,COMPACT,MICRO,REGIONS,firmIndex,aggregate,daily,limit,treemap,zeroPerimeter,marketTiles,tileTypography}=require('../market-width.js');
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
 assert.doesNotMatch(read('market-width.js'),/toneOf|mw-tone-/);
});

test('one coherent mosaic contains all 18 firms even when 17 are zero',()=>{
 const values=Array(18).fill(0);values[12]=1;
 const tiles=marketTiles(values,600,340);
 assert.equal(tiles.length,18);
 assert.deepEqual(new Set(tiles.map(t=>t.i)).size,18);
 assert.equal(tiles.filter(t=>t.zero).length,17);
 assert.equal(tiles.find(t=>t.i===12).count,1);
 assert.equal(tiles.find(t=>t.i===12).zero,false);
 assert.ok(tiles.filter(t=>t.zero).every(t=>t.count===0),'placeholder count is zero, never fabricated');
 const area=tiles.reduce((sum,t)=>sum+t.w*t.h,0);
 assert.ok(Math.abs(area-600*340)<1e-5);
 assert.deepEqual(tiles,marketTiles(values,600,340),'stable data returns a stable cloud');
});

test('four positive and fourteen zero cells geometrically cover the whole board',()=>{
 const values=Array(18).fill(0);values[1]=2;values[12]=3;values[11]=4;values[16]=5;
 for(const [w,h] of [[505,319],[350,290],[580,340]]){
  const tiles=marketTiles(values,w,h);
  const sum=tiles.reduce((a,t)=>a+t.w*t.h,0);
  assert.equal(tiles.length,18);
  assert.ok(Math.abs(sum-w*h)<1e-6,'geometry total: '+JSON.stringify({w,h,sum,tiles}));
 }
});
test('active institutions stay strictly inside the neutral perimeter when four or more are inactive',()=>{
 const edge=(t,W,H)=>Math.abs(t.x)<1e-7||Math.abs(t.y)<1e-7||
  Math.abs(t.x+t.w-W)<1e-7||Math.abs(t.y+t.h-H)<1e-7;
 for(const [W,H] of [[350,290],[505,319],[640,340],[960,400]]){
  for(let nZero=4;nZero<=17;nZero++){
   const values=Array.from({length:18},(_,i)=>i<18-nZero?1+(i%7):0);
   const tiles=marketTiles(values,W,H);
   assert.equal(tiles.length,18,'all institutions remain visible');
   const active=tiles.filter(t=>!t.zero),zeros=tiles.filter(t=>t.zero);
   assert.equal(active.length,18-nZero);
   assert.equal(zeros.length,nZero);
   assert.ok(active.every(t=>t.zone==='core'&&!edge(t,W,H)),
    'active tiles must never touch outer boundary: '+JSON.stringify({W,H,nZero,active}));
   assert.ok(zeros.every(t=>t.zone==='perimeter'&&edge(t,W,H)),
    'zero tiles must all lie on the outer boundary: '+JSON.stringify({W,H,nZero,zeros}));
   assert.ok(tiles.every(t=>t.w>0&&t.h>0));
   const sum=tiles.reduce((a,t)=>a+t.w*t.h,0);
   assert.ok(Math.abs(sum-W*H)<1e-5,'no coverage gaps '+JSON.stringify({W,H,nZero,sum}));
   for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++){
    const a=tiles[i],b=tiles[j];
    const dx=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x));
    const dy=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
    assert.ok(dx*dy<1e-5,'tiles never overlap');
   }
  }
 }
});

test('with fewer than four zero institutions, use honest outer bands without duplicating tiles',()=>{
 for(const nZero of [1,2,3]){
  const values=Array.from({length:18},(_,i)=>i>=18-nZero?0:2);
  const tiles=marketTiles(values,500,340);
  assert.equal(tiles.length,18);
  assert.equal(tiles.filter(t=>t.zero).length,nZero);
  assert.ok(tiles.filter(t=>t.zero).every(t=>t.zone==='perimeter'&&(Math.abs(t.x)<1e-7||Math.abs(t.y)<1e-7||Math.abs(t.x+t.w-500)<1e-7||Math.abs(t.y+t.h-340)<1e-7)));
  assert.ok(tiles.filter(t=>!t.zero).every(t=>t.zone==='core'));
 }
 const core=zeroPerimeter(Array.from({length:14},(_,i)=>({i})),500,340);
 assert.equal(core.outer.length,14);
 assert.ok(core.core.x>0&&core.core.y>0);
 assert.ok(core.core.x>=44,'side bands must allow whole micro labels on mobile');
});

test('all 18 zero institutions still produce an 18-cell muted mosaic',()=>{
 const tiles=marketTiles(Array(18).fill(0),390,290);
 assert.equal(tiles.length,18);
 assert.equal(tiles.filter(t=>t.zero).length,18);
 assert.ok(tiles.every(t=>t.w>0&&t.h>0));
 assert.ok(Math.abs(tiles.reduce((a,t)=>a+t.w*t.h,0)-390*290)<1e-5);
});

test('among normal active tiles, relative area follows actual posting counts',()=>{
 const values=Array(18).fill(0);values[0]=8;values[1]=4;values[2]=2;
 const tiles=marketTiles(values,610,340);
 const byIndex=i=>tiles.find(t=>t.i===i);
 const a=byIndex(0).w*byIndex(0).h,b=byIndex(1).w*byIndex(1).h,c=byIndex(2).w*byIndex(2).h;
 assert.equal(tiles.length,18);
 assert.equal(tiles.filter(t=>!t.zero).length,3);
 assert.ok(Math.abs(a/b-2)<1e-8,'8 vs 4 needs a 2:1 active area ratio');
 assert.ok(Math.abs(b/c-2)<1e-8,'4 vs 2 needs a 2:1 active area ratio');
 assert.ok(!byIndex(0).visualFloor&&!byIndex(1).visualFloor&&!byIndex(2).visualFloor);
});

test('extremely skewed counts preserve an honestly labeled legibility floor',()=>{
 const values=Array(18).fill(0);values[0]=2000;values[1]=1;
 const tiles=marketTiles(values,400,300);
 assert.equal(tiles.length,18);
 assert.equal(tiles.find(t=>t.i===1).count,1);
 assert.equal(tiles.find(t=>t.i===1).visualFloor,true);
 assert.ok(tiles.find(t=>t.i===1).w*tiles.find(t=>t.i===1).h>1000);
 const tiny=tiles.find(t=>t.i===1);
 assert.ok(Math.min(tiny.w,tiny.h)>=18,
  'smallest active rectangle must fit a micro name and count: '+JSON.stringify(tiny));
});

test('homepage and About describe an all-in-one daily map, without zero lists or visible numeric zero tiles',()=>{
 const html=read('index.html'),css=read('market-width.css'),js=read('market-width.js');
 const pos=s=>html.indexOf(s);
 assert.ok(pos('class="analytics-left"')<pos('id="dist"')&&pos('id="dist"')<pos('id="spark"'));
 assert.ok(pos('id="spark"')<pos('id="marketWidth"')&&pos('id="marketWidth"')<pos('id="top50"'));
 assert.ok(pos('id="top50"')<pos('id="cnCityMap"'));
 assert.match(css,/\.analytics-card > \.analytics-left[\s\S]*?grid-column:1/);
 assert.match(css,/\.analytics-card > \.ac-col-market[\s\S]*?grid-column:2/);
 assert.equal((html.match(/data-market-region=/g)||[]).length,4);
 assert.ok(html.includes('Market Width: 18 institutions we watch closely'));
 assert.ok(html.includes('new postings across'));
 assert.ok(html.includes('Size reflects postings'));
 assert.ok(html.includes('id="marketWidthMap"'));
 assert.ok(html.includes('id="marketWidthDetail"'));
 assert.doesNotMatch(html,/marketWidthZeroNames|marketWidthZeroPanel|No new postings<\/span>|mw-matrix|mw-cell|mw-legend-chip|mw-axis-tick/);
 assert.doesNotMatch(js,/zeroPanel|zeroItems|mw-zero-name/);
 assert.match(js,/if\(!zero\)\{/);
 assert.match(js,/lockup\.append\(name\)/);
 assert.match(js,/lockup\.append\(amount\)/);
 assert.match(js,/function marketTiles\(/);
 for(const ver of ['market-width.js?v=market-width-15','market-width.css?v=market-width-15'])assert.ok(html.includes(ver));
 assert.match(read('app.js'),/window\.MarketWidth\?\.render\(chartData,days\)/);
 assert.match(read('account.js'),/'top30-layout\.js','market-width\.js'/);
 assert.match(read('scripts/browser_assets.mjs'),/'\/market-width\.js'/);
 assert.ok(read('scripts/public_assets.mjs').includes("'market-width.js', 'market-width.css'"));
 assert.match(read('about.html'),/All 18 institutions remain visible in one map/);
 assert.doesNotMatch(read('about.html'),/remain visible outside the map|only institutions with qualifying new postings appear/);
});

test('brand abbreviations remain governed by the 18-company mapping',()=>{
 assert.equal(COMPACT.length,18);assert.equal(MICRO.length,18);
 assert.equal(COMPACT[1],'Standard Chartered');
 assert.equal(COMPACT[12],'Morgan Stanley');
 assert.equal(MICRO[12],'MS');
 assert.equal(MICRO[1],'SC');
 assert.equal(COMPACT[10],'BofA');
 assert.equal(MICRO[11],'FIL');
 assert.ok(!COMPACT.some(v=>v.endsWith(' St.')||v.endsWith(' C.')));
 assert.ok(COMPACT.every(Boolean)&&MICRO.every(Boolean));
 assert.match(read('market-width.js'),/const allowed=rect\.w>=82/);
});

test('clean mineral blue belongs to active inner tiles; neutral gray belongs to outer placeholders',()=>{
 const css=read('market-width.css'),js=read('market-width.js'),html=read('index.html');
 assert.match(css,/--mw-zero:#f0f1ef/);
 assert.match(css,/--mw-active:#d6ebff/);
 assert.match(css,/--mw-accent:#1d5f9a/);
 assert.match(css,/--mw-seam:1px/);
 assert.match(css,/\[data-theme="dark"\] \.analytics-card > \.ac-col-market/);
 assert.match(js,/function zeroPerimeter\(/);
 assert.match(js,/zone:'perimeter'/);
 assert.match(js,/zone:'core'/);
 assert.match(js,/\(zero\?'mw-is-zero':'mw-is-active'\)/);
 assert.doesNotMatch(js,/activityTier|toneOf|mw-activity-|mw-firm-/);
 assert.doesNotMatch(css,/--mw-(?:low|mid|high|tone-\d)|\.mw-activity-|\.mw-firm-/);
 assert.match(css,/\.mw-is-zero \{--mw-tile-fill:var\(--mw-zero\);--mw-tile-ink:var\(--mw-zero-ink\)\}/);
 assert.match(css,/\.mw-is-active \{--mw-tile-fill:var\(--mw-active\);--mw-tile-ink:var\(--mw-active-ink\)\}/);
 assert.match(css,/\.mw-is-active \.mw-tile-count \{color:var\(--mw-accent\)\}/);
 assert.doesNotMatch(css,/\.mw-is-active \.mw-tile-face \{box-shadow:inset 0 2px 0/);
 assert.match(css,/background:var\(--glass-light\)/);
 assert.match(css,/\.mw-detail\s*\{[\s\S]*?position:absolute/);
 assert.match(css,/\.mw-detail\[hidden\]/);
 assert.doesNotMatch(html,/18 institutions · 30 days|Explore exact institution counts|First observed on LinkedIn/);
});

test('all 18 firms use one centered name-over-count lockup, never side-by-side micro tiles',()=>{
 const js=read('market-width.js'),css=read('market-width.css');
 assert.match(js,/lockup\.className='mw-tile-lockup'/);
 assert.match(js,/face\.append\(lockup\)/);
 assert.match(js,/function fitTileContent\(/);
 assert.match(css,/\.mw-tile-lockup\s*\{[^}]*flex-direction:column/);
 assert.match(css,/\.mw-tile-name\s*\{[^}]*text-align:center/);
 assert.match(css,/\.mw-tile-count\s*\{[^}]*align-self:center/);
 assert.doesNotMatch(css,/\.mw-tile-tiny|\.mw-tile-dense|flex-direction:row;align-items:center/);
});

test('typography tiers grow with each tile geometry, never the count of active firms',()=>{
 const small=tileTypography(55,34),medium=tileTypography(120,80);
 const large=tileTypography(175,110),feature=tileTypography(480,260);
 assert.deepEqual([small.tier,medium.tier,large.tier,feature.tier],['small','medium','large','feature']);
 assert.equal(tileTypography(85,92).tier,'medium','tall mobile positive tiles should not use tiny labels');
 assert.ok(feature.name>=20&&feature.count>=28);
 assert.ok(feature.name>large.name&&large.name>medium.name&&medium.name>small.name);
 assert.ok(feature.count>large.count&&large.count>medium.count&&medium.count>small.count);
});


test('Market Width tile seams are a continuous mosaic, not individually spaced cards',()=>{
 const css=read('market-width.css');
 assert.match(css,/--mw-seam:1px/);
 assert.match(css,/\.mw-tile\s*\{[^}]*padding:var\(--mw-seam\)/);
 assert.match(css,/\.mw-tile-face\s*\{[^}]*border-radius:1\.5px/);
 assert.doesNotMatch(css,/margin:[1-9]px;[^}]*\.mw-tile/);
});

test('clean ice-blue and neutral tiles have deliberate hue and AA contrast in both modes',()=>{
 const css=read('market-width.css');
 const light={zero:'#f0f1ef',zeroInk:'#626e75',active:'#d6ebff',activeInk:'#173c5c',accent:'#1d5f9a'};
 const dark={zero:'#293945',zeroInk:'#cdd8dd',active:'#34526b',activeInk:'#eef6fc',accent:'#b9dcfc'};
 const channel=x=>x.match(/[a-f0-9]{2}/gi).map(v=>parseInt(v,16));
 const linear=x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
 const lum=x=>{const c=channel(x).map(v=>linear(v/255));return c[0]*.2126+c[1]*.7152+c[2]*.0722};
 const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
 for(const [theme,palette] of [['light',light],['dark',dark]]){
  for(const color of Object.values(palette))assert.ok(css.includes(color),'missing '+theme+' color '+color);
  for(const [fill,ink] of [[palette.zero,palette.zeroInk],[palette.active,palette.activeInk],[palette.active,palette.accent]])
   assert.ok(contrast(fill,ink)>=4.5,'small text AA '+JSON.stringify({theme,fill,ink,ratio:contrast(fill,ink)}));
  const distance=Math.hypot(...channel(palette.active).map((v,i)=>v-channel(palette.zero)[i]));
  assert.ok(distance>30,'active blue should be visibly separate from neutral '+theme);
 }
 assert.ok(lum(light.active)>.78,'active surface should remain clean and very light');
 assert.ok(lum(light.zero)>.85,'zero surface must match the pale neutral canvas');
 assert.ok(channel(light.active)[2]-channel(light.active)[0]>30,'clear blue hue, not a dirty gray blend');
 assert.ok(lum(light.accent)<.2,'blue count accent must be concise and legible');
 assert.doesNotMatch(css,/linear-gradient\(/);
});


