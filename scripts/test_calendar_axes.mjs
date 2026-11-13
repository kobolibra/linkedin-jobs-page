import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const cut=(a,b)=>{const i=app.indexOf(a),j=app.indexOf(b,i);assert.ok(i>=0&&j>i);return app.slice(i,j);};
const axis=cut('    const regionTickFormat=','    // Snapshot counts and share labels');
function history(from,to,width=320){
 const tMin=Date.parse(from+'T00:00:00Z'),dayMs=86400000,tMax=Date.parse(to+'T00:00:00Z')+dayMs,bins=Math.round((tMax-tMin)/dayMs);
 const c={tMin,tMax,dayMs,bins,TW:520,left:43,right:17,plotW:460,distEl:{getBoundingClientRect:()=>({width})},trendX:i=>43+(i-1)/Math.max(1,bins-1)*460,escSvg:s=>s};
 vm.runInNewContext(axis+'\nthis.result={ticks:calendarCandidates,mode:calendarMode,step:calendarStep};',c);
 return JSON.parse(JSON.stringify(c.result));
}
test('full 2026 domain uses actual quarter starts, never a false Jan 1 or arbitrary Nov endpoint',()=>{
 for(const width of [240,320,520]){
  const h=history('2026-01-22','2026-11-13',width);
  assert.deepEqual(h.ticks.map(t=>t.date),['2026-04-01','2026-07-01','2026-10-01']);
  assert.deepEqual(h.ticks.map(t=>t.label),['Apr','Jul','Oct']);

 }
});
test('cross-year monthly ticks remain exact month starts',()=>{
 const h=history('2026-11-15','2027-02-15');
 assert.deepEqual(h.ticks.map(t=>t.date),['2026-12-01','2027-01-01','2027-02-01']);

});
test('short histories use Monday cadence without injecting either endpoint',()=>{
 const h=history('2026-11-01','2026-11-25');
 assert.deepEqual(h.ticks.map(t=>t.date),['2026-11-02','2026-11-09','2026-11-16','2026-11-23']);
 assert.equal(h.step,7);
});
test('single-day, leap-day and narrow-week domains are nonempty, bounded and chronological',()=>{
 for(const [from,to] of [['2026-11-13','2026-11-13'],['2028-02-27','2028-03-04'],['2026-12-30','2027-01-04']]){
  const h=history(from,to,240);assert.ok(h.ticks.length>=1&&h.ticks.length<=5);
  h.ticks.forEach(t=>assert.ok(t.date>=from&&t.date<=to));
  for(let i=1;i<h.ticks.length;i++)assert.ok(h.ticks[i].day>h.ticks[i-1].day);
 }
 assert.equal(history('2028-02-27','2028-03-04',520).ticks[1].date,'2028-02-29');
});
const week=cut('    const rhythmTickFormat=','    const sparkEl=document.getElementById("spark");');
test('every rolling 30-day window keeps every Monday, including across DST and New Year',()=>{
 for(const end of ['2026-11-13T12:00:00','2027-01-04T12:00:00','2026-03-16T12:00:00']){
  const days=Array.from({length:30},(_,i)=>{const date=new Date(end);date.setHours(0,0,0,0);date.setDate(date.getDate()-29+i);return {date};});
  const keyOf=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const c={days,keyOf,SW:520,sLeft:33,sRight:17,sx:i=>33+i/29*470};
  vm.runInNewContext(week+'\nthis.result={marks:rhythmMarks,labels:dateLabels};',c);
  const marks=Array.from(c.result.marks);assert.deepEqual(marks,days.flatMap((d,i)=>d.date.getDay()===1?[i]:[]));
  assert.ok(marks.length>=4&&marks.length<=5);
  for(let i=1;i<marks.length;i++)assert.equal(marks[i]-marks[i-1],7);
  assert.match(c.result.labels,/data-date=/);
 }
});

test('unrequested date-range and timezone captions are absent, not hidden',()=>{
 assert.doesNotMatch(app,/chart-date-range|chart-date-zone|const regionRange|const rhythmRange/);
 const css=readFileSync(new URL('../styles-refinement.css',import.meta.url),'utf8');
 assert.doesNotMatch(css,/chart-date-range|chart-date-zone/);
});
