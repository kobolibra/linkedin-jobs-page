/* Real Chromium QA for one integrated 18-institution market mosaic:
   no printed zeroes, count-labeled activity tiles, trustworthy color contrast,
   no hover layout shift, desktop/mobile, light/dark, and sparse extremes. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
const source=new URL('../',import.meta.url);
const html=readFileSync(new URL('index.html',source),'utf8');
const styles=['styles.css','styles-refinement.css','cn-city-map.css','market-width.css']
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
 const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
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
  const stackPoint=k=>{
   const node=document.querySelector('#dist .region-series.'+k+' .region-spark-hit[data-bin="0"]');
   return node?{count:Number(node.dataset.count),lower:Number(node.dataset.lower),upper:Number(node.dataset.upper)}:null;
  };
  return {series,bars:bars.length,regions:lines.length,
   stackOrder:regionGroups.map(g=>[...g.classList].find(c=>c!=='region-series')),
   bandCount:stackBands.length,
   bandFills:Object.fromEntries(['sg','hk','cn'].map(k=>{
    const node=document.querySelector('#dist .region-series.'+k+' .region-stack-band');
    return [k,node?getComputedStyle(node).fill:null];
   })),
   stackFirst:Object.fromEntries(['sg','hk','cn'].map(k=>[k,stackPoint(k)])),
   otherSeries:document.querySelectorAll('#dist .region-series.other').length,
   grid:document.querySelectorAll('#dist .region-spark-grid').length,
   barColor:bars.length?getComputedStyle(bars[0]).fill:null,
   barOpacity:bars.length?getComputedStyle(bars[0]).opacity:null,
   captions:document.querySelectorAll('#dist .region-chart-caption,#spark .rhythm-caption').length,
   regionTicks:scale('#dist .region-spark-value'),
   postingTicks:scale('#spark .rhythm-scale-label'),
   bins:hits.length,
   pointTotal:hits.reduce((sum,node)=>sum+Number(node.dataset.count),0),
   markers:document.querySelectorAll('#dist .region-spark-dot').length,
   dateTicks:document.querySelectorAll('#dist .region-spark-date').length,
   filled:bars.filter(b=>Number(b.getAttribute('height'))>0).length,
   paths:lines.map(p=>p.getAttribute('d')),
   dateNote:document.querySelector('#distNote')?.textContent||'',
   points:hits.map(p=>({x:Number(p.getAttribute('cx')),n:Number(p.dataset.count)}))};
 });
 assert.deepEqual(quality.series,{
  cn:'rgb(179, 58, 54)',hk:'rgb(178, 122, 34)',sg:'rgb(110, 143, 59)'
 },'CN/HK/SG colors must remain exactly the original site colors');
 assert.equal(quality.barColor,theme==='light'?'rgb(51, 78, 172)':'rgb(112, 150, 209)',
  '30-day columns must reuse the existing light/dark blue tokens');
 assert.equal(quality.regions,3);
 assert.equal(quality.bars,30);
 assert.equal(quality.barOpacity,'1','blue bars must use undiluted original 青瓷蓝');
 assert.deepEqual(quality.stackOrder,['sg','hk','cn'],
  'regional stack order is SG below HK below CN, with no OTHER');
 assert.equal(quality.otherSeries,0,'OTHER never belongs in this chart or legend');
 assert.ok(quality.bandCount>=3,'each active region has at least one tinted band');
 assert.ok(Object.values(quality.bandFills).every(Boolean),
  'SG/HK/CN ribbons must each have a visible regional color shade');
 const first=quality.stackFirst;
 for(const k of ['sg','hk','cn'])if(first[k]){
  assert.ok(first[k].upper>first[k].lower,'regional bands must have positive thickness');
  assert.equal(first[k].upper-first[k].lower,first[k].count,'band thickness is exact own count');
 }
 if(first.sg&&first.hk&&first.cn){
  assert.equal(first.sg.lower,0,'SG starts at baseline zero');
  assert.equal(first.hk.lower,first.sg.upper,'HK stacks on SG');
  assert.equal(first.cn.lower,first.hk.upper,'CN stacks on HK');
  assert.equal(first.cn.upper,first.sg.count+first.hk.count+first.cn.count,
   'top of CN corresponds to the total across three regions');
 }
 const observations=chartData.filter(r=>['SG','HK','CN'].includes(r.location))
  .map(r=>new Date(r.firstSeen).getTime());
 const sampleSpan=Math.max(...observations)-Math.min(...observations);
 const expectedBins=Math.min(40,Math.max(2,Math.ceil(sampleSpan/86400000)+1));
 assert.ok(quality.bins>0&&quality.bins<=expectedBins*3,
  'only populated regional intervals need hover targets');
 assert.ok(quality.pointTotal>0&&
  quality.pointTotal<=chartData.filter(r=>['SG','HK','CN'].includes(r.location)).length,
  'recent-time window must not fabricate jobs or admit OTHER; older excluded records are allowed');
 assert.ok(quality.grid>=2&&quality.filled>0,'both charts plot genuine values');
 assert.ok(quality.paths.every(p=>p?.startsWith('M')),
  'regional lines begin at actual observations, not baseline zeros');
 assert.equal(quality.captions,0,'do not add redundant chart subtitles');
 assert.ok(quality.dateTicks>=2&&quality.dateTicks<=5,
  'short intervals do not duplicate date ticks');
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
 const badGap=details.rects.filter(t=>Object.values(t.inset).some(v=>Math.abs(v-1)>0.1));
 assert.equal(badGap.length,0,'each tile must use exactly 1px inset for 2px shared seams: '+JSON.stringify(badGap));
 assert.ok(details.rects.every(t=>t.cornerRadius==='1.5px'),'tight mosaic needs subtle, not card-like rounding');

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
   assert.equal(await page.locator('#marketWidthTitle').textContent(),'Market Width: 18 institutions we watch closely');
   assert.equal(await summary(page),'14 new postings across 4/18 institutions');
   assert.equal(await page.locator('.mw-encoding').textContent(),'Size and shade reflect new postings of the day, excluding reposts');
   const initial=await inspectMosaic(page,4);
   assert.ok(await page.locator('.mw-tile:not(.mw-is-zero)').count()===4);
   const zeros=initial.rects.filter(t=>t.zero),positives=initial.rects.filter(t=>!t.zero);
   const zeroBg=zeros[0].faceBg;
   assert.equal(new Set(zeros.map(t=>t.faceBg)).size,1,
    'zeros must always share one neutral background');
   assert.equal(new Set(positives.map(t=>t.faceBg)).size,4,
    'the controlled sample of four distinct counts must have four unique tones');
   const ordered=[...positives].sort((a,b)=>Number(a.count)-Number(b.count));
   assert.deepEqual(ordered.map(t=>Number(t.count)),[2,3,4,5]);
   assert.ok(positives.every(t=>Math.hypot(...rgb(t.faceBg).map((v,i)=>v-rgb(zeroBg)[i]))>25),
    'positive Indigo tiles remain distinct from muted slate-indigo zero tiles');
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
     summary:rect('.mw-summary'),date:rect('.mw-date-nav'),
     tabs:rect('#marketWidthRegions'),encoding:rect('.mw-encoding'),
     pageWidth:document.documentElement.scrollWidth,
     regionBg:getComputedStyle(document.querySelector('.mw-tabs')).backgroundColor,
     topBg:top30&&getComputedStyle(top30).backgroundColor,
     regionW:rect('.mw-tabs').w,topW:top30?.getBoundingClientRect().width||0};
   });
   assert.ok(bounds.footer.y>=bounds.board.b-2,
    'Market Width information must follow its treemap board');
   assert.ok(['summary','date','tabs','encoding'].every(k=>bounds[k].y>=bounds.board.b-2),
    'summary, date, region tabs and explanation must appear below the chart');
   assert.ok(bounds.board.h>=280,'footer must not compress the map');
   assert.ok(bounds.post.y>=bounds.dist.b-2);
   assert.ok(bounds.top.y>=Math.max(bounds.left.b,bounds.right.b)-2);
   assert.ok(bounds.pageWidth<=width+2,'no horizontal page overflow: '+JSON.stringify({width,theme,bounds}));
   if(bounds.topBg)assert.equal(bounds.regionBg,bounds.topBg,'Top30 and Market Width region controls share chrome');
   if(width>720){
    assert.ok(bounds.right.x>=bounds.left.x+bounds.left.w-2);
    assert.ok(Math.abs(bounds.right.h-bounds.left.h)<3,'charts align in desktop grid');
   }else{
    assert.ok(bounds.right.y>=bounds.left.b-2);
    assert.ok(Math.abs(bounds.regionW-bounds.topW)<12,
     'mobile region selector width should match Top30: '+JSON.stringify(bounds));
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
 // Sparse temporal data must not create a long multicolor y=0 stripe.
 // Two distant CN observations stay separate; nothing is fabricated between.
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
 assert.equal((gapQuality.paths[2].match(/M/g)||[]).length,2,
  'separated CN observations must form two disconnected contours');
 assert.ok(gapQuality.bandCount>=4,'isolated observations produce true tinted areas');
 await gapPage.locator('.analytics-card').screenshot({
  path:new URL('artifacts/market-width/region-gap-960-light.png',source).pathname,
  animations:'disabled'
 });
 await gapPage.close();
 // An old outlier must not compress seven active dates to the far-right.
 const focusPage=await make(960,'light');
 const focusRows=[{location:'CN',firstSeen:'2025-03-01T12:00:00Z',company:'HSBC',jobStatus:'active'}];
 for(let i=0;i<7;i++)for(const region of ['SG','HK','CN'])
  for(let n=0;n<3;n++)focusRows.push({location:region,
   firstSeen:new Date(Date.UTC(2026,10,5+i,12)).toISOString(),
   company:'HSBC',jobStatus:'active'});
 const focused=await renderLeft(focusPage,focusRows,'light');
 assert.match(focused.dateNote,/近 7 天/,'focused time horizon must be disclosed');
 assert.equal(focused.pointTotal,63,'recent records remain exact');
 assert.ok(Math.min(...focused.points.map(p=>p.x))<100&&
  Math.max(...focused.points.map(p=>p.x))>430,
  'current activity should occupy the chart width rather than the right edge');
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
