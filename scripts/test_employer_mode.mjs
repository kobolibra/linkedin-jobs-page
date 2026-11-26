import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {previewData,publicPreviewPayload} from './guest_preview.mjs';
const require=createRequire(import.meta.url);
const {normalize,scope,matches}=require('../employer-mode.js');
const now=Date.parse('2026-11-26T12:00:00Z');
const types=['direct_employer','recruitment_agency','recruitment_platform','mixed','unknown','unlisted'];
const index={employerModeSchema:1,source:'jobs.json',dataVersion:'abc',jobs:types.flatMap((employerType,i)=>Array.from({length:4},(_,j)=>({employerType,title:'Role '+i+'-'+j,company:'Company '+i,link:'https://www.linkedin.com/jobs/view/'+(12345678+i*10+j),location:['CN','HK','SG'][j%3],jobStatus:j===3?'expired':'active',firstSeen:'2026-11-25',pushTime:'2026-11-25'}))),postingHistoryDaily:{'2026-11-25':{CN:6}},postingHistoryDailyByMode:{direct:{'2026-11-25':{CN:1}},agency:{'2026-11-25':{CN:5}}}};
test('direct and agency form a disjoint exhaustive partition; full stays unchanged',()=>{
 const direct=scope(index,'direct'),agency=scope(index,'agency');
 assert.equal(direct.jobs.length,4);assert.equal(agency.jobs.length,20);
 assert.ok(direct.jobs.every(j=>j.employerType==='direct_employer'));
 assert.ok(agency.jobs.every(j=>j.employerType!=='direct_employer'));
 assert.equal(scope(index,'full'),index);assert.equal(normalize('invalid'),'full');
 assert.equal(direct.postingHistoryDaily['2026-11-25'].CN,1);
 assert.equal(agency.postingHistoryDaily['2026-11-25'].CN,5);
 assert.equal(index.jobs.length,24);assert.equal(matches({},'agency'),true);
});
test('non-full modes reject legacy snapshots or missing scoped history',()=>{
 assert.throws(()=>scope({jobs:[]},'direct'),{code:'EMPLOYER_MODE_UNAVAILABLE'});
 assert.throws(()=>scope({...index,postingHistoryDailyByMode:undefined},'agency'),{code:'EMPLOYER_MODE_UNAVAILABLE'});
});
test('guest preview keeps a fixed sample and independently scoped aggregates',()=>{
 const preview=publicPreviewPayload(previewData(index,{},now),index,now),direct=scope(preview,'direct'),agency=scope(preview,'agency');
 assert.equal(preview.jobs.length,12);assert.equal(direct.jobs.length+agency.jobs.length,12);
 assert.equal(direct.previewOverview.total,3);assert.equal(agency.previewOverview.total,15);
 assert.equal(direct.previewOverview.total+agency.previewOverview.total,preview.previewOverview.total);
 for(const [mode,doc] of [['direct',direct],['agency',agency]]){
  assert.ok(doc.jobs.every(j=>matches(j,mode)));assert.equal(doc.previewOverview.chartBuckets.reduce((n,b)=>n+b[5],0),doc.previewOverview.total);
 }
 assert.ok(!JSON.stringify(preview).includes('evidence'));
});
test('selection initializes before account bootstrap and sits between About and theme',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(html.indexOf('employer-mode.js?')<html.indexOf('src="account.js?'));
 assert.ok(html.indexOf('nj-about-link')<html.indexOf('id="employerMode"')&&html.indexOf('id="employerMode"')<html.indexOf('id="themeToggle"'));
});

test('mode switching is in-page; no location reload',()=>{const source=readFileSync(new URL('../employer-mode.js',import.meta.url),'utf8');assert.doesNotMatch(source,/location\.(?:reload|replace)\(/);assert.match(source,/employermodechange/);});
test('VISTRA is a requester-confirmed direct employer',()=>{const rows=JSON.parse(readFileSync(new URL('../financial_blacklist.json',import.meta.url),'utf8'));const row=rows.find(r=>r.company.toLowerCase()==='vistra');assert.equal(row?.employerType,'direct_employer');assert.equal(row?.evidence?.basis,'requester_confirmation');});

test('the recruitment picker has no rectangular focus, hover or active style',()=>{
 const css=readFileSync(new URL('../next-journey-masthead.css',import.meta.url),'utf8');
 const rule=css.match(/#headerTools #employerMode,\s*#headerTools #employerMode:hover,\s*#headerTools #employerMode:active,\s*#headerTools #employerMode:focus,\s*#headerTools #employerMode:focus-visible\s*\{([^}]+)\}/);
 assert.ok(rule,'explicitly style every persistent focus state');
 for(const property of ['border:0','border-radius:0','outline:none','box-shadow:none','background:transparent'])assert.ok(rule[1].includes(property),property);
 assert.doesNotMatch(css,/#headerTools \.nj-employer-mode select:focus-visible/);
 assert.match(css,/:has\(#employerMode:focus-visible\)::after\{[^}]*height:1px/);
});
