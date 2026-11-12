/* Chromium acceptance for the true, count-proportional daily Market Width map.
   Includes all-zero, sparse, dense, region, date, official names and hover QA. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright';

const source=new URL('../',import.meta.url);
const html=readFileSync(new URL('index.html',source),'utf8');
const styles=['styles.css','styles-refinement.css','cn-city-map.css','market-width.css']
 .map(name=>readFileSync(new URL(name,source),'utf8')).join('\n');
const script=readFileSync(new URL('market-width.js',source),'utf8');
const analytics=html.match(/<div class="analytics reveal"[\s\S]*?(?=<\/header>)/)?.[0];
assert.ok(analytics,'homepage analytics block');
const days=Array.from({length:30},(_,n)=>{
 const key=new Date(Date.UTC(2026,9,14+n,12)).toISOString().slice(0,10);
 return {key,label:key};
});
const active=[
 ['Standard Chartered',2,'CN'],['Morgan Stanley',3,'HK'],
 ['Fidelity International',4,'SG'],['Schroders',5,'CN']
];
const jobs=[];
for(let i=0;i<29;i++)for(const [company,count,location] of active)
 for(let j=0;j<count;j++)jobs.push({company,location,firstSeen:days[i].key+'T09:00:00Z',jobStatus:'active'});

const browser=await chromium.launch({headless:true});
mkdirSync(new URL('artifacts/market-width/',source),{recursive:true});
const make=async(width,theme)=>{
 const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
 await page.setContent('<!doctype html><html data-theme="'+theme+'"><head><style>'+styles+'</style></head><body><div class="shell">'+analytics+'</div></body></html>');
 await page.addScriptTag({content:script});
 return page;
};
const summary=page=>page.locator('.mw-summary').textContent().then(t=>t.replace(/\s+/g,' ').trim());
async function ratioTest(page){
 const rects=await page.evaluate(()=>{
  const board=document.querySelector('#marketWidthMap').getBoundingClientRect();
  const tiles=[...document.querySelectorAll('.mw-tile')].map(node=>{
   const r=node.getBoundingClientRect();
   return {company:node.dataset.firm,count:Number(node.getAttribute('aria-label').match(/ · (\d+) new posting/)[1]),
    area:r.width*r.height,x:r.left,y:r.top,w:r.width,h:r.height,
    title:node.title,buttonLabel:node.getAttribute('aria-label')};
  });
  return {board:{w:board.width,h:board.height,x:board.x,y:board.y},tiles};
 });
 const total=rects.tiles.reduce((a,t)=>a+t.count,0),canvas=rects.board.w*rects.board.h;
 assert.ok(total>0);
 for(const tile of rects.tiles){
  assert.ok(Math.abs(tile.area/canvas-tile.count/total)<.0015,
   'tile area must equal the REAL count share; no min area: '+JSON.stringify(rects));
  assert.ok(tile.x>=rects.board.x-1&&tile.y>=rects.board.y-1);
 }
 const area=rects.tiles.reduce((a,t)=>a+t.area,0);
 assert.ok(Math.abs(area-canvas)<=canvas*.0003,'pixel-rendered tiles must cover within 0.03% browser subpixel tolerance '+JSON.stringify({area,canvas,diff:area-canvas,rects}));
 return rects;
}
try{
 for(const width of [1440,960,390]){
  for(const theme of ['light','dark']){
   const page=await make(width,theme);
   await page.evaluate(([rows,dates])=>window.MarketWidth.render(rows,dates),[jobs,days]);
   assert.equal(await page.locator('#marketWidthTitle').textContent(),'Market Width: 18 institutions we watch closely');
   assert.equal(await summary(page),'14 new postings across 4/18 institutions');
   assert.equal(await page.locator('.mw-tile').count(),4);
   assert.equal(await page.locator('.mw-zero-name').count(),14);
   assert.equal(await page.locator('.mw-map-layout.is-sparse').count(),1);
   assert.equal(await page.locator('.mw-matrix,.mw-cell,.mw-legend-chip,.mw-column-focus').count(),0);
   assert.equal(await page.locator('.mw-encoding').textContent(),'Area = new postings');
   assert.equal(await page.locator('.mw-date-nav .mw-chevron').count(),2);
   assert.equal(await page.locator('.mw-detail').isHidden(),true);
   assert.ok(await page.locator('.mw-tile[data-firm="1"]').getAttribute('aria-label').then(x=>x.includes('Standard Chartered')));
   assert.ok(await page.locator('.mw-tile[data-firm="12"]').getAttribute('aria-label').then(x=>x.includes('Morgan Stanley')));
   assert.ok(await page.locator('.mw-tile[data-firm="11"]').getAttribute('aria-label').then(x=>x.includes('Fidelity International')));
   await ratioTest(page);
   const dimensions=await page.evaluate(()=>{
    const r=x=>{const el=document.querySelector(x),b=el.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,b:b.bottom};};
    const top50=document.querySelector('.top50-tabs');
    return {left:r('.analytics-left'),right:r('.ac-col-market'),dist:r('.ac-col-density'),
     postings:r('.ac-col-postings'),top:r('.ac-col-top50'),map:r('#marketWidthMap'),
     pageWidth:document.documentElement.scrollWidth,
     tabs:getComputedStyle(document.querySelector('.mw-tabs')).backgroundColor,
     top50:top50&&getComputedStyle(top50).backgroundColor};
   });
   assert.ok(dimensions.postings.y>=dimensions.dist.b-2);
   assert.ok(dimensions.top.y>=Math.max(dimensions.left.b,dimensions.right.b)-2);
   assert.ok(dimensions.pageWidth<=width+2,'no page overflow '+JSON.stringify({width,theme,dimensions}));
   if(dimensions.top50)assert.equal(dimensions.tabs,dimensions.top50,'Top30 chrome parity');
   if(width>720){
    assert.ok(dimensions.right.x>=dimensions.left.x+dimensions.left.w-2);
    assert.ok(Math.abs(dimensions.left.h-dimensions.right.h)<3,'desktop alignment');
   }else assert.ok(dimensions.right.y>=dimensions.left.b-2,'mobile vertical stacking');
   // Real hover must never change panel or document geometry.
   const before=await page.evaluate(()=>({
    panel:document.querySelector('.ac-col-market').getBoundingClientRect().height,
    board:document.querySelector('#marketWidthMap').getBoundingClientRect().height,
    page:document.documentElement.scrollHeight
   }));
   await page.locator('.mw-tile[data-firm="1"]').hover();
   assert.equal(await page.locator('.mw-detail').isVisible(),true);
   await page.locator('.mw-tile[data-firm="12"]').hover();
   assert.match(await page.locator('.mw-detail').textContent(),/Morgan Stanley.*3 new postings/);
   const after=await page.evaluate(()=>({
    panel:document.querySelector('.ac-col-market').getBoundingClientRect().height,
    board:document.querySelector('#marketWidthMap').getBoundingClientRect().height,
    page:document.documentElement.scrollHeight
   }));
   assert.deepEqual(after,before,'hover cannot make the page wobble');
   await page.locator('[data-market-region="CN"]').click();
   assert.equal(await summary(page),'7 new postings across 2/18 institutions');
   assert.equal(await page.locator('.mw-tile').count(),2);
   assert.equal(await page.locator('.mw-zero-name').count(),16);
   await ratioTest(page);
   await page.locator('[data-market-region="HK"]').click();
   assert.equal(await summary(page),'3 new postings across 1/18 institutions');
   assert.equal(await page.locator('.mw-tile').count(),1);
   await ratioTest(page);
   await page.locator('[data-market-region="SG"]').click();
   assert.equal(await summary(page),'4 new postings across 1/18 institutions');
   await page.locator('[data-market-region="all"]').click();
   assert.equal(await summary(page),'14 new postings across 4/18 institutions');
   await page.locator('#marketWidthNext').click();
   assert.equal(await summary(page),'0 new postings across 0/18 institutions');
   assert.equal(await page.locator('.mw-tile').count(),0);
   assert.equal(await page.locator('.mw-zero-name').count(),18);
   assert.equal(await page.locator('.mw-empty').count(),1);
   await page.locator('#marketWidthPrev').click();
   assert.equal(await summary(page),'14 new postings across 4/18 institutions');
   // With no focus or tooltip show the intended default visual state.
   await page.evaluate(()=>{document.activeElement?.blur?.();});
   if(width!==960){
    await page.locator('.ac-col-market').screenshot({
     path:new URL('artifacts/market-width/treemap-'+width+'-'+theme+'.png',source).pathname,
     animations:'disabled'
    });
   }
   console.log('market-width real Treemap PASS '+width+'px '+theme);
   await page.close();
  }
 }
 const page=await make(960,'light');
 await page.evaluate(([date])=>window.MarketWidth.render([{company:'Standard Chartered',location:'CN',firstSeen:date+'T09:00:00Z',jobStatus:'active'}],[date]),[days[28].key]);
 assert.equal(await summary(page),'1 new postings across 1/18 institutions');
 assert.equal(await page.locator('.mw-tile').count(),1);
 assert.equal(await page.locator('.mw-zero-name').count(),17);
 assert.equal(await page.locator('.mw-tile-name').textContent(),'Standard Chartered');
 await ratioTest(page);
 await page.close();
 // 18-way distribution: no institution is artificially dropped.
 const many=await make(960,'dark');
 const rows=Array.from({length:18},(_,i)=>({
  company:['HSBC','Standard Chartered','Citi','JPMorgan Chase','BNP Paribas',
  'Societe Generale','DBS Bank','Deutsche Bank','Goldman Sachs','BlackRock',
  'Bank of America','Fidelity International','Morgan Stanley','BBVA','Natixis',
  'UBS','Schroders','Invesco'][i],location:'HK',firstSeen:days[28].key+'T09:00:00Z',jobStatus:'active'
 }));
 await many.evaluate(([jobs,date])=>window.MarketWidth.render(jobs,[date]),[rows,days[28].key]);
 assert.equal(await many.locator('.mw-tile').count(),18);
 assert.equal(await many.locator('#marketWidthZeroPanel').isHidden(),true);
 await ratioTest(many);
 await many.close();
}finally{await browser.close();}
