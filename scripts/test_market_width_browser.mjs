/* Browser acceptance: real layout, controls, labels and chart geometry. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
const source=new URL('../',import.meta.url);
const html=readFileSync(new URL('index.html',source),'utf8');
const styles=['styles.css','styles-refinement.css','cn-city-map.css','market-width.css'].map(name=>readFileSync(new URL(name,source),'utf8')).join('\n');
const script=readFileSync(new URL('market-width.js',source),'utf8');
const block=html.match(/<div class="analytics reveal"[\s\S]*?(?=<\/header>)/)?.[0];
assert.ok(block,'homepage analytics present');
const analytics=block.slice(0,block.indexOf('</div></div>\n    ')>=0?block.indexOf('</div></div>\n    ')+12:undefined);
const sample=[];
for(const date of ['2026-11-09','2026-11-10','2026-11-11']){
 for(const [company,i] of [['HSBC',0],['Citi',1],['Invesco',2],['Schroders',3]]){
  for(let n=0;n<(i+2);n++)sample.push({company,location:['CN','HK','SG'][i%3],firstSeen:date,jobStatus:'active'});
 }
}
const days=['2026-11-09','2026-11-10','2026-11-11'].map(key=>({key,label:key,date:new Date(key+'T12:00:00Z')}));
const browser=await chromium.launch({headless:true});
try{
 for(const width of [1440,960,390]){
  for(const theme of ['light','dark']){
   const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
   await page.setContent('<!doctype html><html data-theme="'+theme+'"><head><style>'+styles+'</style></head><body><div class="shell">'+block+'</div></body></html>');
   await page.addScriptTag({content:script});
   await page.evaluate(([rows,dates])=>window.MarketWidth.render(rows,dates),[sample,days.map(({key,label})=>({key,label,date:key}))]);
   const metrics=await page.evaluate(()=>{
    const box=selector=>{const el=document.querySelector(selector);assert(el,selector);const b=el.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,b:b.bottom}};
    function assert(el,label){if(!el)throw Error('Missing '+label);}
    return {left:box('.analytics-left'),radar:box('.ac-col-market'),dist:box('.ac-col-density'),postings:box('.ac-col-postings'),top:box('.ac-col-top50'),svg:box('.mw-svg'),count:document.querySelector('#marketWidthCount').textContent,firm:document.querySelector('#marketWidthFirms').textContent,axes:document.querySelectorAll('.mw-firm').length,table:document.querySelectorAll('#marketWidthDetails tr').length,scroll:document.documentElement.scrollWidth};
   });
   assert.equal(metrics.count,'14');
   assert.equal(metrics.firm,'4 / 18');
   assert.equal(metrics.axes,18);assert.equal(metrics.table,18);
   assert.ok(metrics.svg.w>180&&metrics.svg.h>130,JSON.stringify({width,theme,metrics}));
   assert.ok(metrics.postings.y>=metrics.dist.b-2,JSON.stringify({width,theme,metrics}));
   assert.ok(metrics.top.y>=Math.max(metrics.left.b,metrics.radar.b)-2,JSON.stringify({width,theme,metrics}));
   if(width>720){
    assert.ok(metrics.radar.x>=metrics.left.x+metrics.left.w-2,JSON.stringify({width,theme,metrics}));
    assert.ok(Math.abs(metrics.radar.h-metrics.left.h)<3,JSON.stringify({width,theme,metrics}));
   }else assert.ok(metrics.radar.y>=metrics.left.b-2,JSON.stringify({width,theme,metrics}));
   await page.locator('[data-market-region="CN"]').click();
   assert.equal(await page.locator('#marketWidthCount').textContent(),'6');
   await page.locator('[data-market-region="HK"]').click();
   assert.equal(await page.locator('#marketWidthCount').textContent(),'3');
   await page.locator('#marketWidthPrev').click();
   assert.match(await page.locator('#marketWidthDate').textContent(),/2026-11-10/);
   await page.locator('[data-market-region="all"]').click();
   assert.equal(await page.locator('#marketWidthDetails tr').count(),18);
   console.log('market-width browser PASS '+width+'px '+theme);
   await page.close();
  }
 }
}finally{await browser.close();}
