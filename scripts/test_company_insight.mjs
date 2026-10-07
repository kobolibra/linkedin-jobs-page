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
test('expired lifetime stops at expiry while active exposure continues',()=>{
  const rows=[record(10),record(30,'expired','CN',ago(20))];
  const a=summarize(rows,NOW),b=summarize(rows,NOW+15*DAY);
  assert.equal(a.close.mean,10);assert.equal(b.close.mean,10);
  assert.equal(a.open.mean,10);assert.equal(b.open.mean,25);
  assert.equal(a.active,1);assert.equal(a.expired,1);assert.equal(a.regions.CN,1);
});
test('unfinished active roles never enter closure statistics',()=>{
  const s=summarize([record(1000),record(10,'expired','HK',ago(2))],NOW);
  assert.equal(s.close.n,1);assert.equal(s.close.median,8);assert.equal(s.open.median,1000);
});
test('duration keeps sub-day precision before averaging and includes same-instant closure',()=>{
  const s=summarize([record(1.75,'expired','HK',ago(1)),record(2,'expired','HK',ago(2))],NOW);
  assert.equal(s.close.mean,.375);assert.equal(s.close.n,2);
});
test('reposting or push timestamps cannot reset the original lifetime',()=>{
  const s=summarize([{...record(30,'expired','HK',ago(1)),datePosted:ago(2),pushTime:ago(2)}],NOW);
  assert.equal(s.close.median,29);assert.equal(s.weeks[0].added,0);
});
test('means and interpolated quartiles are computed separately with weighted duplicates',()=>{
  const rows=[1,2,2,3,92].map(d=>record(d+1,'expired','HK',ago(1)));
  const s=summarize(rows,NOW);assert.equal(s.close.mean,20);assert.equal(s.close.median,2);
  assert.equal(s.close.q1,2);assert.equal(s.close.q3,3);
  assert.match(insights(s).join(' '),/长周期职位拉高了平均数/);
});
test('both distributions use exact nonoverlapping duration boundaries and separate denominators',()=>{
  const s=summarize([0,6.99,7,14,30,60].map(d=>record(d+1,'expired','HK',ago(1))).concat([record(2)]),NOW);
  assert.deepEqual(Array.from(s.close.buckets,b=>b.count),[2,1,1,1,1]);
  assert.equal(s.open.buckets[0].count,1);assert.equal(s.close.n,6);assert.equal(s.open.n,1);
});
test('rolling weekly windows are equal and boundary events are not double counted',()=>{
  const s=summarize([0,6.999,7,13.999,14,21,28].map(d=>record(d)),NOW);
  assert.deepEqual(Array.from(s.weeks,w=>w.added),[2,2,1,1]);
});
test('closure rhythm follows end date independently from the start date',()=>{
  const s=summarize([record(80,'expired','HK',ago(2)),record(20,'expired','HK',ago(7)),record(3)],NOW);
  assert.equal(s.weeks[0].closed,1);assert.equal(s.weeks[1].closed,1);
  assert.equal(s.weeks[0].added,1);assert.equal(s.weeks[0].balance,0);
  assert.equal(s.weeks[0].close.median,78);
});
test('missing, future, reversed dates cannot fabricate durations or event counts',()=>{
  const rows=[{date:null,status:'expired',expiredAt:ago(1)},record(3,'expired','HK',ago(5)),record(2,'expired','HK',ago(-1)),record(-1),{date:'bad',status:'active'}];
  const s=summarize(rows,NOW);assert.equal(s.total,5);assert.equal(s.close.n,0);assert.equal(s.open.n,0);
  assert.equal(s.missingStart,3);assert.equal(s.missingEnd,1);assert.equal(s.invalidOrder,1);
  assert.equal(s.weeks[0].closed,1);assert.equal(s.close.mean,null);
});
test('zero previous counts produce absolute changes instead of infinite growth',()=>{
  const s=summarize([record(1)],NOW),notes=insights(s).join(' ');
  assert.match(notes,/增加 1 个/);assert.doesNotMatch(notes,/Infinity|100%|加速|扩招/);
});
test('weekly closure comparison uses completed cohorts and requires five in each',()=>{
  const rows=[...Array.from({length:5},()=>record(11,'expired','HK',ago(1))),...Array.from({length:5},()=>record(28,'expired','HK',ago(8)))];
  assert.match(insights(summarize(rows,NOW)).join(' '),/缩短 10 天/);
  assert.doesNotMatch(insights(summarize(rows.slice(1),NOW)).join(' '),/缩短/);
});
test('active stock exceeding closure upper quartile is not labelled a hiring delay',()=>{
  const rows=Array.from({length:10},()=>record(11,'expired','HK',ago(1))).concat([record(30),record(3)]);
  const s=summarize(rows,NOW);assert.equal(s.beyondQ3,1);assert.equal(s.oldActive,1);
  assert.match(insights(s).join(' '),/1 个在招职位已超过历史关闭用时/);
  assert.doesNotMatch(insights(s).join(' '),/堆积|招聘困难|招满|点击|链接/);
});
test('expiry source attribution stays separate from inferred hiring outcomes',()=>{
  const rows=['linkedin_closed','linkedin_removed','missing_from_full_company_snapshot',null].map(expiredReason=>({...record(5,'expired','HK',ago(1)),expiredReason}));
  const u=ui();u.render('ACME',rows);assert.match(u.get('coStatus').title,/关闭\/移除 2；完整抓取中消失 1；其他或未记录 1/);
});
test('expired-only panel renders closed duration and empty active metrics',()=>{
  const u=ui();u.render('ACME',[record(30,'expired','CN',ago(20))]);
  assert.ok(u.get('coPanel').classList.contains('on'));assert.match(u.get('coMetrics').innerHTML,/<td>—<\/td><td>10 天/);
  assert.match(u.get('coFoot').innerHTML,/当前没有有效职位/);
});
test('no-date panel shows unavailable stats and explicit missing counts, never fake zero durations',()=>{
  const u=ui();u.render('ACME',[{date:null,status:'expired'}]);
  assert.match(u.get('coMetrics').innerHTML,/<td>—<\/td><td>—<\/td>/);
  assert.match(u.get('coQuality').textContent,/1 条缺有效起始日期；1 条缺有效失效日期/);
  assert.doesNotMatch([...['coMetrics','coHist','coFoot','coRhythm'].map(k=>u.get(k).innerHTML)].join(''),/NaN|Infinity|undefined/);
});
test('duration distribution is not wired to unrelated list-age filtering',()=>{
  const u=ui();u.render('ACME',[record(2),record(30,'expired','HK',ago(28))]);
  assert.equal(u.get('coHist').events.click,undefined);
  assert.doesNotMatch(u.get('coHist').innerHTML,/button|data-age|aria-pressed/);
  assert.match(u.get('coHist').innerHTML,/在招：1 \/ 1 个，100%/);
  assert.match(u.get('coHist').innerHTML,/失效：1 \/ 1 个，100%/);
});
test('company names are text and generic footer boilerplate is removed',()=>{
  const u=ui(),name='<img src=x onerror=alert(1)>';u.render(name,[record(1)]);
  assert.equal(u.get('coName').textContent,name);assert.doesNotMatch(u.get('coFoot').innerHTML,/<img|co-scope|点击|核对原招聘链接|不随时间区间/);
  u.render(name,[]);assert.equal(u.get('coPanel').classList.contains('on'),false);
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
