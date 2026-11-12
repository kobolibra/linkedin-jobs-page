/* Real Chromium verification: concise Market Width, stable hover, accessible
   18x30 matrix, premium responsive composition and light/dark visual captures. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
const source=new URL('../',import.meta.url);
const html=readFileSync(new URL('index.html',source),'utf8');
const styles=['styles.css','styles-refinement.css','cn-city-map.css','market-width.css']
 .map(name=>readFileSync(new URL(name,source),'utf8')).join('\n');
const script=readFileSync(new URL('market-width.js',source),'utf8');
const block=html.match(/<div class="analytics reveal"[\s\S]*?(?=<\/header>)/)?.[0];
assert.ok(block,'homepage analytics block exists');
const sample=[],days=Array.from({length:30},(_,i)=>{
 const d=new Date(Date.UTC(2026,9,14+i,12));
 const key=d.toISOString().slice(0,10);
 return {key,label:key};
});
for(let d=0;d<29;d++){
 for(const [company,n,location] of [['HSBC',2,'CN'],['Citi',3,'HK'],['Invesco',4,'SG'],['Schroders',5,'CN']]){
  for(let i=0;i<n;i++)sample.push({company,location,firstSeen:days[d].key+'T09:00:00Z',jobStatus:'active'});
 }
}
const browser=await chromium.launch({headless:true});
mkdirSync(new URL('artifacts/market-width/',source),{recursive:true});
const create=async (width,theme)=>{
 const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
 await page.setContent('<!doctype html><html data-theme="'+theme+'"><head><style>'+styles+'</style></head><body><div class="shell">'+block+'</div></body></html>');
 await page.addScriptTag({content:script});
 return page;
};
const summary=page=>page.locator('.mw-summary').textContent().then(s=>s.replace(/\s+/g,' ').trim());
try{
 for(const width of [1440,960,390]){
  for(const theme of ['light','dark']){
   const page=await create(width,theme);
   await page.evaluate(([rows,dates])=>window.MarketWidth.render(rows,dates),[sample,days]);
   assert.equal(await page.locator('#marketWidthTitle').textContent(),'Market Width: 18 institutions we watch closely');
   assert.equal(await summary(page),'14 new postings across 4/18 institutions');
   assert.equal(await page.locator('.mw-company-row').count(),18);
   assert.equal(await page.locator('.mw-company-row[data-firm-row="1"] .mw-company-name').textContent(),'Standard Chartered');
   assert.equal(await page.locator('.mw-company-row[data-firm-row="12"] .mw-company-name').textContent(),'Morgan Stanley');
   const labelFit=await page.evaluate(()=>{
     const names=['Standard Chartered','Morgan Stanley','Fidelity International'];
     return names.map(name=>{
       const el=[...document.querySelectorAll('.mw-company-name')].find(x=>x.textContent===name);
       if(!el)throw Error('Missing full label '+name);
       return {name,available:el.clientWidth,rendered:el.scrollWidth};
     });
   });
   assert.ok(labelFit.every(x=>x.rendered<=x.available+1),'Full names must fit without visual truncation: '+JSON.stringify(labelFit));

   assert.equal(await page.locator('.mw-cell').count(),540);
   assert.equal(await page.locator('.mw-level-0.mw-cell').count(),540-4*29);
   assert.equal(await page.locator('.mw-level-2.mw-cell').count(),2*29);
   assert.equal(await page.locator('.mw-level-3.mw-cell').count(),2*29);
   assert.equal(await page.locator('.mw-cell.is-selected').count(),18);
   assert.equal(await page.locator('.mw-legend-chip').count(),5);
   assert.equal(await page.locator('.mw-axis-tick,.mw-inspection,.mw-footnote,.mw-data,.mw-eyebrow').count(),0);
   assert.equal(await page.locator('.mw-chevron').count(),2);
   const measure=await page.evaluate(()=>{
    const rect=selector=>{
     const el=document.querySelector(selector);
     if(!el)throw Error('Missing '+selector);
     const b=el.getBoundingClientRect();
     return {x:b.x,y:b.y,w:b.width,h:b.height,b:b.bottom};
    };
    const focus=rect('.mw-column-focus'),header=rect('.mw-day-head[data-day="28"]'),first=rect('.mw-company-row'),rows=[...document.querySelectorAll('.mw-company-row')],last=rows.at(-1).getBoundingClientRect();
    const legend=rect('.mw-legend'),tabs=rect('.mw-tabs'),date=rect('.mw-date-nav');
    const top30=document.querySelector('.top50-tabs');
    const styles=el=>getComputedStyle(el);
    return {left:rect('.analytics-left'),right:rect('.ac-col-market'),
      dist:rect('.ac-col-density'),postings:rect('.ac-col-postings'),top:rect('.ac-col-top50'),
      matrix:rect('.mw-matrix'),focus,header,first,lastBottom:last.bottom,
      legend,tabs,date,summary:rect('.mw-summary'),
      pageWidth:document.documentElement.scrollWidth,
      docHeight:document.documentElement.scrollHeight,
      regionColor:styles(document.querySelector('.mw-tabs')).backgroundColor,
      top30Color:top30?styles(top30).backgroundColor:null,
      focusTopBorder:styles(document.querySelector('.mw-column-focus')).borderTopStyle,
      focusLeftBorder:styles(document.querySelector('.mw-column-focus')).borderLeftStyle,
      cellZero:styles(document.querySelector('.mw-level-0')).backgroundColor,
      cellOne:styles(document.querySelector('.mw-level-1')).backgroundColor,
      cellFour:styles(document.querySelector('.mw-level-4')).backgroundColor,
      cellFont:parseFloat(styles(document.querySelector('.mw-summary strong')).fontSize)
    };
   });
   assert.ok(measure.postings.y>=measure.dist.b-2,JSON.stringify({width,theme,measure}));
   assert.ok(measure.top.y>=Math.max(measure.left.b,measure.right.b)-2,JSON.stringify({width,theme,measure}));
   assert.ok(measure.pageWidth<=width+2,JSON.stringify({width,theme,measure}));
   assert.ok(measure.legend.y<measure.date.y,'scale above date controls');
   assert.ok(measure.date.y>=measure.tabs.y,'date below region scale row');
   assert.ok(Math.abs(measure.focus.x-measure.header.x)<3,'selection aligns with date');
   assert.ok(Math.abs(measure.focus.y-measure.first.y)<4,'selection starts at first firm');
   assert.ok(Math.abs(measure.focus.b-measure.lastBottom)<4,'selection ends at last firm');
   assert.ok(measure.focus.h>250,'selection rails cover all 18 rows');
   assert.equal(measure.focusTopBorder,'none','selection is not a rectangular frame');
   assert.equal(measure.focusLeftBorder,'solid','selection has subtle vertical rails');
   assert.ok(measure.cellFont<=12,'numbers must not overpower text');
   assert.notEqual(measure.cellZero,measure.cellOne);
   assert.notEqual(measure.cellOne,measure.cellFour);
   if(measure.top30Color)assert.equal(measure.regionColor,measure.top30Color,'region chrome matches Top 30');
   if(width>720){
    assert.ok(Math.abs(measure.right.h-measure.left.h)<3,JSON.stringify({width,theme,measure}));
    assert.ok(measure.right.x>=measure.left.x+measure.left.w-2);
   }else{
    assert.ok(measure.right.y>=measure.left.b-2);
    assert.ok(await page.evaluate(()=>document.querySelector('.mw-matrix-scroll').scrollWidth>document.querySelector('.mw-matrix-scroll').clientWidth));
    assert.equal(await page.locator('.mw-company').first().evaluate(el=>getComputedStyle(el).position),'sticky');
   }
   // Real hover regression: moving among cells cannot insert text, change row
   // heights, shift the panel, or reconstruct the grid.
   await page.evaluate(()=>window.__mwFirstCell=document.querySelector('.mw-cell[data-firm="16"][data-day="28"]'));
   const before=await page.evaluate(()=>({h:document.querySelector('.ac-col-market').getBoundingClientRect().height,grid:document.querySelector('.mw-matrix').getBoundingClientRect().height,scroll:document.documentElement.scrollHeight}));
   await page.locator('.mw-cell[data-firm="16"][data-day="28"]').hover();
   await page.locator('.mw-cell[data-firm="0"][data-day="27"]').hover();
   const after=await page.evaluate(()=>({h:document.querySelector('.ac-col-market').getBoundingClientRect().height,grid:document.querySelector('.mw-matrix').getBoundingClientRect().height,scroll:document.documentElement.scrollHeight,connected:window.__mwFirstCell.isConnected}));
   assert.deepEqual(after,{...before,connected:true},'hover must not wobble page layout');
   assert.equal(await page.locator('.mw-inspection').count(),0);
   await page.locator('[data-market-region="CN"]').click();
   assert.equal(await summary(page),'7 new postings across 2/18 institutions');
   await page.locator('[data-market-region="HK"]').click();
   assert.equal(await summary(page),'3 new postings across 1/18 institutions');
   await page.locator('[data-market-region="SG"]').click();
   assert.equal(await summary(page),'4 new postings across 1/18 institutions');
   await page.locator('[data-market-region="all"]').click();
   assert.equal(await summary(page),'14 new postings across 4/18 institutions');
   await page.locator('#marketWidthNext').click();
   assert.equal(await summary(page),'0 new postings across 0/18 institutions');
   assert.equal(await page.locator('.mw-cell.is-selected.mw-level-0').count(),18);
   assert.match(await page.locator('#marketWidthDate').getAttribute('aria-label'),/2026-11-12/);
   await page.locator('#marketWidthPrev').click();
   assert.equal(await summary(page),'14 new postings across 4/18 institutions');
   assert.ok(await page.evaluate(()=>window.__mwFirstCell.isConnected),'date changes must not re-create 540 cells');
   const cell=page.locator('.mw-cell[data-firm="16"][data-day="28"]');
   await cell.focus();
   await cell.press('ArrowLeft');
   assert.equal(await page.locator('.mw-cell[data-firm="16"][data-day="27"].is-selected').count(),1);
   const moved=await page.evaluate(()=>{
    const a=document.querySelector('.mw-column-focus').getBoundingClientRect(),b=document.querySelector('.mw-day-head[data-day="27"]').getBoundingClientRect();
    return Math.abs(a.left-b.left);
   });
   assert.ok(moved<3,'selection rails move with the date');
   await page.evaluate(()=>document.activeElement instanceof HTMLElement&&document.activeElement.blur());
   if(width!==960)await page.locator('.ac-col-market').screenshot({path:new URL('artifacts/market-width/matrix-'+width+'-'+theme+'.png',source).pathname,animations:'disabled'});
   console.log('market-width premium matrix PASS '+width+'px '+theme);
   await page.close();
  }
 }
 // Explicit requirement: preserve the user's requested grammar for a one-role day.
 const page=await create(960,'light');
 await page.evaluate(([dates])=>window.MarketWidth.render([{company:'HSBC',location:'CN',firstSeen:dates[28].key+'T12:00:00Z',jobStatus:'active'}],dates),[days]);
 assert.equal(await summary(page),'1 new postings across 1/18 institutions');
 await page.close();
}finally{await browser.close();}
