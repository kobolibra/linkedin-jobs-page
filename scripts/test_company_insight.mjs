import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../company-insight.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const NOW=Date.parse('2026-10-07T12:00:00Z'),DAY=864e5;
const ago=days=>new Date(NOW-days*DAY).toISOString();
const record=(days,status='active',region='HK',expiredAt)=>({date:ago(days),status,region,expiredAt});
function classList(){const set=new Set();return {add:(...a)=>a.forEach(x=>set.add(x)),remove:(...a)=>a.forEach(x=>set.delete(x)),contains:x=>set.has(x),toggle:(x,on)=>{on??=!set.has(x);if(on)set.add(x);else set.delete(x);return on;}};}
function element(){return {textContent:'',innerHTML:'',title:'',style:{},dataset:{},classList:classList(),events:{},addEventListener(name,fn){this.events[name]=fn;},querySelectorAll:()=>[]};}
function ui(){
  const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const context=vm.createContext({window:{},document:{getElementById:get,body:element()},Date:{now:()=>NOW,parse:Date.parse},monogram:n=>n[0],requestAnimationFrame:fn=>fn(),companyEl:{value:'ACME'},ageEl:{value:'all'},apply:()=>{}});
  vm.runInContext(source,context);
  return {context,get,...context.window.CompanyInsight,render:context.window.renderCo};
}
const {summarize,insights}=ui();
test('total, regions and every date statistic include expired positions',()=>{
  const s=summarize([record(0),record(10,'expired','CN',ago(1)),record(30,'expired','SG',ago(2))],NOW);
  assert.equal(s.total,3);assert.equal(s.active,1);assert.equal(s.expired,2);assert.equal(s.median,10);assert.equal(s.mean,40/3);
  assert.equal(s.regions.CN,1);assert.equal(s.regions.SG,1);
  assert.equal(s.buckets.reduce((n,b)=>n+b.total,0),3);assert.equal(s.buckets[4].expired,1);
});
test('recent and previous periods are exactly seven days with no overlap',()=>{
  const s=summarize([record(0),record(6.999),record(7),record(13.999),record(14)],NOW);
  assert.equal(s.recent,2);assert.equal(s.previous,2);
  assert.equal(s.recentActive,2);assert.equal(s.recentExpired,0);
});
test('missing, invalid and future dates remain in totals but never become recent',()=>{
  const s=summarize([{date:null,status:'expired',region:'HK'},{date:'invalid',status:'active',region:'CN'},record(-1)],NOW);
  assert.equal(s.total,3);assert.equal(s.missingDates,3);assert.equal(s.recent,0);
  assert.equal(s.mean,null);assert.equal(s.median,null);assert.equal(s.q1,null);
  assert.match(insights(s).join(' '),/计入总量和状态统计，未计入日期分析/);
});
test('expired date is not confused with posting date or a hiring outcome',()=>{
  const s=summarize([record(80,'expired','HK',ago(2)),record(20,'expired','HK',ago(7)),record(3,'expired','HK',ago(5)),record(2,'expired','HK',ago(-1))],NOW);
  assert.equal(s.expiredRecent,1);assert.equal(s.missingExpiryDates,2);
  const note=insights(s).join(' ');assert.match(note,/近7日有 1 个职位被标记失效/);
  assert.doesNotMatch(note,/招聘活跃|招聘节奏|严重堆积|系统性|招满|招聘周期/);
});
test('old expired rows do not inflate the age profile of active opportunities',()=>{
  const s=summarize([record(1),record(30),record(500,'expired','HK',ago(2)),{date:null,status:'active',region:'HK'}],NOW);
  assert.equal(s.active,3);assert.equal(s.activeDated,2);assert.equal(s.activeOld,1);
  assert.match(insights(s).join(' '),/1 \/ 2 个（50%）/);
});
test('recent availability and regional concentration use the right denominators',()=>{
  const s=summarize([record(1),record(2),record(3,'expired','SG',ago(1))],NOW);
  assert.equal(s.recent,3);assert.equal(s.recentActive,2);assert.equal(s.recentExpired,1);
  assert.match(insights(s).join(' '),/有效职位集中在 HK：2 \/ 2 个（100%）/);
});
test('only expired positions still render an informative panel',()=>{
  const u=ui();u.render('ACME',[record(2,'expired','HK',ago(1)),record(30,'expired','CN',ago(0))],'all');
  assert.equal(u.get('coCount').textContent,2);assert.ok(u.get('coPanel').classList.contains('on'));
  assert.match(u.get('coStatus').innerHTML,/有效 <b>0/);assert.match(u.get('coStatus').innerHTML,/失效 <b>2/);
  assert.match(u.get('coFoot').innerHTML,/均已失效/);
});
test('no-date companies render totals without NaN, fake averages or a broken axis',()=>{
  const u=ui();u.render('ACME',[{date:null,status:'expired',region:'HK'}],'all');
  assert.equal(u.get('coCount').textContent,1);assert.equal(u.get('coMed').innerHTML,'—');
  assert.equal(u.get('coFresh').innerHTML,'—');assert.equal(u.get('coAxisSec').style.display,'none');
  assert.doesNotMatch(u.get('coFoot').innerHTML+u.get('coHist').innerHTML,/NaN|Infinity|undefined/);
});
test('histogram stacks active and expired counts and uses dated records for percentages',()=>{
  const u=ui();u.render('ACME',[record(1),record(1,'expired','HK',ago(0)),{date:null,status:'active',region:'HK'}],'1-7');
  assert.match(u.get('coHist').innerHTML,/1–7 天 · 2 个：有效 1，失效 1/);
  assert.match(u.get('coHist').innerHTML,/co-segment-active" style="width:50%/);
  assert.match(u.get('coHist').innerHTML,/aria-pressed="true"/);
  assert.equal(u.get('coCount').textContent,3);
});
test('identical ages aggregate on the axis without changing quantiles or counts',()=>{
  const u=ui(),rows=Array.from({length:100},()=>record(4));u.render('ACME',rows,'all');
  assert.equal((u.get('coPlot').innerHTML.match(/class="co-tick"/g)||[]).length,1);
  assert.match(u.get('coPlot').innerHTML,/有效 100，失效 0/);assert.equal(u.summarize(rows,NOW).median,4);
});
test('rendering treats company names as text and hides genuinely empty results',()=>{
  const u=ui(),name='<img src=x onerror=alert(1)>';u.render(name,[record(1)],'all');
  assert.equal(u.get('coName').textContent,name);assert.doesNotMatch(u.get('coFoot').innerHTML,/<img/);
  u.render(name,[],'all');assert.equal(u.get('coPanel').classList.contains('on'),false);
});

