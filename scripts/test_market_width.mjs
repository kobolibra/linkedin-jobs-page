import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {FIRMS,DISPLAY,COMPACT,MICRO,REGIONS,firmIndex,aggregate,daily,limit,treemap,marketTiles,colorLevel,colorPosition,tileTypography,playbackIndices,nextPlaybackDay,trendGeometry,trendPointAt}=require('../market-width.js');
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
test('the original mixed treemap includes active tiles on the outside, without a forced zero ring',()=>{
 const edge=(t,W,H)=>Math.abs(t.x)<1e-7||Math.abs(t.y)<1e-7||
  Math.abs(t.x+t.w-W)<1e-7||Math.abs(t.y+t.h-H)<1e-7;
 for(const [W,H] of [[350,290],[505,319],[640,340],[960,400]]){
  const counts=Array.from({length:18},(_,i)=>i===1?2:i===11?4:i===12?3:i===16?5:0);
  const tiles=marketTiles(counts,W,H);
  assert.equal(tiles.length,18);
  assert.equal(tiles.filter(t=>!t.zero).length,4);
  assert.ok(tiles.filter(t=>!t.zero).some(t=>edge(t,W,H)),
   'active tiles must be allowed on the normal outer edge, not artificially ringed');
  assert.ok(tiles.every(t=>!('zone' in t)),'never impose core/perimeter zones');
  const total=tiles.reduce((sum,t)=>sum+t.w*t.h,0);
  assert.ok(Math.abs(total-W*H)<1e-5);
  assert.deepEqual(tiles,marketTiles(counts,W,H),'original mixed order must be stable');
 }
 assert.doesNotMatch(read('market-width.js'),/zeroPerimeter|zone:'perimeter'|zone:'core'/);
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
 assert.match(css,/grid-template-rows:minmax\(0,1\.85fr\) minmax\(0,1fr\)/,'first region chart receives more height');
 assert.ok(!html.includes('id="distNote"'),'unnecessary first-seen footnote is completely removed');
 assert.match(css,/\.analytics-card > \.ac-col-market[\s\S]*?grid-column:2/);
 assert.equal((html.match(/data-market-region=/g)||[]).length,4);
 assert.match(html,/<h3 id="marketWidthTitle"><span class="mw-heading-label">Market Breadth:<\/span> <span class="mw-title-phrase">18 institutions we watch closely<\/span><\/h3>/);
 assert.match(css,/\.mw-heading-label,\.mw-title-phrase\{white-space:nowrap\}/,'never split the figure label or institution phrase');
 assert.ok(html.includes('new postings across'));
 assert.ok(html.includes('Size and shade reflect new postings of the day, excluding reposts'));
 assert.ok(html.includes('id="marketWidthMap"'));
 assert.ok(html.includes('id="marketWidthDetail"'));
 assert.ok(pos('id="marketWidthTitle"')<pos('id="marketWidthRegions"')&&
   pos('id="marketWidthRegions"')<pos('id="marketWidthMap"'),
   'regional filters must sit to the right of the chart title, above the board');
 assert.ok(pos('id="marketWidthMap"')<pos('class="mw-footer"')&&
   pos('class="mw-footer"')<pos('id="marketWidthCount"')&&
   pos('id="marketWidthCount"')<pos('class="mw-encoding"'),
   'the board must sit above daily summary, navigation and explanation');
 assert.ok(pos('id="marketWidthMap"')<pos('id="marketWidthPrev"'),
   'date controls belong below the treemap, not above');
 assert.match(css,/\.mw-footer\s*\{[^}]*display:flex/);

 assert.doesNotMatch(html,/marketWidthZeroNames|marketWidthZeroPanel|No new postings<\/span>|mw-matrix|mw-cell|mw-legend-chip|mw-axis-tick/);
 assert.doesNotMatch(js,/zeroPanel|zeroItems|mw-zero-name/);
 assert.match(js,/if\(!zero\)\{/);
 assert.match(js,/lockup\.append\(name\)/);
 assert.match(js,/lockup\.append\(amount\)/);
 assert.match(js,/function marketTiles\(/);
 for(const ver of ['market-width.js?v=market-calendar-1','market-width.css?v=market-trend-line-30'])assert.ok(html.includes(ver));
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

test('one ordered perceptual ramp replaces categorical institution colors',()=>{
 const css=read('market-width.css'),js=read('market-width.js'),html=read('index.html');
 assert.match(css,/--mw-zero:color-mix\(in oklab,var\(--mw-ramp-light\) 34%,var\(--mw-map-ground\)\)/);
 assert.match(css,/--mw-zero-ink:#526379/);
 assert.match(css,/--mw-zero-ink:#d1ddec/);
 assert.match(css,/--mw-ramp-light:#d8e0f4;--mw-ramp-deep:#9badd7/);
 assert.match(css,/--mw-active-ink:#102b44;--mw-accent:#102b44/);
 assert.match(css,/color-mix\(in oklab,var\(--mw-ramp-light\),var\(--mw-ramp-deep\) var\(--mw-tone,0%\)\)/);
 assert.match(css,/--mw-seam:\.5px/);
 assert.match(js,/function colorLevel\(count\)/);
 assert.match(js,/button\.style\.setProperty\('--mw-tone',colorPosition\(tile\.count\)\)/);
 assert.doesNotMatch(js,/PREFERRED_INK|colorTiles|mw-hue-|zeroPerimeter|zone:'perimeter'|zone:'core'/);
 assert.doesNotMatch(css,/\.mw-hue-|--mw-paint-|--mw-tone-\d|linear-gradient\(/);
 assert.match(css,/\.mw-is-zero \{--mw-tile-fill:var\(--mw-zero\);--mw-tile-ink:var\(--mw-zero-ink\)\}/);
 assert.match(css,/\.mw-is-active \.mw-tile-count \{color:var\(--mw-accent\)\}/);
 assert.match(css,/background:var\(--glass-light\)/);
 assert.match(css,/\.mw-detail\s*\{[\s\S]*?position:absolute/);
 assert.match(css,/\.mw-detail\[hidden\]/);
 assert.doesNotMatch(html,/Active institutions are grouped in the center|Neutral inactive institutions sit around the perimeter/);
});

test('same counts always equal the same color level, independently of institution, layout and region',()=>{
 assert.equal(colorLevel(0),null);
 assert.equal(colorLevel(-1),null);
 assert.equal(colorLevel(1),0);
 assert.equal(colorPosition(1),'0.0000%');
 assert.equal(colorLevel(2),.25);
 assert.equal(colorLevel(3),.4);
 assert.equal(colorLevel(5),4/7);
 const values=[1,2,3,5,8,13,24,50,100,700,10000];
 for(let i=1;i<values.length;i++){
  assert.ok(colorLevel(values[i])>colorLevel(values[i-1]),
   'count-to-color map must increase smoothly for every positive count');
 }
 for(const [w,h] of [[350,290],[510,316],[960,400]]){
  const counts=Array.from({length:18},(_,i)=>[0,1,2,3,5,10][i%6]);
  const cells=marketTiles(counts,w,h);
  const snapshot=JSON.stringify(cells);
  const levels=cells.map(t=>colorLevel(t.count));
  assert.equal(JSON.stringify(cells),snapshot,'color must not mutate any geometry or data');
  for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++)
   if(cells[i].count===cells[j].count)assert.equal(levels[i],levels[j],
    'same positive count always yields exactly the same level');
 }
 assert.equal(colorPosition(2),colorPosition(2));
 assert.equal(colorPosition(700),colorPosition(700));
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

test('large and spacious tiles share a restrained 18/26px type scale',()=>{
 const small=tileTypography(55,34),medium=tileTypography(120,80);
 const large=tileTypography(175,110),feature=tileTypography(480,260);
 assert.deepEqual([small.tier,medium.tier,large.tier,feature.tier],['small','medium','large','feature']);
 assert.equal(tileTypography(85,92).tier,'medium','tall mobile positive tiles should not use tiny labels');
 assert.deepEqual([feature.name,feature.count],[18,26]);
 assert.deepEqual([large.name,large.count],[18,26],'ample rectangles must not jump up or down in size');
 assert.ok(large.name>medium.name&&medium.name>small.name);
 assert.ok(large.count>medium.count&&medium.count>small.count);
});


test('Market Width shares a half-pixel tile inset for a single-pixel mosaic hairline',()=>{
 const css=read('market-width.css');
 assert.match(css,/--mw-seam:\.5px/);
 assert.match(css,/\.mw-tile\s*\{[^}]*padding:var\(--mw-seam\)/);
 assert.match(css,/\.mw-tile-face\s*\{[^}]*border-radius:1px/);
 assert.doesNotMatch(css,/margin:[1-9]px;[^}]*\.mw-tile/);
});

test('numerical ramp remains light-first and accessible at both extremes, in both themes',()=>{
 const css=read('market-width.css'),global=read('styles.css');
 const channel=x=>x.match(/[a-f0-9]{2}/gi).map(v=>parseInt(v,16));
 const linear=x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
 const lum=x=>{const c=channel(x).map(v=>linear(v/255));return c[0]*.2126+c[1]*.7152+c[2]*.0722};
 const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
 const endpoints=[
  ['light','#d8e0f4','#9badd7','#102b44'],
  ['dark','#58688b','#465779','#f5f0e8']
 ];
 for(const [theme,start,end,ink] of endpoints){
  assert.ok(css.includes(start)&&css.includes(end),'missing fixed '+theme+' ramp endpoints');
  assert.ok(contrast(start,ink)>=4.5&&contrast(end,ink)>=4.5,
   'AA small-name and exact-count text at both endpoints '+theme);
  assert.ok(lum(start)>lum(end),'higher numbers must be perceptually darker '+theme);
 }
 assert.ok(lum('#d8e0f4')>.72,'indigo low-count tiles stay bright enough to read as porcelain blue');
 assert.ok(lum('#9badd7')>.40,'higher-count tones retain luminous mid-blue depth');
 assert.ok(css.includes('var(--mw-ramp-light) 34%,var(--mw-map-ground)'),
  'zero tiles must share the same pigment family as positive tiles, softened by the background');
 assert.ok(global.includes('--navy:#16395a'),'use the website navy as art direction');
});







test('Market Width opens on the latest ended calendar day, independent of its volume',()=>{
 const {initialDay,latestUpdate}=require('../market-width.js');
 const keys=['2026-11-12','2026-11-13','2026-11-14','2026-11-15','2026-11-16'];
 const series=totals=>({keys,counts:{all:totals.map(n=>Array.from({length:18},(_,i)=>i===0?n:0))}});
 const at=s=>new Date(s).getTime();
 // Data last updated during 16 Nov: 16 Nov is still being collected, 15 Nov is complete.
 assert.equal(initialDay(series([40,213,3,2,2]),at('2026-11-16T12:02:00')),3,
  'a complete but quiet Sunday is shown as it is; volume never moves the default');
 assert.equal(initialDay(series([40,213,3,0,2]),at('2026-11-16T12:02:00')),3,
  'a complete day with zero postings is still the latest complete day');
 assert.equal(initialDay(series([40,213,3,2,2]),at('2026-11-17T00:05:00')),4,
  'once an update lands after midnight, the previous day becomes the default');
 assert.equal(initialDay(series([0,0,0,0,9]),at('2026-11-12T08:00:00')),4,
  'with no complete day in the window, fall back to the latest day');
 assert.equal(initialDay(series([1,1,1,1,1]),null),4,'unknown update time falls back to the latest day');
 assert.equal(latestUpdate([{pushTime:'2026-11-16T04:02:00Z'},{firstSeen:'2026-11-15T01:00:00Z'},{pushTime:'2026-11-17T00:00:00Z',jobStatus:'expired'},{firstSeen:'bad'}]),
  Date.parse('2026-11-16T04:02:00Z'),'latest update reads active rows only and ignores invalid dates');
 assert.doesNotMatch(read('market-width.js'),/mid\*\.5|median of the active days/,'no volume threshold decides the default day');
});


test('seven-day Market Width loop is exactly the newest seven calendar days, including the last partial day',()=>{
 const window=playbackIndices(30);
 assert.deepEqual(window,[23,24,25,26,27,28,29]);
 assert.deepEqual(playbackIndices(7),[0,1,2,3,4,5,6]);
 assert.deepEqual(playbackIndices(3),[0,1,2]);
 assert.deepEqual(playbackIndices(0),[]);
 assert.deepEqual(playbackIndices(-3),[]);
 let selected=window[0],seen=[selected];
 for(let i=0;i<7;i++){selected=nextPlaybackDay(selected,window);seen.push(selected);}
 assert.deepEqual(seen,[23,24,25,26,27,28,29,23],
  'the latest day wraps to the first of the same seven, never to day zero of the 30-day history');
 assert.equal(nextPlaybackDay(3,window),23,'starting outside the seven-day range jumps to its oldest day');
 assert.equal(nextPlaybackDay(1,[]),1,'empty input never changes the selection');
 const js=read('market-width.js'),html=read('index.html');
 assert.match(js,/const loopDays=playbackIndices\(series.keys.length\)/);
 assert.match(js,/listen\(document,'visibilitychange',schedulePlay\)/);
 assert.match(js,/listen\(board,'pointerenter'/);
 assert.match(js,/pauseForInspection\(\);\s*const to=Math.max/,'manual navigation holds playback');
 assert.match(js,/playing=!motion.matches/,'autoplay defaults to running unless reduced motion is requested');
 assert.doesNotMatch(html,/id="marketWidthPlay"/,'no redundant Play button');
 assert.match(js,/PLAY_INTERVAL_MS=7600/,'daily frames need readable dwell time');
 assert.match(js,/DISSOLVE_MS=1300/,'slow dissolve avoids a distracting flicker');
 assert.match(js,/if\(!started\)started=true/,'first visible frame must not jump to the oldest loop day');
 assert.match(js,/dissolveDay\(loopDays\[0\]\)/,'returning from manual history must dissolve, never flash');
 assert.match(js,/previous\.inert=true/,'the crossfade ghost cannot capture keyboard focus');
 assert.match(js,/board\.after\(previous\)/,'old and new snapshots have independent frame geometry');
 const css=read('market-width.css'),home=read('home.css');
 assert.match(css,/\.mw-previous-frame\.is-fading\{opacity:0\}/);
 assert.match(css,/\.mw-map-board\.mw-new-frame\.is-revealed\{/);
 assert.doesNotMatch(css,/transition:left/,'no arbitrary tile motion implying continuity between dates');
 assert.match(home,/border-top:1px solid var\(--h-rule\);border-bottom:1px solid var\(--h-rule\)/,
  'the top metric rule belongs to the same fine-line system as the rest of the page');
});

test('Market Breadth uses a shape-preserving 30-day smooth trend, not daily columns',()=>{
 const vals=[0,0,6,12,12,5,0,4,18,2,0,0,9,17,20,3,1,7,11,11,6,2,15,9,2,0,5,13,8,1];
 const geom=trendGeometry(vals,600,44);
 assert.equal(geom.points.length,30);
 assert.equal(geom.slopes.length,30);
 assert.equal((geom.path.match(/ C /g)||[]).length,29,'each pair of observed daily totals has a cubic segment');
 assert.ok(!/NaN|Infinity/.test(geom.path),'missing days or flat sections never break the SVG');
 vals.forEach((_,i)=>{
  const p=trendPointAt(geom,i);
  assert.ok(Math.abs(p.y-geom.points[i].y)<.0001,'observed day lands exactly on the line');
  assert.ok(Math.abs(p.x-geom.points[i].x)<.0001,'point x matches the actual day');
 });
 for(let i=0;i<vals.length-1;i++)for(let j=0;j<=20;j++){
  const y=trendPointAt(geom,i+j/20).y;
  const lo=Math.min(geom.points[i].y,geom.points[i+1].y);
  const hi=Math.max(geom.points[i].y,geom.points[i+1].y);
  assert.ok(y>=lo-.00001&&y<=hi+.00001,'monotone line must not invent a new peak between actual days');
 }
 const flat=trendGeometry([0,0,0,0],320),single=trendGeometry([1],320);
 assert.ok(!/NaN|Infinity/.test(flat.path+single.path));
 assert.equal(single.points.length,1);
});

test('editorial cleanup: masthead folio has no top rule and Fig. 1 has no duplicate legend',()=>{
 const html=read('index.html'),masthead=read('next-journey-masthead.css');
 const home=read('home.css'),legacy=read('styles-refinement.css');
 assert.doesNotMatch(html,/class="region-chart-legend"/,'direct plot labels replace the redundant region legend');
 assert.doesNotMatch(legacy,/\.region-chart-legend/,'remove retired legend styling');
 assert.match(masthead,/\.nj-masthead-folio\s*\{\s*border-top:0;/);
 assert.doesNotMatch(home,/rhythm-avg|rhythm-avg-label|rhythm-avg-halo/,
  'New Postings mean line, halo and label styling are completely removed');
 const porcelain=read('PORCELAIN_DESIGN_AUDIT.md');
 assert.match(porcelain,/DATA #334EAC/,'historical Porcelain design explicitly defines its blue data color');
 assert.match(porcelain,/FAINTDATA #BAD6EB/,'historical Porcelain design explicitly defines the pale blue');
 assert.match(home,/--h-market-porcelain-data:#334eac/,'light mode restores the original Porcelain DATA pigment');
 assert.match(home,/--h-market-porcelain-data:#bad6eb/,'dark mode restores the original Porcelain --chart pigment');
 assert.match(home,/\.mw-trend-line\{[^}]*stroke:var\(--h-market-porcelain-data\)/);
 assert.match(home,/\.mw-trend-point\{[^}]*fill:var\(--h-market-porcelain-data\)/);
 assert.doesNotMatch(home,/#63bbc8|#8ed4dc|--h-market-celadon/,
  'eliminate the invented teal color names and values');
 assert.doesNotMatch(read('app.js'),/rhythm-avg|rhythm-avg-halo|rhythm-avg-label|\+average\+/,
  'New Postings SVG must never emit an average overlay or annotation');
 assert.doesNotMatch(home,/mw-date-nav output\[data-partial="true"\]::after/,'do not print so far beside a date');
 assert.match(html,/Mean and median listing age define the horizontal and vertical axes/);
});

test('the trend marker is synchronized with the selected calendar day',()=>{
 const js=read('market-width.js'),css=read('home.css');
 assert.match(js,/class','mw-trend-line'/);
 assert.match(js,/class','mw-trend-indicator'/);
 assert.match(js,/const eased=t\*t\*\(3-2\*t\)/);
 assert.match(js,/paint\(oldDay\+\(day-oldDay\)\*eased\)/,'animated point is painted on the true cubic');
 assert.match(js,/if\(t<\.5\)paint\(oldDay,1-2\*t\)/,'wraps dissolve instead of racing across six dates');
 assert.doesNotMatch(css,/mw-strip-day::before/,'daily bars must be fully replaced by the trend');
 assert.match(css,/\.mw-strip\{/);
});
