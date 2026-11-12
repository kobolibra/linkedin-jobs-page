import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {FIRMS,REGIONS,LEVELS,firmIndex,aggregate,daily,limit,bandOf,rowTotals,sortedFirms}=require('../market-width.js');
const root=new URL('../',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');

test('tracked institutions match the 18-company collector registry and About list',()=>{
 const collector=read('scripts/jobspy/fetch_linkedin_requests.py'),about=read('about.html');
 const names=[...collector.matchAll(/^    "([^"]+)": \{"canonical":/gm)].map(m=>m[1]);
 assert.deepEqual(FIRMS,names);
 assert.equal(new Set(FIRMS).size,18);
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

test('heatmap count bands are absolute and stable across dates and regions',()=>{
 assert.deepEqual(LEVELS.map(x=>x.label),['0','1','2–3','4–7','8+']);
 assert.deepEqual([0,1,2,3,4,7,8,15,16,900].map(bandOf),[0,1,2,2,3,3,4,4,4,4]);
 assert.ok(LEVELS.every((x,i)=>i===0||x.min===LEVELS[i-1].max+1));
 assert.ok(!Object.hasOwn(LEVELS[0],'fill')); // color is a shared design token
});

test('institutions rank by 30-day first-seen totals, with deterministic ties',()=>{
 const counts=Array.from({length:3},()=>Array(18).fill(0));
 counts[0][3]=4;counts[1][3]=4;counts[1][5]=1;counts[2][5]=8;
 const totals=rowTotals(counts);
 assert.equal(totals[3],8);assert.equal(totals[5],9);
 const rank=sortedFirms(counts);
 assert.deepEqual(rank.slice(0,2).map(x=>x.i),[5,3]);
 assert.equal(rank[2].i,0);assert.equal(rank.length,18);
});

test('homepage shows editorial 18-by-30 matrix, aligned beside left charts',()=>{
 const html=read('index.html'),css=read('market-width.css'),js=read('market-width.js');
 const pos=s=>html.indexOf(s);
 assert.ok(pos('class="analytics-left"')<pos('id="dist"')&&pos('id="dist"')<pos('id="spark"'));
 assert.ok(pos('id="spark"')<pos('id="marketWidth"')&&pos('id="marketWidth"')<pos('id="top50"'));
 assert.ok(pos('id="top50"')<pos('id="cnCityMap"'));
 assert.match(css,/\.analytics-card > \.analytics-left[\s\S]*?grid-column:1/);
 assert.match(css,/\.analytics-card > \.ac-col-market[\s\S]*?grid-column:2/);
 assert.match(css,/@media\s*\(max-width:720px\)/);
 assert.match(css,/position:sticky/);
 assert.match(css,/\.mw-column-focus/);
 assert.match(js,/j%7===0&&j<=last-5/);
 assert.equal((html.match(/data-market-region=/g)||[]).length,4);
 assert.ok(html.includes('id="marketWidthScroll"'));
 assert.ok(!html.includes('18 institutions · 30 days'));
 assert.ok(html.includes('Market Width: New Roles by Institution'));
 assert.doesNotMatch(html,/id="marketWidthDay"|ADAPTIVE COUNT SCALE|radar chart|Radial scale/);
 assert.doesNotMatch(js,/\bpathOf\b|\bradialPoints\b|mw-area|mw-dot|polygon/);
 assert.ok(js.includes('repeat(var(--mw-days),minmax(0,1fr))')===false); // grid is authored in CSS
 assert.ok(css.includes('repeat(var(--mw-days),minmax(0,1fr))'));
 for(const s of ['market-width.js?v=market-width-5','market-width.css?v=market-width-5'])assert.ok(html.includes(s));
 assert.match(read('app.js'),/window\.MarketWidth\?\.render\(chartData,days\)/);
 assert.match(read('account.js'),/'top30-layout\.js','market-width\.js'/);
 assert.match(read('scripts/browser_assets.mjs'),/'\/market-width\.js'/);
 assert.ok(read('scripts/public_assets.mjs').includes("'market-width.js', 'market-width.css'"));
 assert.match(read('about.html'),/Market Width matrix maps 18 institutions/);
 assert.doesNotMatch(read('about.html'),/Market Width radar/);
});

test('publication matrix is concise and accessible without redundant copy',()=>{
 const html=read('index.html'),js=read('market-width.js'),css=read('market-width.css');
 assert.doesNotMatch(html,/Zero means no qualifying roles recorded|First observed on LinkedIn|New roles · selected day|18 institutions · 30 days/);
 assert.match(js,/aria-label/);
 assert.match(js,/role="gridcell"/);
 assert.match(js,/pointerover/);
 assert.match(js,/ArrowDown/);
 assert.match(js,/scroll\.scrollLeft/);
 assert.doesNotMatch(html,/Explore exact institution counts|id="marketWidthDetails"|id="marketWidthStatus"|New roles · selected day/);
 assert.ok(html.includes('class="mw-column-focus"')===false);
 assert.match(js,/class="mw-column-focus"/);
 assert.match(js,/positionFocus\(\)/);
 assert.match(css,/\.mw-metric strong/);
 assert.match(css,/\.mw-legend-item/);
 assert.ok(html.includes('Firms posting'));
});
