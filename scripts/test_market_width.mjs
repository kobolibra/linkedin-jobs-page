import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {FIRMS,REGIONS,firmIndex,aggregate,daily,limit}=require('../market-width.js');
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

test('homepage positions both charts left, aligned radar right, and preserves other analyses',()=>{
 const html=read('index.html'),css=read('market-width.css');
 const pos=s=>html.indexOf(s);
 assert.ok(pos('class="analytics-left"')<pos('id="dist"')&&pos('id="dist"')<pos('id="spark"'));
 assert.ok(pos('id="spark"')<pos('id="marketWidth"')&&pos('id="marketWidth"')<pos('id="top50"'));
 assert.ok(pos('id="top50"')<pos('id="cnCityMap"'));
 assert.match(css,/\.analytics-card > \.analytics-left[\s\S]*?grid-column:1/);
 assert.match(css,/\.analytics-card > \.ac-col-market[\s\S]*?grid-column:2/);
 assert.match(css,/@media \(max-width:720px\)/);
 assert.equal((html.match(/data-market-region=/g)||[]).length,4);
 for(const s of ['market-width.js?v=market-width-1','market-width.css?v=market-width-1'])assert.ok(html.includes(s));
 assert.match(read('app.js'),/window\.MarketWidth\?\.render\(chartData,days\)/);
 assert.match(read('account.js'),/'top30-layout\.js','market-width\.js'/);
 assert.match(read('scripts/browser_assets.mjs'),/'\/market-width\.js'/);
 assert.match(read('scripts/public_assets.mjs'),/'market-width\.js', 'market-width\.css'/);
});
