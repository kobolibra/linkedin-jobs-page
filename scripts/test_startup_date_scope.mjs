import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),JobDates=require('../calendar-date.js');
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function between(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,`Missing startup contract: ${start}`);return source.slice(a,b);}
const helpers=between('const keyOf=','const isActiveJob=');
const selection=source.match(/^const seenAt=.*$/m)?.[0];assert.ok(selection);
const placement=source.match(/^const placeAt=.*$/m)?.[0];assert.ok(placement);
const axis=between('    const regionTickFormat=','    const axisCssWidth=');
const grouping=between('    const groups=new Map();','    const orderedGroups=');
function group(rows,broken=false){const context={rows,window:{JobDates}};vm.createContext(context);const local=broken?axis.replaceAll('regionAxisDayLabel','dayLabel'):axis;return vm.runInContext(`${helpers}\n${selection}\n${placement}\n(()=>{const data=rows;${local}\n${grouping}\nreturn [...groups.values()].map(g=>g.label);})()`,context);}
test('chart formatting cannot shadow the ISO-safe list formatter',()=>{
 assert.equal((source.match(/\bconst dayLabel\s*=/g)||[]).length,1);
 assert.match(axis,/const regionAxisDayLabel=/);
 assert.ok(source.includes('label:dayLabel(t)'));
 assert.match(source,/window\.JobDates\.fullDay/);
});
for(const [name,rows] of [
 ['ISO strings',[{pushTime:'2026-11-13T04:03:15Z'}]],
 ['offset and fractional timestamps',[{pushTime:'2026-11-13T12:03:15+08:00'},{firstSeen:'2026-11-12T09:00:00.123456+00:00'}]],
 ['invalid and missing dates',[{pushTime:'invalid'},{}]],
 ['empty list',[]]
])test(`real startup grouping handles ${name}`,()=>{const labels=group(rows);assert.equal(labels.length>0,rows.length>0);for(const label of labels)assert.equal(typeof label,'string');});
test('negative control reproduces the pre-fix RangeError with one normal role',()=>{
 assert.throws(()=>group([{firstSeen:'2026-11-13T04:03:15Z'}],true),error=>error.name==='RangeError');
});
