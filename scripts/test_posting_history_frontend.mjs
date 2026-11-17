import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {previewData,publicPreviewPayload} from './guest_preview.mjs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const begin=app.indexOf('    const rcounts={};');
const end=app.indexOf('    const today=window.JobDates.key(Date.now())',begin);
assert.ok(begin>=0&&end>begin,'production New Postings daily-count block exists');
const logic=new Function('postingHistoryDaily','chartData','postingAt','norm','dayKey','RKEYS',app.slice(begin,end)+'\nreturn rcounts;');
const run=(history,active=[])=>logic(history,active,j=>j.postingLastDate||j.firstSeen||j.pushTime,j=>j.location,j=>j.slice(0,10),['OTHER','SG','HK','CN']);

test('New Postings reads immutable event history, never the current active snapshot',()=>{
 const recorded={'2026-11-01':{CN:1},'2026-11-14':{CN:1}};
 const before=run(recorded,[{location:'CN',firstSeen:'2026-11-01',postingLastDate:'2026-11-14'}]);
 const after=run(recorded,[]);
 assert.deepEqual(after,before,'closed or physically deleted roles must not alter historical bars');
 assert.equal(after['2026-11-01'].CN,1);
 assert.equal(after['2026-11-14'].CN,1);
 const repostAgain=run({...recorded,'2026-11-17':{CN:1}},[]);
 assert.equal(repostAgain['2026-11-17'].CN,1);
 assert.equal(repostAgain['2026-11-14'].CN,1);
});

test('source-date fallback is used only before the durable event ledger exists',()=>{
 const snapshot=[{location:'CN',firstSeen:'2026-11-01',postingLastDate:'2026-11-14'}];
 const legacy=run(null,snapshot);
 assert.equal(legacy['2026-11-14'].CN,1);
 assert.equal(legacy['2026-11-01'],undefined);
 const immutable=run({'2026-11-01':{CN:1}},snapshot);
 assert.equal(immutable['2026-11-01'].CN,1);
 assert.equal(immutable['2026-11-14'],undefined);
});

test('guest payload carries the same safe event aggregates without leaking the private ledger',()=>{
 const item={title:'Analyst',company:'Example Bank',location:'CN',link:'https://www.linkedin.com/jobs/view/123456789',
  firstSeen:'2026-11-01',postingLastDate:'2026-11-14',jobStatus:'expired'};
 const index={dataVersion:'abc',jobs:[item],postingHistoryDaily:{'2026-11-01':{CN:1},'2026-11-14':{CN:1}}};
 const payload=publicPreviewPayload(previewData(index,{},Date.parse('2026-11-17T00:00:00Z')),index);
 assert.deepEqual(payload.previewOverview.postingHistoryDaily,index.postingHistoryDaily);
 assert.ok(!JSON.stringify(payload).includes('posting-events-ledger'));
 assert.equal(payload.previewOverview.total,0);
});