// Execute the real app filtering functions, not a reimplementation of their scope.
function appScope(){
  const cards=[
    {id:'a',age:1,status:'active',region:'HK',city:'Hong Kong',title:'analyst',comp:'ACME'},
    {id:'b',age:40,status:'expired',region:'HK',city:'Hong Kong',title:'manager',comp:'ACME'},
    {id:'c',age:2,status:'expired',region:'CN',city:'Shanghai',title:'analyst',comp:'ACME'},
    {id:'d',age:null,status:'expired',region:'HK',city:'Hong Kong',title:'analyst',comp:'ACME'},
    {id:'e',age:2,status:'active',region:'HK',city:'Hong Kong',title:'analyst',comp:'OTHER'},
  ].map(r=>({...element(),dataset:{...r,age:r.age==null?'':String(r.age),search:r.comp+' '+r.title},_coData:{...record(r.age??0,r.status,r.region),date:r.age==null?null:ago(r.age)}}));
  const sec={...element(),_jobCards:cards,dataset:{dayKey:'2026-10-07',dayLabel:'today'},querySelector:()=>element()};
  let received=[];
  const controls=()=>({...element(),value:'all'});
  const c={document:{dispatchEvent:()=>{}},CustomEvent:class{},searchEl:{value:''},companyEl:{...controls(),value:'ACME'},ageEl:controls(),cityEl:controls(),compClear:{...element(),parentElement:element()},jobsEl:element(),emptyEl:element(),countEl:element(),daySections:[sec],blocked:new Set(),blockedKw:new Set(),favs:new Set(['a','d']),favOnly:false,activeRegion:'all',activeCity:'all',simpleFilterActive:false,filteredCards:new Set(),REGIONS:{HK:{},CN:{}},ageMatch:(v,d)=>v==='all'||(v==='0'?d===0:v==='1-7'?d!==null&&d>=1&&d<=7:false),renderCo:(name,rows,age)=>{received={name,rows,age};}};
  const context=vm.createContext(c);
  vm.runInContext(app.slice(app.indexOf('function apply(){'),app.indexOf('document.addEventListener("keydown"')),context);
  return {c:context,cards,run:()=>{context.apply();return received;},get result(){return received;}};
}
test('app passes active, expired and missing-date records, excluding other companies',()=>{
  const a=appScope(),r=a.run();assert.equal(r.rows.length,4);assert.equal(summarize(r.rows,NOW).expired,3);
  assert.match(a.c.countEl.innerHTML,/有效 <b>1<\/b>/);
});
test('time filtering changes rows but preserves the full company distribution',()=>{
  const a=appScope();a.c.ageEl.value='1-7';const r=a.run();
  assert.equal(r.rows.length,4);assert.equal(a.cards[1].style.display,'none');assert.equal(a.cards[0].style.display,'');
});
test('region, city, keywords, company blocking and search continue to constrain the panel',()=>{
  const a=appScope();a.c.activeRegion='HK';a.c.activeCity='Hong Kong';assert.equal(a.run().rows.length,3);
  a.c.blockedKw.add('manager');assert.equal(a.run().rows.length,2);
  a.c.searchEl.value='analyst';assert.equal(a.run().rows.length,2);
  a.c.blocked.add('ACME');assert.equal(a.run().rows.length,0);
});
test('favorite toggling and unfavoriting refresh the selected company statistics',()=>{
  const a=appScope();assert.equal(a.run().rows.length,4);
  a.c.favOnly=true;a.c.refreshFavoriteFilterView();assert.equal(a.result.rows.length,2);
  a.c.favs.delete('d');a.c.refreshFavoriteFilterView();assert.equal(a.result.rows.length,1);
  a.c.favOnly=false;a.c.refreshFavoriteFilterView();assert.equal(a.result.rows.length,4);
});
