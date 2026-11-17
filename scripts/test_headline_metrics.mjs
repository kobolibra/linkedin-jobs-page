/* New This Week has one definition for signed-in readers (app.js, full index)
   and guests (server-built preview payload). Both must agree exactly. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),dates=require('../calendar-date.js');
import {weeklyFlow as serverFlow,previewData,publicPreviewPayload} from './guest_preview.mjs';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const app=read('app.js');
const start=app.indexOf('function weeklyFlow(jobs){');
const end=app.indexOf('/* Masthead and metric band',start);
assert.ok(start>=0&&end>start,'app.js defines weeklyFlow before the headline renderer');
const context={window:{JobDates:dates}};vm.runInNewContext(app.slice(start,end)+';globalThis.weeklyFlow=weeklyFlow;',context);
const browserFlow=context.weeklyFlow;
const plain=value=>JSON.parse(JSON.stringify(value));

test('browser and guest payload compute the same weekly flow on the real index',()=>{
 const index=JSON.parse(read('jobs-index.json'));
 const browser=plain(browserFlow(index.jobs)),server=serverFlow(index.jobs);
 assert.deepEqual(browser,server);
 assert.ok(server.current>0&&server.prior>0,'the real index has two comparable weeks');
 const payload=publicPreviewPayload(previewData(index),index);
 assert.deepEqual(payload.previewOverview.weekly,server,'guests receive the same counts');
});

test('weekly flow counts since-closed roles, excludes other regions and anchors on the latest update',()=>{
 const rows=[
  {link:'a',location:'HK',firstSeen:'2026-11-15T10:00:00Z',pushTime:'2026-11-16T04:00:00Z'},
  {link:'b',location:'SG',firstSeen:'2026-11-14T10:00:00Z',jobStatus:'expired'},
  {link:'c',location:'CN',firstSeen:'2026-11-08T10:00:00Z'},
  {link:'d',location:'OTHER',firstSeen:'2026-11-15T10:00:00Z'},
  {link:'e',location:'CN',firstSeen:'invalid'},
  {link:'a',location:'HK',firstSeen:'2026-11-15T10:00:00Z'},
  {link:'f',location:'HK',firstSeen:'2026-10-20T10:00:00Z'}
 ];
 const expected={current:2,prior:1,end:'2026-11-16T04:00:00.000Z'};
 assert.deepEqual(plain(browserFlow(rows)),expected);
 assert.deepEqual(serverFlow(rows),expected);
 assert.equal(browserFlow([]),null);
 assert.equal(serverFlow([{location:'HK',firstSeen:'bad'}]),null);
});

test('homepage arithmetic mean uses firstSeen ages, independent of repost date',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const dates=require('../calendar-date.js');
 const declaration=app.match(/^const meanOf=.*;$/m)?.[0];
 assert.ok(declaration);
 const meanOf=new Function(declaration+';return meanOf;')();
 const jobs=[
  {firstSeen:'2026-11-01',postingLastDate:'2026-11-16'},
  {firstSeen:'2026-11-11',postingLastDate:'2026-11-16'}
 ];
 const now=Date.parse('2026-11-17T15:00:00+08:00');
 const ages=jobs.map(job=>dates.calendarAge(job.firstSeen,now));
 assert.deepEqual(ages,[16,6]);
 assert.equal(meanOf(ages),11);
 assert.match(app,/const seenAt=j=>j\.firstSeen;/);
 assert.match(app,/const age=meanOf\(ages\),ageEl=/);
 assert.match(app,/Object\.entries\(postingHistoryDaily\)/);
});
test('recently closed roles define the weekly window even if active records are stale',()=>{
 const rows=[
  {link:'active-old',location:'HK',firstSeen:'2026-11-01T03:00:00Z',pushTime:'2026-11-02T03:00:00Z'},
  {link:'closed-new',location:'CN',firstSeen:'2026-11-16',postingLastDate:'2026-11-16',jobStatus:'expired',expiredAt:'2026-11-17T03:00:00Z'}
 ];
 const actual=plain(browserFlow(rows));
 assert.equal(actual.current,1);
 assert.equal(actual.prior,0);
 assert.deepEqual(actual,serverFlow(rows));
 assert.equal(serverFlow(rows.filter(j=>j.jobStatus==='expired')).current,1);
});
test('week boundaries are exact Beijing calendar days, including midnight',()=>{
 const rows=[
  {link:'boundary',location:'CN',firstSeen:'2026-11-11',postingLastDate:'2026-11-11'},
  {link:'today',location:'CN',firstSeen:'2026-11-18',postingLastDate:'2026-11-18',pushTime:'2026-11-17T16:01:00Z'}
 ];
 const output={current:1,prior:1,end:'2026-11-17T16:01:00.000Z'};
 assert.deepEqual(plain(browserFlow(rows)),output);
 assert.deepEqual(serverFlow(rows),output);
});

test('pure weekly additions ignore old reposts, retain expired additions, and subtract deletions',()=>{
 const old={link:'old',location:'CN',firstSeen:'2026-10-01',postingLastDate:'2026-11-17',pushTime:'2026-11-17',lastRepostedAt:'2026-11-17'};
 const recent={link:'recent',location:'HK',firstSeen:'2026-11-16',postingLastDate:'2026-11-17',jobStatus:'expired'};
 const first=[old,recent];
 assert.equal(browserFlow(first).current,1);
 assert.deepEqual(plain(browserFlow(first)),serverFlow(first));
 assert.equal(browserFlow([old]).current,0);
 assert.equal(serverFlow([old]).current,0);
 assert.equal(browserFlow([old,{...recent,jobStatus:'active'}]).current,1);
});
