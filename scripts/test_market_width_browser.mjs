/* Browser verification: 18 companies × 30 dates, stable absolute cells,
   no zero decorations, region filters, selected-day navigation, layout, themes. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
const source=new URL('../',import.meta.url);
const html=readFileSync(new URL('index.html',source),'utf8');
const styles=['styles.css','styles-refinement.css','cn-city-map.css','market-width.css']
 .map(name=>readFileSync(new URL(name,source),'utf8')).join('\n');
const script=readFileSync(new URL('market-width.js',source),'utf8');
const block=html.match(/<div class="analytics reveal"[\s\S]*?(?=<\/header>)/)?.[0];
assert.ok(block,'homepage analytics block is present');
const sample=[],days=Array.from({length:30},(_,index)=>{
 const d=new Date(Date.UTC(2026,9,14+index,12));
 const key=d.toISOString().slice(0,10);
 return {key,label:key};
});
for(let day=0;day<29;day++){
 for(const [company,count,region] of [['HSBC',2,'CN'],['Citi',3,'HK'],['Invesco',4,'SG'],['Schroders',5,'CN']]){
  for(let n=0;n<count;n++)sample.push({company,location:region,firstSeen:days[day].key+'T09:00:00Z',jobStatus:'active'});
 }
}
const browser=await chromium.launch({headless:true});
mkdirSync(new URL('../artifacts/market-width/',source),{recursive:true});
try{
 for(const width of [1440,960,390]){
  for(const theme of ['light','dark']){
   const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
   await page.setContent('<!doctype html><html data-theme="'+theme+'"><head><style>'+styles+'</style></head><body><div class="shell">'+block+'</div></body></html>');
   await page.addScriptTag({content:script});
   await page.evaluate(([rows,dates])=>window.MarketWidth.render(rows,dates),[sample,days]);
   const box=await page.evaluate(()=>{
    const measure=selector=>{
     const el=document.querySelector(selector);
     if(!el)throw Error('Missing '+selector);
     const b=el.getBoundingClientRect();
     return {x:b.x,y:b.y,w:b.width,h:b.height,b:b.bottom};
    };
    return {left:measure('.analytics-left'),right:measure('.ac-col-market'),
      dist:measure('.ac-col-density'),postings:measure('.ac-col-postings'),
      top:measure('.ac-col-top50'),matrix:measure('.mw-matrix'),
      scroll:measure('.mw-matrix-scroll'),pageWidth:document.documentElement.scrollWidth};
   });
   assert.equal(await page.locator('#marketWidthCount').textContent(),'14');
   assert.equal(await page.locator('#marketWidthFirms').textContent(),'4 / 18');
   assert.equal(await page.locator('.mw-company-row').count(),18);
   assert.equal(await page.locator('.mw-cell').count(),540);
   assert.equal(await page.locator('.mw-cell[data-level="0"]').count(),540-4*29);
   assert.equal(await page.locator('.mw-cell[data-level="2"]').count(),2*29);
   assert.equal(await page.locator('.mw-cell[data-level="3"]').count(),2*29);
   assert.equal(await page.locator('.mw-cell.is-selected').count(),18);
   assert.equal(await page.locator('.mw-legend-chip').count(),6);
   assert.equal(await page.locator('.mw-svg,.mw-area,.mw-dot,.mw-spoke').count(),0);
   assert.equal(await page.locator('#marketWidthDetails tr').count(),18);
   assert.equal(await page.locator('#marketWidthDetails tr:first-child td').count(),3);
   assert.ok(box.matrix.w>=420,JSON.stringify({width,theme,box}));
   assert.ok(box.postings.y>=box.dist.b-2,JSON.stringify({width,theme,box}));
   assert.ok(box.top.y>=Math.max(box.left.b,box.right.b)-2,JSON.stringify({width,theme,box}));
   assert.ok(box.pageWidth<=width+2,'avoid whole-page horizontal overflow: '+JSON.stringify({width,theme,box}));
   if(width>720){
    assert.ok(box.right.x>=box.left.x+box.left.w-2,JSON.stringify({width,theme,box}));
    assert.ok(Math.abs(box.right.h-box.left.h)<3,JSON.stringify({width,theme,box}));
   }else{
    assert.ok(box.right.y>=box.left.b-2,JSON.stringify({width,theme,box}));
    assert.ok(await page.evaluate(()=>document.querySelector('.mw-matrix-scroll').scrollWidth>document.querySelector('.mw-matrix-scroll').clientWidth));
    assert.equal(await page.locator('.mw-company').first().evaluate(el=>getComputedStyle(el).position),'sticky');
   }
   const cellStyle=await page.evaluate(()=>{
    const get=selector=>getComputedStyle(document.querySelector(selector)).backgroundColor;
    return {zero:get('.mw-level-0'),two:get('.mw-level-2'),four:get('.mw-level-3')};
   });
   assert.notEqual(cellStyle.zero,cellStyle.two);
   assert.notEqual(cellStyle.two,cellStyle.four);
   assert.match(await page.locator('#marketWidthInspection').textContent(),/14 new roles/);
   // Hover a real positive cell and verify the full institution/date/count.
   await page.locator('.mw-cell[data-firm="16"][data-day="28"]').hover();
   assert.match(await page.locator('#marketWidthInspection').textContent(),/Schroders.*5 newly observed/);
   await page.locator('[data-market-region="CN"]').click();
   assert.equal(await page.locator('#marketWidthCount').textContent(),'7');
   assert.equal(await page.locator('#marketWidthFirms').textContent(),'2 / 18');
   await page.locator('[data-market-region="HK"]').click();
   assert.equal(await page.locator('#marketWidthCount').textContent(),'3');
   await page.locator('[data-market-region="SG"]').click();
   assert.equal(await page.locator('#marketWidthCount').textContent(),'4');
   await page.locator('[data-market-region="all"]').click();
   assert.equal(await page.locator('#marketWidthCount').textContent(),'14');
   // Empty latest day is explicitly shown as zero rather than a made-up stem.
   await page.locator('#marketWidthNext').click();
   assert.equal(await page.locator('#marketWidthCount').textContent(),'0');
   assert.equal(await page.locator('#marketWidthFirms').textContent(),'0 / 18');
   assert.equal(await page.locator('.mw-cell.is-selected[data-level="0"]').count(),18);
   assert.match(await page.locator('#marketWidthDate').getAttribute('aria-label'),/2026-11-12/);
   await page.locator('#marketWidthPrev').click();
   assert.equal(await page.locator('#marketWidthCount').textContent(),'14');
   // Selected date updates from keyboard, not only pointer.
   const selected=page.locator('.mw-cell[data-firm="16"][data-day="28"]');
   await selected.focus();
   await selected.press('ArrowLeft');
   assert.equal(await page.locator('.mw-cell[data-firm="16"][data-day="27"].is-selected').count(),1);
   assert.equal(await page.locator('#marketWidthDetails tr').count(),18);
   if(width!==960){
    await page.locator('.ac-col-market').screenshot({
     path:new URL('../artifacts/market-width/matrix-'+width+'-'+theme+'.png',source).pathname,
     animations:'disabled'
    });
   }
   console.log('market-width 30d matrix PASS '+width+'px '+theme);
   await page.close();
  }
 }
}finally{await browser.close();}
