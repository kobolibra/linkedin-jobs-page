/* New This Week has one definition for signed-in readers (app.js, full index)
   and guests (server-built preview payload). Both must agree exactly. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {weeklyFlow as serverFlow,previewData,publicPreviewPayload} from './guest_preview.mjs';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const app=read('app.js');
const start=app.indexOf('function weeklyFlow(jobs){');
const end=app.indexOf('/* Masthead and metric band',start);
assert.ok(start>=0&&end>start,'app.js defines weeklyFlow before the headline renderer');
const context={};vm.runInNewContext(app.slice(start,end)+';globalThis.weeklyFlow=weeklyFlow;',context);
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
