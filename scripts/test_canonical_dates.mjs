import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const dates=require('../calendar-date.js');
const {aggregate,initialDay}=require('../market-width.js');
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('canonical market date is independent of host timezone and matches UTC+8 midnight',()=>{
 assert.equal(dates.key('2026-11-16T15:59:59Z'),'2026-11-16');
 assert.equal(dates.key('2026-11-16T16:00:00Z'),'2026-11-17');
 assert.equal(dates.key('2026-11-17T00:00:00+08:00'),'2026-11-17');
 assert.equal(dates.key('2026-11-16T23:30:00-05:00'),'2026-11-17');
 assert.equal(dates.key('2026-11-17T00:00:00'),'2026-11-17');
 assert.equal(dates.key('2026-11-17'),'2026-11-17');
 assert.equal(dates.dayStart('2026-11-17'),Date.parse('2026-11-16T16:00:00Z'));
 assert.equal(dates.dayEnd('2026-11-16'),dates.dayStart('2026-11-17'));
 assert.equal(dates.key(dates.dayEnd('2026-11-16')),'2026-11-17');
});
test('date-only, leap year, New Year, and bad date handling are stable',()=>{
 assert.equal(dates.key('2028-02-29'),'2028-02-29');
 assert.equal(dates.key('2027-02-29'),'');
 assert.equal(dates.key('2026-13-01'),'');
 assert.equal(dates.key('not a date'),'');
 assert.equal(dates.key(''),'');
 assert.equal(dates.key('2026-12-31T15:59:59Z'),'2026-12-31');
 assert.equal(dates.key('2026-12-31T16:00:00Z'),'2027-01-01');
 assert.equal(dates.addDays('2028-02-28',1),'2028-02-29');
 assert.equal(dates.addDays('2028-02-29',1),'2028-03-01');
 assert.equal(dates.addDays('2026-12-31',1),'2027-01-01');
 assert.equal(dates.weekday('2026-11-16'),1);
 assert.equal(dates.fullDay('2026-11-17'),'17 Nov 2026');
 assert.equal(dates.shortDay('2026-11-17'),'17 Nov');
 assert.match(dates.fullDay('2026-11-17',{weekday:true}),/17 Nov 2026/);
 assert.equal(dates.formatStamp('2026-11-16T16:01:00Z'),'17 Nov 2026 00:01');
 assert.equal(dates.formatStamp('2026-11-16T16:01:00Z',{compact:true}),'17 Nov 00:01');
 assert.doesNotMatch(dates.formatStamp('2026-11-16T16:01:00Z',{compact:true}),/UTC\+8|·/);
 assert.equal(dates.formatStamp('invalid'),'—');
});
test('Market Breadth groups exact UTC+8 posting days, not visitor local days',()=>{
 const series=aggregate([
  {company:'HSBC',location:'CN',firstSeen:'2026-11-16T15:59:59Z'},
  {company:'HSBC',location:'HK',firstSeen:'2026-11-16T16:00:00Z'},
  {company:'Citi',location:'SG',firstSeen:'2026-11-17'}
 ],['2026-11-16','2026-11-17']);
 assert.equal(series.counts.all[0][0],1);
 assert.equal(series.counts.all[1][0],1);
 assert.equal(series.counts.all[1][2],1);
 assert.equal(initialDay(series,Date.parse('2026-11-17T15:59:59Z')),0);
 assert.equal(initialDay(series,Date.parse('2026-11-17T16:00:00Z')),1);
});
test('repost keeps the original listing age and Market Breadth first-day cohort',()=>{
 const job={firstSeen:'2026-11-16',postingLastDate:'2026-11-16',pushTime:'2026-11-16T21:59:16Z'};
 const observed=Date.parse('2026-11-17T03:28:26Z');
 const initialAt=j=>j.firstSeen,postingAt=j=>j.postingLastDate||j.firstSeen||j.pushTime;
 assert.equal(dates.key(job.pushTime),'2026-11-17');
 assert.equal(dates.calendarAge(initialAt(job),observed),1);
 const repost={...job,postingLastDate:'2026-11-17'};
 assert.equal(dates.calendarAge(initialAt(repost),observed),1,'repost cannot reset listing age');
 assert.equal(dates.key(postingAt(repost)),'2026-11-17','posting-event clock remains independent');
 const days=['2026-11-16','2026-11-17'];
 const original=aggregate([{...job,company:'JPMorgan Chase',location:'CN',jobStatus:'active'}],days);
 const shifted=aggregate([{...repost,company:'JPMorgan Chase',location:'CN',jobStatus:'expired'}],days);
 assert.equal(original.counts.CN[0][3],1);
 assert.equal(shifted.counts.CN[0][3],1,'first-recorded cohort is stable through repost and closure while retained');
 assert.equal(shifted.counts.CN[1][3],0);
 const app=read('app.js');
 assert.match(app,/const seenAt=j=>j\.firstSeen;/);
 assert.match(app,/const postingAt=j=>j\.postingLastDate\|\|j\.firstSeen\|\|j\.pushTime/);
 assert.equal(app.includes("const placeAt=j=>j.pushTime||j.firstSeen;"),true);
 assert.match(read('scripts/jobspy/build_frontend_payload.py'),/"postingLastDate"/);
 assert.equal(app.split("ageDays(seenAt(job))").length-1,3);
 assert.match(app,/Object\.entries\(postingHistoryDaily\)/);
 assert.match(app,/postingDate:postingAt\(job\)/);
 assert.match(app,/expiredValidDays=expired\?validDays\(job\.firstSeen,job\.expiredAt\)/);
 assert.match(app,/Cumulative stack of currently active roles by first recorded date/);
});
test('expired-role valid-day badge counts Beijing calendar boundaries, not UTC elapsed hours',()=>{
 const source=read('app.js');
 const definition=source.match(/^const validDays=.*;$/m)?.[0];
 assert.ok(definition,'closed-role validity calculation is available');
 const validDays=new Function('window',definition+';return validDays;')({JobDates:dates});
 assert.equal(validDays('2026-11-16','2026-11-16T15:59:59Z'),0);
 assert.equal(validDays('2026-11-16','2026-11-16T16:00:01Z'),1);
 assert.equal(validDays('2026-11-17','2026-11-16T15:59:59Z'),null);
 assert.equal(validDays('invalid','2026-11-17'),null);
});
test('visible age metric labels describe firstSeen, not repost dates',()=>{
 const home=read('index.html'),about=read('about.html'),top=read('top30-layout.js'),app=read('app.js');
 assert.match(home,/Average Listing Age/);
 assert.match(home,/days since first recorded/);
 assert.match(home,/first recorded in the last 7 calendar days/);
 assert.match(app,/Object\.entries\(postingHistoryDaily\)/,'publishing events retain their separate repost-aware date');
 assert.match(home,/距首次记录的天数/);
 assert.doesNotMatch(home,/days since latest posting|距最近发布的天数/);
 assert.match(about,/first-recorded date/);
 assert.match(top,/AVERAGE DAYS SINCE FIRST RECORDED/);
 assert.match(top,/MEDIAN DAYS SINCE FIRST RECORDED/);
 assert.match(app,/currently active roles by first recorded date/);
});
test('site loads one shared calendar and all known user-facing dates use it',()=>{
 const html=read('index.html'),app=read('app.js'),breadth=read('market-width.js');
 const expected=['calendar-date.js','app.js','list-view.js','market-width.js','job-applications.js','guestbook.js','visitor-count.js'];
 for(const asset of expected)assert.match(html,new RegExp(asset.replace('.','\\.')+'\\?v='));
 for(const file of ['app.js','market-width.js','list-view.js','job-applications.js','guestbook.js','visitor-count.js'])
  assert.match(read(file),/JobDates|calendar-date\.js/,file);
 assert.match(app,/const dayKey=iso=>window\.JobDates\.key/);
 assert.match(app,/const today=window\.JobDates\.key\(Date\.now\(\)\)/);
 assert.match(breadth,/const dateKey=d=>dates\.key\(d\)/);
 assert.doesNotMatch(app,/toLocaleDateString\("zh-CN"/);
});
