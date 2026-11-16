/* Real Chromium QA for one integrated 18-institution market mosaic:
   no printed zeroes, count-labeled activity tiles, trustworthy color contrast,
   no hover layout shift, desktop/mobile, light/dark, and sparse extremes. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
const source=new URL('../',import.meta.url);
const html=readFileSync(new URL('index.html',source),'utf8');
const styles=['styles.css','styles-refinement.css','cn-city-map.css','market-width.css','home.css']
 .map(name=>readFileSync(new URL(name,source),'utf8')).join('\n');
const script=readFileSync(new URL('market-width.js',source),'utf8');
const appSource=readFileSync(new URL('app.js',source),'utf8');
const leftStart=appSource.indexOf('    const rc={CN:0,HK:0,SG:0,OTHER:0};');
const leftEndTag="    requestAnimationFrame(()=>sparkEl.classList.add('is-ready'));";
const leftEnd=appSource.indexOf(leftEndTag,leftStart);
assert.ok(leftStart>=0&&leftEnd>leftStart,'left chart drawing must use real app.js code');
const leftDrawing=appSource.slice(leftStart,leftEnd+leftEndTag.length);

const analytics=html.match(/<div class="analytics reveal"[\s\S]*?(?=<\/header>)/)?.[0];
assert.ok(analytics,'homepage analytics block exists');
const firms=['HSBC','Standard Chartered','Citi','JPMorgan Chase','BNP Paribas',
 'Societe Generale','DBS Bank','Deutsche Bank','Goldman Sachs','BlackRock',
 'Bank of America','Fidelity International','Morgan Stanley','BBVA','Natixis',
 'UBS','Schroders','Invesco'];
const days=Array.from({length:30},(_,i)=>{
 const key=new Date(Date.UTC(2026,9,14+i,12)).toISOString().slice(0,10);
 return {key,label:key};
});
const regular=[];
for(let day=0;day<29;day++){
 for(const [company,quantity,region] of [
  ['Standard Chartered',2,'CN'],['Morgan Stanley',3,'HK'],
  ['Fidelity International',4,'SG'],['Schroders',5,'CN']
 ]){
  for(let n=0;n<quantity;n++)regular.push({
   company,location:region,firstSeen:days[day].key+'T09:00:00Z',jobStatus:'active'
  });
 }
}
mkdirSync(new URL('artifacts/market-width/',source),{recursive:true});
const browser=await chromium.launch({headless:true});
const make=async(width,theme)=>{
 const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1,reducedMotion:'reduce'});
 await page.setContent('<!doctype html><html data-theme="'+theme+'"><head><style>'+styles+'</style></head><body><div class="shell">'+analytics+'</div></body></html>');
 await page.addScriptTag({content:script});
 return page;
};
const summary=page=>page.locator('.mw-summary').textContent().then(v=>v.replace(/\s+/g,' ').trim());
// Render both left charts with their production SVG logic and a deterministic
// fixture, not a hand-drawn approximation. The fixture is the same as Market Width.
async function renderLeft(page,chartData,theme){
 await page.evaluate(([draw,rows])=>{
  const norm=location=>location;
  const seenAt=job=>job.firstSeen;
  const dayKey=date=>new Date(date).toISOString().slice(0,10);
  const keyOf=dayKey;
  const REGIONS={CN:{label:'Mainland China'},HK:{label:'Hong Kong'},
   SG:{label:'Singapore'},OTHER:{label:'Other'}};
  const cityEl=document.createElement('select');
  new Function('chartData','norm','seenAt','dayKey','keyOf',
   'REGIONS','cityEl',draw)(rows,norm,seenAt,dayKey,keyOf,REGIONS,cityEl);
 },[leftDrawing,chartData]);
 const quality=await page.evaluate(()=>{
  const lines=[...document.querySelectorAll('#dist .region-spark-line')];
  const bars=[...document.querySelectorAll('#spark .rhythm-bar')];
  const hits=[...document.querySelectorAll('#dist .region-spark-hit')];
  const scale=selector=>[...document.querySelectorAll(selector)].map(node=>({
   value:Number(node.textContent),y:Number(node.getAttribute('y'))
  }));
  const series=Object.fromEntries(['cn','hk','sg'].map(r=>
   [r,getComputedStyle(document.querySelector('#dist .region-series.'+r+' .region-spark-line')).stroke]));
  const stackBands=[...document.querySelectorAll('#dist .region-stack-band')];
  const regionGroups=[...document.querySelectorAll('#dist svg > g.region-series')]
   .filter(g=>g.querySelector('.region-stack-band'));
  const stackPoint=(k,last=false)=>{
   const list=[...document.querySelectorAll('#dist .region-series.'+k+' .region-spark-hit')];
   const node=last?list.at(-1):list[0];
   return node?{count:Number(node.dataset.count),lower:Number(node.dataset.lower),
    upper:Number(node.dataset.upper),cumulative:Number(node.dataset.cumulative),
    stacked:Number(node.dataset.stacked),bin:Number(node.dataset.bin)}:null;
  };
  const svg=document.querySelector('#dist .region-time-svg');
  const stage=svg.closest('.region-plot-stage');
  const statRows=[...stage.querySelectorAll('.region-end-label')];
  const rect=node=>{const r=node.getBoundingClientRect();return {
   x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom
  };};
  const weekendBars=bars.filter(node=>node.classList.contains('weekend'));
  const columns=[...document.querySelectorAll('#spark .rhythm-point')];
  const segFill=r=>{const node=document.querySelector('#spark .rhythm-seg.'+r);return node?getComputedStyle(node).fill:null;};
  const regionDateNodes=[...svg.querySelectorAll('.region-spark-date')];
  const referenceNodes=[...svg.querySelectorAll('.region-measure-reference')];
  const heightNodes=[...svg.querySelectorAll('.region-measure-height')];
  const endDate=regionDateNodes.at(-1);
  const lastPostingLine=document.querySelector('#spark .rhythm-grid');
  const postingDateNodes=[...document.querySelectorAll('#spark .rhythm-axis-label')];
  return {series,bars:bars.length,regions:lines.length,
   viewportWidth:window.innerWidth,
   weekendCount:weekendBars.length,
   weekendBands:document.querySelectorAll('#spark .rhythm-weekend').length,
   segmentFills:{hk:segFill('hk'),sg:segFill('sg'),cn:segFill('cn')},
   columnSums:columns.map(g=>({total:Number(g.dataset.total),
    stacked:[...g.querySelectorAll('.rhythm-seg')].reduce((n,seg)=>n+Number(seg.dataset.count),0),
    order:[...g.querySelectorAll('.rhythm-seg')].map(seg=>seg.dataset.region)})),
   averageOverlayCount:document.querySelectorAll('#spark .rhythm-avg,#spark .rhythm-avg-halo,#spark .rhythm-avg-label').length,
   sparkAria:document.querySelector('#spark .rhythm-svg').getAttribute('aria-label'),
   labelTotal:statRows.reduce((n,node)=>n+Number(node.dataset.count),0),
   stageTotal:Number(stage.dataset.visibleTotal),
   shortHistory:stage.classList.contains('is-short-history'),
   shortLabelDisplays:statRows.map(node=>getComputedStyle(node).display),
   shortLabelBackgrounds:statRows.map(node=>getComputedStyle(node).backgroundImage),
   plotRight:Number(svg.dataset.plotRight),
   calendarMode:svg.dataset.calendarMode,calendarStep:Number(svg.dataset.calendarStep),
   ranges:[...document.querySelectorAll('.chart-date-range')].map(n=>n.textContent),
   postingsPlotRight:Number(lastPostingLine?.getAttribute('x2')),
   heightRefs:referenceNodes.map(node=>({
    level:Number(node.dataset.level),
    x1:Number(node.getAttribute('x1')),x2:Number(node.getAttribute('x2')),
    y:Number(node.getAttribute('y1'))
   })),
   heights:heightNodes.map(node=>({
    region:node.dataset.region,count:Number(node.dataset.count),
    lower:Number(node.dataset.lower),upper:Number(node.dataset.upper),
    x1:Number(node.getAttribute('x1')),x2:Number(node.getAttribute('x2')),
    y1:Number(node.getAttribute('y1')),y2:Number(node.getAttribute('y2')),
    ink:getComputedStyle(node).stroke
   })),
   capGroups:[...svg.querySelectorAll('.region-measure-group')].map(g=>({
    region:g.querySelector('.region-measure-height')?.dataset.region,
    caps:[...g.querySelectorAll('.region-measure-cap')].filter(n=>getComputedStyle(n).display!=='none').map(n=>({
     ink:getComputedStyle(n).stroke,edge:n.dataset.edge,
     y:Number(n.getAttribute('y1')),x1:Number(n.getAttribute('x1')),x2:Number(n.getAttribute('x2'))
    }))
   })),
   obsoleteArrowheads:svg.querySelectorAll('.region-measure-arrow').length,
   regionDateTickCount:svg.querySelectorAll('.region-date-tick').length,
   postingDateTickCount:document.querySelectorAll('#spark .rhythm-date-tick').length,
   legendCount:document.querySelectorAll('#dist .region-end-labels').length,
   oldLegendCount:document.querySelectorAll('#dist .region-mix,#dist .region-current-key,#dist .region-stat-item').length,
   legendBounds:rect(stage),svgBounds:rect(svg),
   forbiddenGuideCount:svg.querySelectorAll('.region-end-guide,.region-end-tick,.region-dimension-span,.region-dimension-cap').length,
   curveKnots:Number(svg.dataset.curveKnots),curveError:Number(svg.dataset.curveError),
   regionDateMarks:regionDateNodes.map(node=>({
     day:Number(node.dataset.day),date:node.dataset.date,label:node.textContent,bounds:rect(node)
   })),
   postingDateMarks:postingDateNodes.map(node=>{
     const day=Number(node.dataset.day);
     const date=new Date();date.setHours(0,0,0,0);date.setDate(date.getDate()-29+day);
     return {day,label:node.textContent,weekday:date.getDay(),bounds:rect(node)};
   }),
   labelParts:statRows.map(node=>({
     name:node.querySelectorAll('.region-end-name').length,
     count:node.querySelectorAll('.region-end-count').length,
     share:node.querySelectorAll('.region-end-share').length
   })),
   legendItems:statRows.map(node=>({
     region:node.dataset.region,count:Number(node.dataset.count),
     share:node.dataset.share,label:node.querySelector('.region-end-name')?.textContent,
     visibleCount:node.querySelector('.region-end-count')?.textContent,
     visibleShare:node.querySelector('.region-end-share')?.textContent,
     ink:getComputedStyle(node.querySelector('.region-end-name')).color,
     countFont:parseFloat(getComputedStyle(node.querySelector('.region-end-count')).fontSize),
     bandCenter:Number(node.dataset.bandCenter),
     bounds:rect(node)
   })),
   stackOrder:regionGroups.map(g=>[...g.classList].find(c=>c!=='region-series')),
   bandCount:stackBands.length,
   bandFills:Object.fromEntries(['sg','hk','cn'].map(k=>{
    const node=document.querySelector('#dist .region-series.'+k+' .region-stack-band');
    return [k,node?getComputedStyle(node).fill:null];
   })),
   stackFirst:Object.fromEntries(['sg','hk','cn'].map(k=>[k,stackPoint(k)])),
   stackLast:Object.fromEntries(['sg','hk','cn'].map(k=>[k,stackPoint(k,true)])),
   chartKind:svg?.dataset.chartKind,dayBins:Number(svg?.dataset.dayBins),
   regionFinals:Object.fromEntries(['hk','sg','cn'].map(k=>[k,Number(svg?.getAttribute('data-region-'+k))])),
   finalTotal:Number(svg?.dataset.finalTotal),
   axisMax:Number(svg?.dataset.axisMax),
   chartAria:svg?.getAttribute('aria-label')||'',
   otherSeries:document.querySelectorAll('#dist .region-series.other').length,
   grid:document.querySelectorAll('#dist .region-spark-grid').length,
   captions:document.querySelectorAll('#dist .region-chart-caption,#spark .rhythm-caption').length,
   regionTicks:scale('#dist .region-spark-value'),
   postingTicks:scale('#spark .rhythm-scale-label'),
   bins:hits.length,
   pointTotal:hits.reduce((sum,node)=>sum+Number(node.dataset.count),0),
   bandPaths:[...document.querySelectorAll('#dist .region-fill .region-stack-band')].map(p=>p.getAttribute('d')),
   matchingContours:['hk','sg','cn'].every(k=>{
    const ink=document.querySelector('#dist .region-series.'+k+'.region-boundary .region-spark-line')?.getAttribute('d')||'';
    const runs=ink.split(/ (?=M[\d.]+,[\d.]+)/);
    const bands=[...document.querySelectorAll('#dist .region-series.'+k+'.region-fill .region-stack-band')];
    return bands.length===runs.filter(Boolean).length&&
     bands.every((band,i)=>band.getAttribute('d').startsWith(runs[i]));
   }),
   linePaths:lines.map(p=>p.getAttribute('d')),
   markers:document.querySelectorAll('#dist .region-spark-dot').length,
   markerInks:[...document.querySelectorAll('#dist .region-spark-dot')].map(dot=>({
    fill:getComputedStyle(dot).fill,
    expected:getComputedStyle(dot.parentElement.querySelector('.region-spark-line')).stroke
   })),
   dateTicks:regionDateNodes.length,
   postingDateTicks:postingDateNodes.length,
   filled:bars.filter(b=>Number(b.getAttribute('height'))>0).length,
   paths:lines.map(p=>p.getAttribute('d')),
   notePresent:!!document.querySelector('#distNote'),
   points:hits.map(p=>({x:Number(p.getAttribute('cx')),n:Number(p.dataset.count),bin:Number(p.dataset.bin)}))};
 });
 assert.deepEqual(quality.series,theme==='light'
  ?{cn:'rgb(179, 58, 54)',hk:'rgb(178, 122, 34)',sg:'rgb(110, 143, 59)'}
  :{cn:'rgb(238, 160, 154)',hk:'rgb(224, 179, 107)',sg:'rgb(173, 208, 132)'},
  'region contours match the approved visual palette in both themes');
 const expectedFills=theme==='light'
  ?{hk:'rgb(195, 154, 90)',sg:'rgb(143, 174, 110)',cn:'rgb(201, 114, 108)'}
  :{hk:'rgb(201, 154, 84)',sg:'rgb(141, 170, 109)',cn:'rgb(199, 122, 114)'};
 // Sparse fixtures may have no column for a region inside the 30-day window.
 for(const [k,fill] of Object.entries(quality.segmentFills))if(fill!==null)assert.equal(fill,expectedFills[k],
  'daily '+k+' columns use the regional sand/sage/terracotta family in both themes');
 assert.equal(quality.regions,3);
 assert.equal(quality.bars,30);
 assert.ok(quality.columnSums.every(c=>c.stacked===c.total),'stacked market segments always sum to the exact daily count');
 const stackRank={HK:0,SG:1,CN:2,OTHER:3};
 assert.ok(quality.columnSums.every(c=>c.order.every((r,i,a)=>!i||stackRank[a[i-1]]<stackRank[r])),
  'every column stacks HK, SG, CN, OTHER from the baseline, matching Figure 01');
 assert.equal(quality.averageOverlayCount,0,
  'New Postings has no 7-day average line, halo or label in either theme');
 assert.doesNotMatch(quality.sparkAria,/7-day average/,
  'the visual aria label must not describe an absent average line');
 assert.ok(quality.weekendCount>=8&&quality.weekendCount<=10,
  'weekend days are identified from the actual calendar, not hard-coded');
 assert.equal(quality.weekendBands,quality.weekendCount,'each weekend day has one quiet background band');
 assert.deepEqual(quality.stackOrder,['hk','sg','cn'],
  'real production distribution anchors HK below SG and CN; OTHER is excluded');
 assert.equal(quality.otherSeries,0,'OTHER never belongs in this chart or legend');
 assert.equal(quality.chartKind,'cumulative-stack','this must be a cumulative, not per-day regional chart');
 assert.equal(quality.legendCount,1,'one direct-annotation layer is part of the actual plotting stage');
 assert.equal(quality.oldLegendCount,0,'the previous large statistics header is entirely removed');
 assert.equal(quality.labelTotal,quality.finalTotal,
  'sum of directly annotated regional counts equals the cumulative y-axis endpoint');
 assert.equal(quality.stageTotal,quality.finalTotal);
 assert.equal(quality.shortHistory,quality.dayBins<100);
 assert.ok(quality.shortLabelDisplays.every(v=>v==='grid'),
  'both full-year and short-history annotations use a quiet two-level typographic layout');
 assert.ok(quality.labelParts.every(part=>part.name===1&&part.count===1&&part.share===1),
  'each two-line annotation contains exact region, count and share');
 if(quality.shortHistory)assert.ok(quality.shortLabelBackgrounds.every(x=>x==='none'),
  'short-range data must remain visible beneath labels: no opaque knockout cards');
 const visibleRegionNames=['HK','SG','CN'].filter(k=>quality.regionFinals[k.toLowerCase()]>0);
 assert.deepEqual(quality.legendItems.map(x=>x.region),visibleRegionNames);
 assert.deepEqual(quality.legendItems.map(x=>x.count),
  visibleRegionNames.map(k=>quality.regionFinals[k.toLowerCase()]),
  'individual labels equal corresponding cumulative band thicknesses');
 for(const item of quality.legendItems){
  assert.equal(item.visibleCount,item.count.toLocaleString('en-US'),
   'latest-count labels use exact unrounded values');
  assert.equal(item.visibleShare,item.share,'shares are never stale or separately hardcoded');
  assert.equal(item.label,item.region,'label is directly associated with its region');
  const labelInks=theme==='light'
   ?{hk:'rgb(148, 100, 28)',sg:'rgb(81, 110, 42)',cn:'rgb(161, 59, 56)'}
   :quality.series;
  assert.equal(item.ink,labelInks[item.region.toLowerCase()],
   'small region labels use accessible darkened ink while contours retain the approved pigment');
  assert.ok(item.bounds.x>=quality.svgBounds.x+quality.svgBounds.w*.18&&
    item.bounds.right<=quality.svgBounds.x+quality.svgBounds.w*.86,
   'regional readings must stay in the early-year LEFT whitespace, not any right gutter');
  assert.ok(item.bounds.y>=quality.svgBounds.y-1&&
    item.bounds.bottom<=quality.svgBounds.bottom+1,
   'data labels stay inside the plotting stage without a separate header');
 }
 if(quality.finalTotal){
  assert.equal(quality.legendItems.reduce((total,item)=>total+
    Math.round(parseFloat(item.share)*10),0),1000,
   'directly annotated percentages total 100.0% after rounding');
 }
 const sortedLabels=[...quality.legendItems].sort((x,y)=>x.bounds.y-y.bounds.y);
 for(let i=1;i<sortedLabels.length;i++){
  assert.ok(sortedLabels[i].bounds.y>=sortedLabels[i-1].bounds.bottom-.5,
   'the regional callouts must never overlap, even when cohort sizes differ');
 }
 assert.equal(quality.forbiddenGuideCount,0,
  'do not reintroduce previous duplicate axes or long right-side leaders');
 assert.equal(quality.grid,0,'no full-width y gridlines should compete with the local measures');
 if(quality.dayBins>1)assert.ok(
  Math.abs(quality.plotRight-quality.postingsPlotRight)<=.1&&quality.plotRight>=503,
  'regional trend and New Postings share an identical RIGHT edge, with no blank side gutter');
 const visibleCounts=['HK','SG','CN'].map(k=>quality.regionFinals[k.toLowerCase()]);
 const heights=quality.heights,levels=quality.heightRefs;
 const nonempty=visibleCounts.filter(Boolean).length;
 assert.equal(heights.length,nonempty,'one separate height indication for each nonempty region');
 assert.equal(levels.length,nonempty+1,
  'only short dotted marks at 0 and nonempty cumulative boundaries');
 const y0=quality.regionTicks.find(t=>t.value===0).y-3;
 const firstPositive=quality.regionTicks.find(t=>t.value>0);
 const unitHeight=(y0-(firstPositive.y-3))/firstPositive.value;
 let cumulative=0;
 for(const [i,k] of ['HK','SG','CN'].entries()){
  const value=visibleCounts[i],before=cumulative;
  cumulative+=value;
  if(!value)continue;
  const span=heights.find(v=>v.region===k);
  assert.ok(span,'region has an independent true-height bracket');
  assert.equal(span.count,value);
  assert.equal(span.lower,before);assert.equal(span.upper,cumulative);
  assert.equal(span.x1,span.x2,'all measurement strokes are truly vertical');
  assert.equal(span.x1,[78,143,222][i],'the three strokes follow the nonuniform editorial stagger');
  assert.ok(Math.abs(span.y1-(y0-before*unitHeight))<.16);
  assert.ok(Math.abs(span.y2-(y0-cumulative*unitHeight))<.16);
  assert.ok(Math.abs((span.y1-span.y2)-value*unitHeight)<.16,
   'each displayed vertical gap is exactly proportional to the regional role count');
  assert.notEqual(span.ink,quality.series[k.toLowerCase()],
   'region-colored contours must remain more chromatic than measurement stems');
  const group=quality.capGroups.find(v=>v.region===k);
  assert.ok(group,'each region interval has its measurement group');
  assert.ok(group.caps.length===0||group.caps.length===2,'terminal rules are paired or omitted');
  for(const cap of group.caps){
   assert.equal(cap.ink,span.ink,'the end cap and its stem are one material');
   assert.ok(Math.abs(cap.y-(cap.edge==='upper'?span.y2:span.y1))<.011,
    'terminal rule touches the exact measured boundary');
   assert.ok(Math.abs((cap.x1+cap.x2)/2-span.x1)<.011,'terminal rule is optically centered');
  }
 }
 assert.deepEqual(levels.map(x=>x.level).sort((a,b)=>a-b),
  [...new Set([0,visibleCounts[0],visibleCounts[0]+visibleCounts[1],
    visibleCounts[0]+visibleCounts[1]+visibleCounts[2]])].sort((a,b)=>a-b));
 for(const level of levels){
  assert.ok(level.x2-level.x1<=156.1&&level.x2<=237,
   'no dotted guide may cross the chart: references belong ONLY to the left blank area');
  assert.ok(Math.abs(level.y-(y0-level.level*unitHeight))<.16,
   'each short dotted level is tied to an exact cumulative boundary');
 }
 assert.equal(quality.obsoleteArrowheads,0,'directional arrowheads are entirely removed');
 assert.equal(quality.capGroups.reduce((n,g)=>n+g.caps.length,0)%2,0,
  'measurement terminals always come in symmetric pairs');
 assert.equal(quality.regionDateTickCount,quality.regionDateMarks.length,
  'each regional calendar label receives one restrained positional tick');
 assert.equal(quality.postingDateTickCount,quality.postingDateMarks.length,
  'daily columns and regional chart share the same date-axis grammar');
 assert.ok(quality.curveKnots>=1&&quality.curveKnots<=quality.dayBins,
  'adaptive spline cannot manufacture new dates or expand beyond daily observations');
 assert.ok(quality.curveError<=.581,
  'interpolated stacked boundaries must never move a real daily value by more than 0.58 SVG pixels');
 assert.deepEqual(quality.bandFills,theme==='light'
  ?{sg:'rgb(193, 211, 173)',hk:'rgb(221, 198, 166)',cn:'rgb(225, 179, 176)'}
  :{sg:'rgb(69, 89, 65)',hk:'rgb(104, 83, 61)',cn:'rgb(113, 67, 68)'},
  'stacked areas use the three exact approved mineral fills');
 assert.ok(quality.svgBounds.h>quality.svgBounds.w*.62,
  'main plot reclaims the former top-legend height');
 if(quality.viewportWidth<=720){
  assert.ok(quality.legendItems.every(item=>item.countFont>=14),
   'direct labels retain legible real CSS-pixel sizes on narrow phones');
 }
 assert.match(quality.chartAria,/y-axis is the sum of (?:all|these) three regions/);
 assert.equal(quality.notePresent,false,'verbose first-observed footnote and its whitespace are removed');
 assert.ok(quality.bandCount>=3,'each active region has at least one tinted band');
 assert.ok(Object.values(quality.bandFills).every(Boolean),
  'SG/HK/CN ribbons must each have a visible regional color shade');
 const first=quality.stackFirst;
 for(const k of ['sg','hk','cn'])if(first[k]){
  assert.ok(first[k].upper>first[k].lower,'regional bands must have positive thickness');
  assert.equal(first[k].upper-first[k].lower,first[k].cumulative,'band thickness is each region’s cumulative current-active cohort');
  assert.ok(first[k].cumulative>=first[k].count,'daily new observations cannot exceed their cumulative total');
 }
 if(first.hk)assert.equal(first.hk.lower,0,'HK always anchors the zero baseline');
 // In production the three regions may first appear on different dates.
 // Compare adjacent cumulative boundaries only at the SAME UTC day.
 if(first.sg&&first.hk&&first.cn&&
    first.hk.bin===first.sg.bin&&first.sg.bin===first.cn.bin){
  assert.equal(first.sg.lower,first.hk.upper,'SG stacks above HK on the same date');
  assert.equal(first.cn.lower,first.sg.upper,'CN stacks on SG on the same date');
  assert.equal(first.cn.upper,first.sg.cumulative+first.hk.cumulative+first.cn.cumulative,
   'uppermost cumulative boundary equals all three regions on the same date');
 }
 const allObservations=chartData.filter(r=>['SG','HK','CN'].includes(r.location))
  .map(r=>new Date(r.firstSeen||r.pushTime).getTime()).filter(Number.isFinite);
 const observations=allObservations.some(t=>t>=Date.UTC(2026,0,1))
  ?allObservations.filter(t=>t>=Date.UTC(2026,0,1)):allObservations;
 const sampleSpan=Math.max(...observations)-Math.min(...observations);
 const expectedBins=Math.max(1,Math.floor(sampleSpan/86400000)+1);
 assert.ok(quality.bins>0&&quality.bins<=expectedBins*3,
  'each genuine first-seen observation remains in one daily bucket');
 assert.equal(quality.dayBins,Math.max(1,
  Math.floor(Math.max(...observations)/86400000)-
  Math.floor(Math.min(...observations)/86400000)+1),
  'one bin per UTC calendar date, independent of source timestamps within each day');
 assert.equal(quality.pointTotal,
  chartData.filter(r=>['SG','HK','CN'].includes(r.location)&&
    new Date(r.firstSeen).getTime()>=
      (chartData.some(j=>['SG','HK','CN'].includes(j.location)&&new Date(j.firstSeen).getUTCFullYear()>=2026)
        ?Date.UTC(2026,0,1):-Infinity)).length,
  '2026 timeline includes every available SG/HK/CN record, without OTHER or pre-2026 anomalies');
 assert.equal(quality.finalTotal,quality.pointTotal,
  'rightmost cumulative stacked total equals the count of all included active roles');
 assert.equal(quality.regionFinals.hk+quality.regionFinals.sg+quality.regionFinals.cn,quality.finalTotal,
  'the three final regional layers must sum to the y-axis endpoint');
 assert.ok(quality.axisMax>=quality.finalTotal,
  'the true y-axis maximum must contain the full three-region cumulative total');
 if(quality.finalTotal>=10)assert.ok(quality.axisMax/quality.finalTotal<=1.2,
  'the full-width regional chart must not waste excessive vertical headroom');
 assert.ok(quality.regionTicks.length>=2&&quality.regionTicks.length<=6,
  'only y-axis NUMBER labels remain; no full-width horizontal gridlines');
 // A valid historical cohort need not have new observations within the
 // independent rolling 30-day New Postings window.
 assert.ok(quality.paths.every(p=>p?.startsWith('M')),
  'regional lines begin at actual observations, not baseline zeros');
 assert.equal(quality.matchingContours,true,
  'upper band boundaries and ink must use identical SVG segment paths');
 assert.ok(quality.linePaths.every(d=>d&&d.split('M').length===2),
  'one unbroken cumulative contour per region, including days without new postings');
 assert.equal(quality.captions,0,'do not add redundant chart subtitles');
 assert.ok(quality.dateTicks>=1&&quality.dateTicks<=6,
  'geographic dates use only readable calendar anchors');
 assert.ok(quality.postingDateTicks>=2&&quality.postingDateTicks<=6,
  'rolling 30-day axis uses a restrained set of week-aligned labels');
 const checkDateSpacing=(marks,name)=>{
  for(let i=1;i<marks.length;i++){
   assert.ok(marks[i].day>marks[i-1].day,
    name+' dates must advance chronologically without duplicate ticks');
   assert.ok(marks[i].bounds.x>=marks[i-1].bounds.right-1.2,
    name+' date texts must not collide: '+JSON.stringify(marks));
  }
 };
 checkDateSpacing(quality.regionDateMarks,'Regional history');
 checkDateSpacing(quality.postingDateMarks,'New Postings');
 assert.equal(quality.ranges.length,0,'unrequested range captions are absent from both charts');
 assert.ok(quality.postingDateMarks.every(m=>m.weekday===1),'every New Postings tick is Monday');
 for(let i=1;i<quality.postingDateMarks.length;i++)assert.equal(quality.postingDateMarks[i].day-quality.postingDateMarks[i-1].day,7,'no skipped or invented week');
 if(['quarter','month'].includes(quality.calendarMode)){
  const months=quality.regionDateMarks.map(m=>{const d=new Date(m.date+'T00:00:00Z');assert.equal(d.getUTCDate(),1);return d.getUTCFullYear()*12+d.getUTCMonth();});
  for(let i=1;i<months.length;i++)assert.equal(months[i]-months[i-1],quality.calendarStep,'month cadence is fixed');
 }
 for(let i=1;i<quality.legendItems.length;i++){
  const previous=quality.legendItems[i-1],current=quality.legendItems[i];
  assert.ok(current.bounds.x-previous.bounds.x>=quality.svgBounds.w*65/520,'labels visibly progress rightward with their arrows');
  assert.ok(current.bounds.y<previous.bounds.y,'regional readings ascend along the actual stack');
 }
 const checkScale=(ticks,name)=>{
  assert.ok(ticks.length>=2,name+' needs at least two integer ticks');
  assert.equal(ticks[0].value,0,name+' starts at zero');
  const step=ticks[1].value;
  assert.ok(Number.isInteger(step)&&step>0,name+' has positive integer steps');
  for(let i=0;i<ticks.length;i++){
   assert.equal(ticks[i].value,i*step,name+' must have regular numeric labels');
   if(i>=2)assert.ok(Math.abs((ticks[i].y-ticks[i-1].y)-
    (ticks[1].y-ticks[0].y))<.12,name+' labels must be equally spaced');
  }
  const magnitude=10**Math.floor(Math.log10(step));
  assert.ok([1,2,5].some(m=>Math.abs(m-step/magnitude)<1e-8),
   name+' uses a conventional 1/2/5 integer magnitude');
 };
 checkScale(quality.regionTicks,'Geographic Y axis');
 checkScale(quality.postingTicks,'New postings Y axis');
 return quality;
}

async function inspectMosaic(page,nonzero){
 const details=await page.evaluate(()=>{
  const board=document.querySelector('#marketWidthMap').getBoundingClientRect();
  const nodes=[...document.querySelectorAll('.mw-tile')];
  // CSS Color 4 oklab mixes may serialize as color(srgb ...).
  // Convert via real canvas pixels before checking contrast or lightness.
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const pixelColor=color=>{
   ctx.clearRect(0,0,1,1);
   ctx.fillStyle='#000';ctx.fillStyle=color;ctx.fillRect(0,0,1,1);
   const rgba=ctx.getImageData(0,0,1,1).data;
   return 'rgb('+rgba[0]+', '+rgba[1]+', '+rgba[2]+')';
  };
  const rects=nodes.map(node=>{
   const r=node.getBoundingClientRect(),face=node.querySelector('.mw-tile-face');
   const faceRect=face.getBoundingClientRect();
   const inset={left:faceRect.left-r.left,right:r.right-faceRect.right,top:faceRect.top-r.top,bottom:r.bottom-faceRect.bottom};

   const name=node.querySelector('.mw-tile-name'),number=node.querySelector('.mw-tile-count');
   const group=node.querySelector('.mw-tile-lockup');
   const fr=face.getBoundingClientRect(),nr=name.getBoundingClientRect(),gr=group.getBoundingClientRect();
   const cr=number?.getBoundingClientRect(),style=getComputedStyle(name);
   const approxCenter=(box)=>Math.abs((box.left+box.right)/2-(fr.left+fr.right)/2);
   const zero=node.dataset.zero==='true';
   return {
    i:Number(node.dataset.firm),zero,name:name?.textContent,count:number?.textContent||null,
    aria:node.getAttribute('aria-label'),title:node.title,
    area:r.width*r.height,x:r.x,y:r.y,w:r.width,h:r.height,
    nameWidth:name?.clientWidth,contentWidth:name?.scrollWidth,
    nameHeight:name?.clientHeight,contentHeight:name?.scrollHeight,
    faceBg:pixelColor(getComputedStyle(face).backgroundColor),
    faceInk:pixelColor(getComputedStyle(face).color),
    active:node.classList.contains('mw-is-active'),
    tone:node.style.getPropertyValue('--mw-tone')||null,
    countInk:number?getComputedStyle(number).color:null,
    faceShadow:getComputedStyle(face).boxShadow,
    inset,cornerRadius:getComputedStyle(face).borderTopLeftRadius,

    layout:node.dataset.layout,labelForm:node.dataset.labelForm,
    nameFont:parseFloat(style.fontSize),
    countFont:number?parseFloat(getComputedStyle(number).fontSize):null,
    centeredX:approxCenter(gr),centeredY:Math.abs((gr.top+gr.bottom)/2-(fr.top+fr.bottom)/2),
    stacked:cr?nr.bottom<=cr.top+1:true,lockupHeight:gr.height,faceHeight:fr.height
   };
  });
  return {board:{w:board.width,h:board.height,x:board.x,y:board.y},rects};
 });
 assert.equal(details.rects.length,18,'one integrated cloud must always include all 18 firms');
 const badGap=details.rects.filter(t=>Object.values(t.inset).some(v=>Math.abs(v-.5)>.1));
 assert.equal(badGap.length,0,'each tile must use a .5px inset for a 1px shared hairline: '+JSON.stringify(badGap));
 assert.ok(details.rects.every(t=>t.cornerRadius==='1px'),'tight mosaic corners must be barely rounded');

 assert.equal(new Set(details.rects.map(t=>t.i)).size,18,'unique institutional tiles');
 assert.equal(details.rects.filter(t=>!t.zero).length,nonzero,'correct hiring breadth');
 assert.ok(details.rects.every(t=>t.name.length>0),'every rectangle names its firm');
 assert.ok(details.rects.every(t=>t.zero?t.count===null:t.count!==null),
  'zero tiles have no number; positive tiles show an exact count');
 assert.ok(details.rects.every(t=>t.active===!t.zero),
  'active surface and zero surface must remain distinct');
 assert.ok(details.rects.every(t=>t.zero?t.tone===null:t.tone===
  (((Number(t.count)-1)/(Number(t.count)+2))*100).toFixed(4)+'%'),
  'each exact count maps to one fixed numeric tone');
 for(const a of details.rects)for(const b of details.rects){
  if(!a.zero&&!b.zero&&a.count===b.count)
   assert.equal(a.faceBg,b.faceBg,'equal counts must always have identical paint');
 }
 const live=details.rects.filter(t=>!t.zero).sort((a,b)=>Number(a.count)-Number(b.count));
 for(let i=1;i<live.length;i++)if(Number(live[i].count)>Number(live[i-1].count)){
  const a=rgb(live[i-1].faceBg),b=rgb(live[i].faceBg);
  assert.ok(a.some((v,k)=>Math.abs(v-b[k])>=1),
   'higher count must visibly change the shade');
  assert.ok(lum(live[i-1].faceBg)>lum(live[i].faceBg),
   'higher count must be darker, in either theme');
 }
 if(nonzero>0&&18-nonzero>=4){
  const edge=t=>Math.abs(t.x-details.board.x)<1.25||
   Math.abs(t.y-details.board.y)<1.25||
   Math.abs(t.x+t.w-details.board.x-details.board.w)<1.25||
   Math.abs(t.y+t.h-details.board.y-details.board.h)<1.25;
  assert.ok(details.rects.filter(t=>!t.zero).some(edge),
   'mixed treemap must permit active firms on the outer edge again');
 }

 assert.ok(details.rects.filter(t=>t.zero).every(t=>t.aria.includes('No new postings')),
  'zero labels are contextual rather than a numeric 0');
 assert.ok(details.rects.every(t=>t.w>0&&t.h>0&&t.x>=details.board.x-1&&t.y>=details.board.y-1));
 const totalArea=details.rects.reduce((sum,t)=>sum+t.area,0);
 const boardArea=details.board.w*details.board.h;
 assert.ok(Math.abs(totalArea-boardArea)<=boardArea*.001,
  'all 18 tiles fully cover the mosaic: '+JSON.stringify({boardArea,totalArea,board:details.board,rects:details.rects.map(t=>({i:t.i,count:t.count,area:t.area,x:t.x,y:t.y,w:t.w,h:t.h}))}));
 const over=details.rects.filter(t=>t.contentWidth>t.nameWidth+1||t.contentHeight>t.nameHeight+1);
 assert.equal(over.length,0,'firm tokens must fit without being clipped: '+JSON.stringify(over));
 const broken=details.rects.filter(t=>!t.stacked||t.centeredX>3||t.centeredY>3);
 assert.equal(broken.length,0,
  'the unified name-above-count lockup must stay optically centered at every geometry: '+JSON.stringify(broken));
 const spacious=details.rects.filter(t=>t.layout==='feature'&&!t.zero&&t.w>=300&&t.h>=150);
 assert.ok(spacious.every(t=>t.nameFont>=18&&t.countFont>=25),
  'a spacious rectangle must not show a 9px label or number: '+JSON.stringify(spacious));
 return details;
}
const rgb=raw=>(raw.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
const brightness=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4};
const lum=raw=>{const a=rgb(raw).map(brightness);return a[0]*.2126+a[1]*.7152+a[2]*.0722};
const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
try{
 for(const width of [1440,960,390]){
  for(const theme of ['light','dark']){
   const page=await make(width,theme);
   await page.evaluate(([rows,dates])=>window.MarketWidth.render(rows,dates),[regular,days]);
   await renderLeft(page,regular,theme);
   assert.equal(await page.locator('#marketWidthTitle').textContent(),'Market Breadth: 18 institutions we watch closely');
   assert.equal(await summary(page),'14 new postings across 4/18 institutions');
   assert.equal(await page.locator('.mw-encoding').textContent(),'Size and shade reflect new postings of the day, excluding reposts');
   const trend=await page.evaluate(()=>{
    const chart=document.querySelector('#marketWidthStrip .mw-trend-svg');
    const line=chart?.querySelector('.mw-trend-line');
    const point=chart?.querySelector('.mw-trend-indicator');
    const bounds=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom};};
    return {line:line?.getAttribute('d'),stroke:getComputedStyle(line).stroke,
     strokeWidth:parseFloat(getComputedStyle(line).strokeWidth),
     pointInk:getComputedStyle(point.querySelector('.mw-trend-point')).fill,
     markerDay:Number(point?.dataset.day),markerTransform:point?.getAttribute('transform'),
     hitTargets:document.querySelectorAll('#marketWidthStrip .mw-strip-day').length,
     chart:bounds(chart),summary:bounds(document.querySelector('.mw-summary')),
     date:bounds(document.querySelector('.mw-date-nav')),
     footer:bounds(document.querySelector('.mw-subline'))};
   });
   assert.ok(trend.line?.startsWith('M ')&&((trend.line.match(/ C /g)||[]).length===29),
    '30 daily readings form a smooth cubic trend, not a histogram');
   assert.equal(trend.stroke,theme==='light'?'rgb(51, 78, 172)':'rgb(186, 214, 235)',
    'Market Breadth 30-day line uses the HISTORICAL Porcelain blue DATA / dark chart pigment in '+theme+' theme');
   assert.equal(trend.strokeWidth,2.2,'Market Breadth line remains crisp and visually distinct');
   assert.equal(trend.pointInk,trend.stroke,'selected dot matches the SAME celadon blue as the line');
   assert.equal(trend.hitTargets,30,'line chart preserves full 30-day manual inspection');
   assert.equal(trend.markerDay,27,'point starts on the displayed latest complete day');
   assert.match(trend.markerTransform,/translate\([\d.]+ [\d.]+\)/);
   assert.ok(trend.date.x>=trend.summary.x+trend.summary.w-1,
    'date controls stay right aligned without overlapping the summary: '+JSON.stringify(trend));
   assert.ok(trend.date.y<trend.summary.b&&trend.summary.y<trend.date.b,
    'summary and dates occupy the SAME row at '+width+'px: '+JSON.stringify(trend));
   const initial=await inspectMosaic(page,4);
   assert.ok(await page.locator('.mw-tile:not(.mw-is-zero)').count()===4);
   const zeros=initial.rects.filter(t=>t.zero),positives=initial.rects.filter(t=>!t.zero);
   const zeroBg=zeros[0].faceBg;
   assert.equal(new Set(zeros.map(t=>t.faceBg)).size,1,
    'zeros must always share one neutral background');
   assert.equal(new Set(positives.map(t=>t.faceBg)).size,4,
    'the controlled sample of four distinct counts must have four unique tones');
   const ordered=[...positives].sort((a,b)=>Number(a.count)-Number(b.count));
   if(theme==='light')assert.ok(lum(zeroBg)>lum(ordered[0].faceBg),
    'no-posting porcelain should recede as a lighter tint, never a dark gray interruption');
   else assert.ok(lum(zeroBg)<lum(ordered[0].faceBg),
    'dark-mode zero tiles must stay a subtle shade behind the active indigo ramp');
   assert.deepEqual(ordered.map(t=>Number(t.count)),[2,3,4,5]);
   assert.ok(positives.every(t=>Math.hypot(...rgb(t.faceBg).map((v,i)=>v-rgb(zeroBg)[i]))>25),
    'positive indigo tiles remain distinct from matching porcelain-blue zero tiles');
   if(theme==='light')assert.ok(positives.every(t=>{
    const [r,g,b]=rgb(t.faceBg);return b>r&&b>g&&r>=175;
   }),'approved Soft Indigo C remains bright with blue-violet tint, not mint or turquoise');
   const accent=theme==='light'?'rgb(16, 43, 68)':'rgb(245, 240, 232)';
   assert.ok(positives.every(t=>t.countInk===accent),
    'precise counts use high-contrast site-compatible text');
   assert.ok(positives.every(t=>t.faceShadow==='none'),
    'avoid decorative keylines and artificial elevation');
   if(theme==='light')assert.ok(positives.every(t=>lum(t.faceBg)>.28),
    'even the highest rendered tiles must remain appropriately luminous');
   for(const tile of initial.rects){
    assert.ok(contrast(tile.faceBg,tile.faceInk)>=4.5,
     'small-name contrast must be AA: '+JSON.stringify({theme,i:tile.i,bg:tile.faceBg,ink:tile.faceInk,ratio:contrast(tile.faceBg,tile.faceInk)}));
   }
   for(const i of [1,12,11])assert.ok(initial.rects[i]===undefined||initial.rects.some(t=>t.i===i&&t.aria.includes(firms[i])));
   const bounds=await page.evaluate(()=>{
    const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom}};
    const top30=document.querySelector('.top50-tabs');
    return {left:rect('.analytics-left'),right:rect('.ac-col-market'),
     dist:rect('.ac-col-density'),post:rect('.ac-col-postings'),top:rect('.ac-col-top50'),
     board:rect('#marketWidthMap'),footer:rect('.mw-footer'),
     heading:rect('#marketWidthTitle'),
     titlePhrase:rect('.mw-title-phrase'),
     titlePhraseLines:(()=>{
       const range=document.createRange();
       range.selectNodeContents(document.querySelector('.mw-title-phrase'));
       return range.getClientRects().length;
     })(),
     summary:rect('.mw-summary'),date:rect('.mw-date-nav'),
     tabs:rect('#marketWidthRegions'),encoding:rect('.mw-encoding'),
     pageWidth:document.documentElement.scrollWidth,
     regionBg:getComputedStyle(document.querySelector('.mw-tabs')).backgroundColor,
     topBg:top30&&getComputedStyle(top30).backgroundColor,
     regionW:rect('.mw-tabs').w,topW:top30?.getBoundingClientRect().width||0};
   });
   assert.ok(bounds.footer.y>=bounds.board.b-2,
    'Market Width information must follow its treemap board');
   assert.ok(['summary','date','encoding'].every(k=>bounds[k].y>=bounds.board.b-2),
    'summary, date and explanation must appear below the chart');
   assert.ok(bounds.tabs.b<=bounds.board.y+2,
    'region controls must sit alongside the heading, above the map');
   assert.ok(bounds.board.h>=280,'footer must not compress the map');
   assert.ok(bounds.post.y>=bounds.dist.b-2);
   assert.ok(bounds.dist.h>bounds.post.h*1.3,
    'allocate materially more vertical space to the true stacked regional chart');
   assert.ok(bounds.top.y>=Math.max(bounds.left.b,bounds.right.b)-2);
   assert.ok(bounds.pageWidth<=width+2,'no horizontal page overflow: '+JSON.stringify({width,theme,bounds}));
   if(width>1100)assert.ok(bounds.tabs.x>=bounds.heading.x+bounds.heading.w-2,
    'wide-screen tabs must sit to the right of the heading');
   else assert.ok(bounds.tabs.y>=bounds.heading.b-2,
    'smaller screens keep full-size headings above the right-aligned tabs');
   assert.equal(bounds.titlePhraseLines,1,
    'the complete 18 institutions we watch closely phrase stays on one line');
   assert.ok(bounds.titlePhrase.x+bounds.titlePhrase.w<=bounds.right.x+bounds.right.w+1,
    'the unbroken Market Width subtitle must stay within its panel');
   if(width>1100)assert.ok(Math.abs((bounds.tabs.y+bounds.tabs.h/2)-(bounds.heading.y+bounds.heading.h/2))<18,
    'wide-screen tabs and heading should have compatible vertical alignment');
   if(bounds.topBg)assert.equal(bounds.regionBg,bounds.topBg,'Top30 and Market Width region controls share chrome');
   if(width>720){
    assert.ok(bounds.right.x>=bounds.left.x+bounds.left.w-2);
    assert.ok(Math.abs(bounds.right.h-bounds.left.h)<3,'charts align in desktop grid');
   }else{
    assert.ok(bounds.right.y>=bounds.left.b-2);
    assert.ok(bounds.regionW<bounds.right.w/2,
     'mobile title and regional controls share a compact row: '+JSON.stringify(bounds));
   }
   const before=await page.evaluate(()=>({
    page:document.documentElement.scrollHeight,
    panel:document.querySelector('.ac-col-market').getBoundingClientRect().height,
    map:document.querySelector('.mw-map-board').getBoundingClientRect().height
   }));
   await page.locator('.mw-tile[data-firm="1"]').hover();
   assert.equal(await page.locator('.mw-detail').isVisible(),true);
   await page.locator('.mw-tile[data-firm="12"]').hover();
   assert.match(await page.locator('.mw-detail').textContent(),/Morgan Stanley.*3 new postings/);
   const after=await page.evaluate(()=>({
    page:document.documentElement.scrollHeight,
    panel:document.querySelector('.ac-col-market').getBoundingClientRect().height,
    map:document.querySelector('.mw-map-board').getBoundingClientRect().height
   }));
   assert.deepEqual(before,after,'moving over tiles must never shift document geometry');
   await page.locator('[data-market-region="CN"]').click();
   assert.equal(await summary(page),'7 new postings across 2/18 institutions');
   await inspectMosaic(page,2);
   await page.locator('[data-market-region="HK"]').click();
   assert.equal(await summary(page),'3 new postings across 1/18 institutions');
   await inspectMosaic(page,1);
   await page.locator('[data-market-region="SG"]').click();
   assert.equal(await summary(page),'4 new postings across 1/18 institutions');
   await page.locator('[data-market-region="all"]').click();
   assert.equal(await summary(page),'14 new postings across 4/18 institutions');
   // The fixture's last update is 09:00 on day 28, so day 27 is the latest
   // complete day and the default; day 28 is labelled as still collecting.
   assert.equal(await page.locator('#marketWidthDate').getAttribute('aria-label'),days[27].key);
   assert.equal(await page.locator('#marketWidthDate').getAttribute('data-partial'),'false');
   await page.locator('#marketWidthNext').click();
   assert.equal(await page.locator('#marketWidthDate').getAttribute('data-partial'),'true');
   assert.doesNotMatch(await page.locator('#marketWidthDate').evaluate(node=>getComputedStyle(node,'::after').content),/so far/i,
    'the selected date never appends a partial-day footnote');
   assert.equal(await page.locator('.mw-trend-indicator').getAttribute('data-day'),'28',
    'selected marker follows previous/next day navigation');
   assert.equal(await summary(page),'14 new postings across 4/18 institutions');
   await page.locator('#marketWidthNext').click();
   assert.equal(await summary(page),'0 new postings across 0/18 institutions');
   const allZero=await inspectMosaic(page,0);
   assert.ok(allZero.rects.every(t=>t.count===null),'all-zero day shows no numeral inside any tile');
   if(width===1440&&theme==='light'){
    await page.evaluate(()=>document.activeElement?.blur?.());
    await page.locator('.ac-col-market').screenshot({path:new URL('artifacts/market-width/all-zero-1440-light.png',source).pathname,animations:'disabled'});
   }
   await page.locator('#marketWidthPrev').click();
   assert.equal(await summary(page),'14 new postings across 4/18 institutions');
   await page.evaluate(()=>document.activeElement?.blur?.());
   if(width!==960){
    await page.locator('.ac-col-market').screenshot({path:new URL('artifacts/market-width/mosaic-'+width+'-'+theme+'.png',source).pathname,animations:'disabled'});
    await page.locator('.analytics-card').screenshot({path:new URL('artifacts/market-width/analytics-'+width+'-'+theme+'.png',source).pathname,animations:'disabled'});
   }
   console.log('18-company integrated mosaic PASS '+width+'px '+theme);
   await page.close();
  }
 }
 // Protect narrower 320/360px phones against a partial Market Width
 // title wrap, even when the filter tabs share the title row.
 for(const width of [360,320]){
  const phone=await make(width,'light');
  const title=await phone.evaluate(()=>{
   const phrase=document.querySelector('.mw-title-phrase');
   const range=document.createRange();range.selectNodeContents(phrase);
   const p=phrase.getBoundingClientRect(),panel=document.querySelector('.ac-col-market').getBoundingClientRect();
   const tabs=document.querySelector('#marketWidthRegions').getBoundingClientRect();
   const intersection=Math.max(0,Math.min(p.right,tabs.right)-Math.max(p.left,tabs.left))*
    Math.max(0,Math.min(p.bottom,tabs.bottom)-Math.max(p.top,tabs.top));
   return {lines:range.getClientRects().length,right:p.right,panelRight:panel.right,
    text:phrase.textContent,scroll:document.documentElement.scrollWidth,intersection};
  });
  assert.equal(title.text,'18 institutions we watch closely');
  assert.equal(title.lines,1,'complete institution count and phrase occupy one line at '+width+'px');
  assert.ok(title.right<=title.panelRight+1&&title.scroll<=width+2,
   'the unbroken Market Width title fits a '+width+'px viewport: '+JSON.stringify(title));
  assert.ok(title.intersection<1,
   'the title phrase must never physically overlap the region tabs: '+JSON.stringify(title));
  await phone.locator('.mw-topline').screenshot({
   path:new URL('artifacts/market-width/header-'+width+'-light.png',source).pathname,
   animations:'disabled'
  });
  await phone.close();
 }
 // Visual acceptance against ACTUAL published jobs, not just fixture bars.
 // This also protects the y-axis from silently regressing to one-day peaks.
 const indexDoc=JSON.parse(readFileSync(new URL('jobs-index.json',source),'utf8'));
 const indexRows=Array.isArray(indexDoc)?indexDoc:(indexDoc.jobs||[]);
 const liveRows=indexRows.filter(j=>j?.jobStatus!=='expired');
 const valid2026=liveRows.filter(j=>
  ['HK','SG','CN'].includes(j.location)&&Number.isFinite(Date.parse(j.firstSeen||j.pushTime))&&
  Date.parse(j.firstSeen||j.pushTime)>=Date.UTC(2026,0,1));
 assert.ok(valid2026.length>1000,'production source must contain a substantive 2026 active cohort');
 for(const [width,theme] of [[1440,'light'],[1440,'dark'],[390,'light']]){
  const productionPage=await make(width,theme);
  const visual=await renderLeft(productionPage,liveRows,theme);
  assert.equal(visual.finalTotal,valid2026.length,
   'real production y-axis must end at the sum of all first-observed active HK/SG/CN roles');
  assert.equal(visual.regionFinals.hk+visual.regionFinals.sg+visual.regionFinals.cn,
   visual.finalTotal,'real stacked areas must sum at the right edge');
  assert.equal(visual.notePresent,false,'production chart contains no redundant note');
  assert.ok(visual.dayBins>120,'real chart plots its full 2026 calendar domain');
  await productionPage.locator('.analytics-left').screenshot({
   path:new URL('artifacts/market-width/production-cumulative-'+width+'-'+theme+'.png',source).pathname,
   animations:'disabled'
  });
  await productionPage.close();
 }
 // A gap in first-seen observations MUST NOT break already accumulated
 // active-role cohorts. The area remains stacked, with flat portions.
 const gapPage=await make(960,'light');
 const gapped=[
  {location:'CN',firstSeen:'2026-10-14T09:00:00Z',company:'HSBC',jobStatus:'active'},
  {location:'CN',firstSeen:'2026-11-11T09:00:00Z',company:'HSBC',jobStatus:'active'},
  {location:'HK',firstSeen:'2026-10-22T09:00:00Z',company:'Citi',jobStatus:'active'},
  {location:'SG',firstSeen:'2026-11-08T09:00:00Z',company:'DBS Bank',jobStatus:'active'},
  {location:'OTHER',firstSeen:'2026-11-01T09:00:00Z',company:'Excluded comparison',jobStatus:'active'}
 ];
 const gapQuality=await renderLeft(gapPage,gapped,'light');
 assert.equal(gapQuality.pointTotal,4,'keep all SG/HK/CN records and exclude OTHER');
 assert.equal(gapQuality.otherSeries,0,'OTHER not plotted even when it exists in input');
 assert.ok(gapQuality.paths.every(d=>(d.match(/M/g)||[]).length===1),
  'all three cumulative contours stay continuous even through dates with zero new observations');
 assert.equal(gapQuality.bandCount,3,'one additive area per region, with no disconnected fragments');
 assert.equal(gapQuality.finalTotal,4,'all four recorded roles remain in the final cumulative stack');
 assert.deepEqual(gapQuality.regionFinals,{hk:1,sg:1,cn:2});
 await gapPage.locator('.analytics-card').screenshot({
  path:new URL('artifacts/market-width/region-gap-960-light.png',source).pathname,
  animations:'disabled'
 });
 await gapPage.close();
 // When all three cohorts grow linearly, the shared monotone
 // presentation should collapse ~90 daily nodes into only two spline knots.
 // All 270 true day/region readings must remain available in hover data.
 const smoothPage=await make(960,'light');
 const smoothRows=[];
 for(let i=0;i<90;i++)for(const region of ['HK','SG','CN'])
  smoothRows.push({location:region,firstSeen:new Date(Date.UTC(2026,3,1+i,9)).toISOString(),
   company:'HSBC',jobStatus:'active'});
 const smoothQuality=await renderLeft(smoothPage,smoothRows,'light');
 assert.equal(smoothQuality.dayBins,90,'daily observations remain distinct after visual simplification');
 assert.equal(smoothQuality.pointTotal,270,'no true daily observations were discarded');
 assert.equal(smoothQuality.finalTotal,270,'the true cumulative total is unchanged');
 assert.equal(smoothQuality.curveKnots,2,
  'linear data needs only the two endpoints, not dozens of tiny daily kinks');
 assert.ok(smoothQuality.curveError<.01,'linear fixture spline exactly matches all daily totals');
 await smoothPage.close();
 // Actual Jan-Nov history still plots each UTC day separately: no weekly
 // summing, no collapsed zero weeks, and exact one-day hover intervals.
 const dailyPage=await make(960,'light');
 const dailyRows=[
  {location:'HK',firstSeen:'2026-01-22T09:00:00Z',company:'HSBC',jobStatus:'active'},
  {location:'SG',firstSeen:'2026-01-22T09:00:00Z',company:'DBS Bank',jobStatus:'active'},
  {location:'CN',firstSeen:'2026-01-22T09:00:00Z',company:'Citi',jobStatus:'active'},
  {location:'HK',firstSeen:'2026-01-23T09:00:00Z',company:'HSBC',jobStatus:'active'},
  {location:'SG',firstSeen:'2026-11-12T09:00:00Z',company:'DBS Bank',jobStatus:'active'},
  {location:'CN',firstSeen:'2026-11-12T09:00:00Z',company:'Citi',jobStatus:'active'}
 ];
 const dailyQuality=await renderLeft(dailyPage,dailyRows,'light');
 assert.equal(dailyQuality.pointTotal,6,'all six genuine daily observations are retained');
 assert.equal(dailyQuality.dayBins,295,'Jan 22 through Nov 12 have 295 independent calendar days');
 assert.equal(dailyQuality.finalTotal,6,'full-year final y-axis stack equals all six active roles');
 assert.deepEqual(dailyQuality.regionFinals,{hk:2,sg:2,cn:2});
 const near=dailyQuality.points.filter(p=>p.bin===0||p.bin===1);
 assert.ok(near.some(p=>p.bin===0)&&near.some(p=>p.bin===1),
  'Jan 22 and Jan 23 must have separate calendar-day buckets, not one weekly aggregate');
 assert.ok(Math.max(...near.map(p=>p.x))-Math.min(...near.map(p=>p.x))<3,
  'adjacent 2026 daily buckets should be adjacent on the real-time axis');
 assert.ok(dailyQuality.points.some(p=>p.bin>=294),
  'Nov 12 must occupy the final daily bucket across the entire 2026 history');
 await dailyPage.locator('.analytics-card').screenshot({
  path:new URL('artifacts/market-width/full-year-daily-960-light.png',source).pathname,
  animations:'disabled'
 });
 await dailyPage.close();
 // Published data rolling into Nov 13 must automatically extend the axis
 // and recompute ALL counts and shares from the new document on reload.
 const tomorrowPage=await make(390,'light');
 const tomorrowRows=[...dailyRows,{
  location:'HK',firstSeen:'2026-11-13T01:00:00Z',company:'HSBC',jobStatus:'active'
 }];
 const tomorrow=await renderLeft(tomorrowPage,tomorrowRows,'light');
 assert.equal(tomorrow.dayBins,296,'Nov 13 extends the observed date domain without any date constant');
 assert.equal(tomorrow.finalTotal,7,'the newly published job extends the rightmost stacked total');
 assert.deepEqual(tomorrow.regionFinals,{hk:3,sg:2,cn:2});
 assert.equal(tomorrow.labelTotal,7,'direct band labels immediately use the updated total');
 assert.deepEqual(tomorrow.legendItems.map(x=>x.count),[3,2,2],
  'the three inset counts follow the newest data without manual code edits');
 assert.equal(tomorrow.legendItems.reduce((total,item)=>total+Math.round(parseFloat(item.share)*10),0),1000);
 const tomorrowTicks=await tomorrowPage.locator('#dist .region-spark-date').allTextContents();
 assert.deepEqual(tomorrowTicks,['Apr','Jul','Oct'],'regular quarters do not change to arbitrary endpoints');
 assert.equal(await tomorrowPage.locator('#dist .chart-date-range').count(),0,'new publications must not reintroduce rejected range captions');
 await tomorrowPage.locator('.ac-col-density').screenshot({
  path:new URL('artifacts/market-width/daily-rollover-nov13-390-light.png',source).pathname,
  animations:'disabled'
 });
 await tomorrowPage.close();
 // A pre-2026 outlier must not change the earliest 2026 tick or hide valid records.
 const focusPage=await make(960,'light');
 const focusRows=[{location:'CN',firstSeen:'2025-03-01T12:00:00Z',company:'HSBC',jobStatus:'active'}];
 for(let i=0;i<7;i++)for(const region of ['SG','HK','CN'])
  for(let n=0;n<3;n++)focusRows.push({location:region,
   firstSeen:new Date(Date.UTC(2026,10,5+i,12)).toISOString(),
   company:'HSBC',jobStatus:'active'});
 const focused=await renderLeft(focusPage,focusRows,'light');
 assert.equal(focused.notePresent,false,'no verbose footnote is reintroduced on narrow time ranges');
 assert.equal(focused.finalTotal,63,'the 2025 outlier is excluded from the 2026 cumulative total');
 assert.equal(focused.pointTotal,63,'all 2026 records remain exact');
 assert.ok(Math.min(...focused.points.map(p=>p.x))<100&&
  Math.max(...focused.points.map(p=>p.x))>=503,
  'the rightmost actual day must reach the same full-width plot edge as New Postings');
 const dateLabels=await focusPage.locator('#dist .region-spark-date').allTextContents();
 assert.ok(dateLabels[0].includes('Nov'),'short observed history begins with its actual calendar month');
 const paths=focused.linePaths.filter(Boolean);
 assert.ok(paths.every(d=>/^M[\d.]+,[\d.]+ C/.test(d)),
  'continuous regional contours use monotone cubic segments across all daily observations');
 await focusPage.locator('.analytics-card').screenshot({
  path:new URL('artifacts/market-width/recent-focus-960-light.png',source).pathname,
  animations:'disabled'
 });
 await focusPage.close();
 // Sparse: only one firm is hiring, the other 17 are muted within the SAME map.
 const one=await make(960,'light');
 await one.evaluate(([date])=>window.MarketWidth.render([{company:'Standard Chartered',location:'CN',firstSeen:date+'T09:00:00Z',jobStatus:'active'}],[date]),[days[28].key]);
 assert.equal(await summary(one),'1 new postings across 1/18 institutions');
 const sparse=await inspectMosaic(one,1);
 assert.equal(sparse.rects.find(t=>t.i===1).count,'1');
 const featured=sparse.rects.find(t=>t.i===1);
 assert.equal(featured.tone,'0.0000%','count one uses the lightest positive shade');
 assert.ok(featured.layout==='feature'&&featured.nameFont>=18&&featured.countFont>=25,
  'single hiring firm must use feature-size centered typography: '+JSON.stringify(featured));
 await one.locator('.ac-col-market').screenshot({path:new URL('artifacts/market-width/single-active-960-light.png',source).pathname,animations:'disabled'});
 await one.close();
 // Dense: all eighteen have one job.
 const dense=await make(960,'dark');
 const jobs=firms.map(company=>({company,location:'HK',firstSeen:days[28].key+'T09:00:00Z',jobStatus:'active'}));
 await dense.evaluate(([rows,date])=>window.MarketWidth.render(rows,[date]),[jobs,days[28].key]);
 assert.equal(await summary(dense),'18 new postings across 18/18 institutions');
 const denseMap=await inspectMosaic(dense,18);
 assert.equal(new Set(denseMap.rects.map(t=>t.faceBg)).size,1,
  'eighteen identical posting counts must render exactly the same fill');
 await dense.locator('.ac-col-market').screenshot({path:new URL('artifacts/market-width/all-active-960-dark.png',source).pathname,animations:'disabled'});
 await dense.close();
 // Extreme skew: the tiny positive posting still has a legible name and count.
 const skew=await make(960,'light');
 const extreme=Array.from({length:700},()=>({company:'HSBC',location:'CN',firstSeen:days[28].key+'T09:00:00Z',jobStatus:'active'}));
 extreme.push({company:'Morgan Stanley',location:'CN',firstSeen:days[28].key+'T09:00:00Z',jobStatus:'active'});
 await skew.evaluate(([rows,date])=>window.MarketWidth.render(rows,[date]),[extreme,days[28].key]);
 assert.equal(await summary(skew),'701 new postings across 2/18 institutions');
 await inspectMosaic(skew,2);
 await skew.locator('.ac-col-market').screenshot({path:new URL('artifacts/market-width/extreme-960-light.png',source).pathname,animations:'disabled'});
 await skew.close();
}finally{await browser.close();}
