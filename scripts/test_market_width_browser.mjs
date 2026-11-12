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
async function inspectMosaic(page,nonzero){
 const details=await page.evaluate(()=>{
  const board=document.querySelector('#marketWidthMap').getBoundingClientRect();
  const nodes=[...document.querySelectorAll('.mw-tile')];
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
    faceBg:getComputedStyle(face).backgroundColor,
    faceInk:getComputedStyle(face).color,
    tone:[...node.classList].find(c=>c.startsWith('mw-activity-'))||null,
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
 assert.ok(details.rects.every(t=>t.zero?t.tone===null:
  t.tone==='mw-activity-'+(Number(t.count)<=1?'low':Number(t.count)<=4?'mid':'high')),
  'activity tone must follow posting count, never institution identity');
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
   assert.equal(await page.locator('#marketWidthTitle').textContent(),'Market Width: 18 institutions we watch closely');
   assert.equal(await summary(page),'14 new postings across 4/18 institutions');
   assert.equal(await page.locator('.mw-encoding').textContent(),'Size reflects postings');
   const initial=await inspectMosaic(page,4);
   assert.ok(await page.locator('.mw-tile:not(.mw-is-zero)').count()===4);
   const zeros=initial.rects.filter(t=>t.zero),positives=initial.rects.filter(t=>!t.zero);
   const zeroBg=zeros[0].faceBg;
   assert.ok(positives.every(t=>Math.hypot(...rgb(t.faceBg).map((v,i)=>v-rgb(zeroBg)[i]))>60),
    'every institution ink must differ clearly from the muted zero-neutral');
   assert.ok(new Set(positives.map(t=>t.faceBg)).size<=3,
    'all active firms must share a restrained three-step mineral navy family');
   const fill=i=>positives.find(t=>t.i===i)?.faceBg;
   assert.equal(fill(1),fill(12),'equal activity tiers share one intentional hue');
   assert.equal(fill(11),fill(12),'same medium tier shares one mineral-blue hue');
   assert.notEqual(fill(16),fill(12),'the lead institution receives the deeper activity tone');
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
     pageWidth:document.documentElement.scrollWidth,
     regionBg:getComputedStyle(document.querySelector('.mw-tabs')).backgroundColor,
     topBg:top30&&getComputedStyle(top30).backgroundColor,
     regionW:rect('.mw-tabs').w,topW:top30?.getBoundingClientRect().width||0};
   });
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
 // Sparse: only one firm is hiring, the other 17 are muted within the SAME map.
 const one=await make(960,'light');
 await one.evaluate(([date])=>window.MarketWidth.render([{company:'Standard Chartered',location:'CN',firstSeen:date+'T09:00:00Z',jobStatus:'active'}],[date]),[days[28].key]);
 assert.equal(await summary(one),'1 new postings across 1/18 institutions');
 const sparse=await inspectMosaic(one,1);
 assert.equal(sparse.rects.find(t=>t.i===1).count,'1');
 const featured=sparse.rects.find(t=>t.i===1);
 assert.ok(featured.layout==='feature'&&featured.nameFont>=18&&featured.countFont>=25,
  'single hiring firm must use feature-size centered typography: '+JSON.stringify(featured));
 await one.locator('.ac-col-market').screenshot({path:new URL('artifacts/market-width/single-active-960-light.png',source).pathname,animations:'disabled'});
 await one.close();
 // Dense: all eighteen have one job.
 const dense=await make(960,'dark');
 const jobs=firms.map(company=>({company,location:'HK',firstSeen:days[28].key+'T09:00:00Z',jobStatus:'active'}));
 await dense.evaluate(([rows,date])=>window.MarketWidth.render(rows,[date]),[jobs,days[28].key]);
 assert.equal(await summary(dense),'18 new postings across 18/18 institutions');
 await inspectMosaic(dense,18);
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
