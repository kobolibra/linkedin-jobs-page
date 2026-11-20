import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),JobDates=require('../calendar-date.js');
const source=readFileSync(new URL('../company-insight.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const NOW=Date.parse('2026-10-07T12:00:00Z'),DAY=864e5;
const ago=days=>new Date(NOW-days*DAY).toISOString();
const record=(days,status='active',region='HK',expiredAt)=>({date:ago(days),status,region,expiredAt});
function classList(){const set=new Set();return {add:(...a)=>a.forEach(x=>set.add(x)),remove:(...a)=>a.forEach(x=>set.delete(x)),contains:x=>set.has(x),toggle:(x,on)=>{on??=!set.has(x);if(on)set.add(x);else set.delete(x);return on;}};}
function element(){return {textContent:'',innerHTML:'',title:'',style:{},dataset:{},classList:classList(),events:{},addEventListener(name,fn){this.events[name]=fn;},querySelectorAll:()=>[]};}
function ui(){
  const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const context=vm.createContext({window:{JobDates},document:{getElementById:get,body:element()},Date:{now:()=>NOW,parse:Date.parse},monogram:n=>n[0],requestAnimationFrame:fn=>fn(),companyEl:{value:'ACME'},ageEl:{value:'all'},apply:()=>{}});
  vm.runInContext(source,context);
  return {context,get,...context.window.CompanyInsight,render:context.window.renderCo};
}
const {summarize,insights}=ui();

test('date-only start and closure use whole Beijing calendar-day lifetimes',()=>{
 const u=ui();u.context.window.JobDates=JobDates;
 const now=Date.parse('2026-11-17T00:05:00+08:00');
 const s=u.summarize([
  {date:'2026-11-17',postingDate:'2026-11-17',status:'active',region:'CN'},
  {date:'2026-11-16',postingDate:'2026-11-16',expiredAt:'2026-11-17T00:01:00+08:00',status:'expired',region:'HK'}
 ],now);
 assert.equal(s.missingStart,0);
 assert.deepEqual(Array.from(s.open.values),[0]);
 assert.deepEqual(Array.from(s.close.values),[1]);
 assert.equal(s.weeks[0].closed,1);
});
test('repost never resets active age, while weekly publishing events remain distinct',()=>{
  const u=ui();
  u.context.window.JobDates=JobDates;
  const records=[
    {date:'2026-09-01T03:00:00Z',postingDate:'2026-10-07',status:'active',region:'HK'},
    {date:'2026-09-01T03:00:00Z',postingDate:'2026-10-07',
     expiredAt:'2026-10-07T10:00:00Z',status:'expired',region:'HK'}
  ];
  const s=u.summarize(records,NOW);
  assert.equal(s.weeks[0].added,2,'including reposted roles closed since');
  assert.equal(s.open.buckets[0].count,0,'repost does not put a mature role into Today');
  assert.equal(s.open.buckets[5].count,1,'firstSeen keeps a mature repost in the 4-week+ cohort');
  assert.ok(s.close.median>30,'closure duration still uses the immutable firstSeen');
  u.render('ACME',records,'29+');
  assert.match(u.get('coHist').innerHTML,/data-age="29\+" aria-pressed="true"/);
  assert.equal(u.get('coFresh').textContent,2);
});

test('posted and closed weekly cohorts share Beijing midnight boundaries',()=>{
  const u=ui();
  u.context.window.JobDates=JobDates;
  const old='2026-09-01T00:00:00Z';
  const s=u.summarize([
    {date:old,postingDate:'2026-09-30',status:'expired',
     expiredAt:'2026-09-30T15:59:00Z',region:'HK'},
    {date:old,postingDate:'2026-10-01',status:'expired',
     expiredAt:'2026-09-30T16:01:00Z',region:'HK'}
  ],NOW);
  assert.deepEqual(Array.from(s.weeks,w=>w.closed),[1,1,0,0],
    'Beijing Sep 30 closure belongs to prior week, Oct 1 closure belongs to current week');
  assert.equal(s.close.n,2,'actual lifetime durations remain measured from firstSeen');
});
test('both virtual and fallback card paths provide original and latest posting dates',()=>{
  assert.match(app,/coData:\{date:job\.firstSeen,postingDate:postingAt\(job\),expiredAt:/);
  assert.match(app,/card\._coData=\{date:job\.firstSeen,postingDate:postingAt\(job\),expiredAt:/);
});
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
test('lifetime durations ignore sub-day precision even when UTC instants differ',()=>{
  const s=summarize([record(1.75,'expired','HK',ago(1)),record(2,'expired','HK',ago(2))],NOW);
  assert.equal(s.close.mean,0);assert.equal(s.close.n,2);
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
test('original active age buckets retain exact list-filter boundaries and exclude expired roles',()=>{
  const s=summarize([0,.99,1,7.99,8,14.99,15,21.99,22].map(d=>record(d)).concat([record(40,'expired','HK',ago(1))]),NOW);
  assert.deepEqual(Array.from(s.open.buckets,b=>b.count),[1,2,2,2,2,0]);
  assert.equal(s.close.median,39);assert.equal(s.close.buckets,undefined);
});
test('Company Insight aggregates only after the 4-week bracket',()=>{
 const u=ui();
 const ages=[0,1,7,8,14,15,21,22,28,29,35,70,71,100];
 const rows=ages.map(d=>record(d));
 const s=u.summarize(rows,NOW);
 assert.deepEqual(Array.from(s.open.buckets,b=>b.v),['0','1-7','8-14','15-21','22-28','29+']);
 assert.deepEqual(Array.from(s.open.buckets,b=>b.label),['Today','1W','2W','3W','4W','4W+']);
 assert.deepEqual(Array.from(s.open.buckets,b=>b.count),[1,2,2,2,2,5]);
 u.render('ACME',rows,'29+');
 assert.equal((u.get('coHist').innerHTML.match(/<button/g)||[]).length,6);
 assert.match(u.get('coHist').innerHTML,/data-age="29\+" aria-pressed="true"/);
 let calls=0;u.context.apply=()=>{calls++;};
 const button={dataset:{age:'29+'},classList:classList()};
 u.get('coHist').events.click({target:{closest:()=>button}});
 assert.equal(u.context.ageEl.value,'29+');
 u.get('coHist').events.click({target:{closest:()=>button}});
 assert.equal(u.context.ageEl.value,'all');
 assert.equal(calls,2);
});
test('rolling weekly windows are equal and boundary events are not double counted',()=>{
  const s=summarize([0,6.999,7,13.999,14,21,28].map(d=>record(d)),NOW);
  assert.deepEqual(Array.from(s.weeks,w=>w.added),[1,2,2,1]);
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
  assert.match(insights(s).join(' '),/1 个有效职位已超过历史关闭用时/);
  assert.doesNotMatch(insights(s).join(' '),/堆积|招聘困难|招满|点击|链接/);
});
test('expiry source attribution stays separate from inferred hiring outcomes',()=>{
  const rows=['linkedin_closed','linkedin_removed','missing_from_full_company_snapshot',null].map(expiredReason=>({...record(5,'expired','HK',ago(1)),expiredReason}));
  const u=ui();u.render('ACME',rows);assert.match(u.get('coStatus').title,/关闭\/移除 2；完整抓取中消失 1；其他或未记录 1/);
});
test('expired-only panel renders closed duration and empty active metrics',()=>{
  const u=ui();u.render('ACME',[record(30,'expired','CN',ago(20))]);
  assert.ok(u.get('coPanel').classList.contains('on'));assert.equal(u.get('coCloseMed').textContent,'10 天');
  assert.equal(u.get('coMed').innerHTML,'—');assert.equal(u.get('coHistSec').hidden,true);assert.equal(u.get('coAxisSec').hidden,true);
  assert.match(u.get('coFoot').innerHTML,/当前没有有效职位/);
});
test('no-date panel shows unavailable stats and explicit missing counts, never fake zero durations',()=>{
  const u=ui();u.render('ACME',[{date:null,status:'expired'}]);
  assert.equal(u.get('coMed').innerHTML,'—');assert.equal(u.get('coCloseMed').textContent,'—');
  assert.match(u.get('coQuality').textContent,/1 条缺可用起始日期；1 条缺可用关闭日期/);
  assert.doesNotMatch([...['coMed','coHist','coFoot','coRhythm'].map(k=>u.get(k).innerHTML)].join(''),/NaN|Infinity|undefined/);
});
test('only active histogram renders; closed duration remains a compact summary',()=>{
  const u=ui();u.render('ACME',[record(2),record(30,'expired','HK',ago(28))],'1-7');
  assert.equal((u.get('coHist').innerHTML.match(/<button/g)||[]).length,6);
  assert.match(u.get('coHist').innerHTML,/有效 1 个/);assert.doesNotMatch(u.get('coHist').innerHTML,/关闭|closed|co-pair/);
  assert.match(u.get('coHist').innerHTML,/aria-pressed="true"/);
  assert.equal(u.get('coCloseMed').textContent,'2 天');assert.equal(u.get('coCloseSample').textContent,'1 / 1 个');
});
test('original histogram click toggles the matching first-recorded-age filter',()=>{
  const u=ui();let calls=0;u.context.apply=()=>{calls++;};
  const button={dataset:{age:'1-7'},classList:classList()};
  const click=()=>u.get('coHist').events.click({target:{closest:()=>button}});
  click();assert.equal(u.context.ageEl.value,'1-7');click();assert.equal(u.context.ageEl.value,'all');assert.equal(calls,2);
  button.disabled=true;click();assert.equal(calls,2);
});
test('active axis aggregates equal ages and never includes expired ages or lifetimes',()=>{
  const u=ui();u.render('ACME',[...Array.from({length:100},()=>record(4)),record(100,'expired','HK',ago(90))]);
  assert.equal((u.get('coPlot').innerHTML.match(/class="co-tick"/g)||[]).length,1);
  assert.match(u.get('coPlot').innerHTML,/4 天：100 个有效职位/);
  assert.doesNotMatch(u.get('coPlot').innerHTML,/100 天|10 天/);
  assert.equal(u.get('coCloseMed').textContent,'10 天');
});
test('active-only company has no empty closure section and 7-day additions include expired rows',()=>{
  const u=ui();u.render('ACME',[record(2),record(8)]);assert.equal(u.get('coCloseSec').hidden,true);
  u.render('ACME',[record(2),record(3,'expired','HK',ago(1))]);
  assert.equal(u.get('coCloseSec').hidden,false);assert.equal(u.get('coCount').textContent,1);assert.equal(u.get('coFresh').textContent,2);
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
  const c={window:{},document:{dispatchEvent:()=>{}},CustomEvent:class{},searchEl:{value:''},companyEl:{...controls(),value:'ACME'},ageEl:controls(),cityEl:controls(),compClear:{...element(),parentElement:element()},jobsEl:element(),emptyEl:element(),countEl:element(),daySections:[sec],blocked:new Set(),blockedKw:new Set(),favs:new Set(['a','d']),favOnly:false,activeOnly:false,activeOnlyEl:{...element(),setAttribute(name,value){this[name]=value;}},activeCountEl:element(),activeRegion:'all',activeCity:'all',simpleFilterActive:false,renderReady:true,loadedJobs:null,filteredCards:new Set(),REGIONS:{HK:{},CN:{}},ageMatch:(v,d)=>v==='all'||(v==='0'?d===0:v==='1-7'?d!==null&&d>=1&&d<=7:false),renderCo:(name,rows,age)=>{received={name,rows,age};}};
  const context=vm.createContext(c);
  vm.runInContext(app.slice(app.indexOf('function updateJobCount(count){'),app.indexOf('document.addEventListener("keydown"')),context);
  return {c:context,cards,run:()=>{context.apply();return received;},get result(){return received;}};
}
test('app passes active, expired and missing-date records, excluding other companies',()=>{
  const a=appScope(),r=a.run();assert.equal(r.rows.length,4);assert.equal(summarize(r.rows,NOW).expired,3);
  assert.equal(a.c.activeCountEl.textContent,1);
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


test('active-only list filter composes with search and restores closed records without shrinking company insight',()=>{
  const a=appScope();
  a.run();
  const original=a.cards.filter(card=>card.style.display!=="none").length;
  a.c.activeOnly=true;a.run();
  assert.ok(a.cards.filter(card=>card.style.display!=="none").every(card=>card.dataset.status!=="expired"));
  assert.equal(a.result.rows.length,4);
  assert.equal(a.c.activeOnlyEl['aria-pressed'],'true');
  a.c.searchEl.value='analyst';a.run();
  assert.equal(a.cards.filter(card=>card.style.display!=="none").length,1);
  assert.ok(a.cards.filter(card=>card.style.display!=="none").every(card=>card.dataset.status!=="expired"));
  a.c.activeOnly=false;a.c.searchEl.value='';a.run();
  assert.equal(a.cards.filter(card=>card.style.display!=="none").length,original);
  assert.equal(a.c.activeOnlyEl['aria-pressed'],'false');
});

test('early count precedes card rendering and respects existing filters',async()=>{
  const rows=[
    {title:'Fund Accountant',company:'ACME',location:'HK',city:'Hong Kong',link:'a',age:2},
    {title:'Fund Accountant',company:'ACME',location:'HK',city:'Hong Kong',link:'b',age:2,jobStatus:'expired'},
    {title:'Risk Analyst',company:'ACME',location:'CN',city:'Shanghai',link:'c',age:9},
    {title:'Fund Manager',company:'OTHER',location:'SG',city:'Singapore',link:'d',age:2}
  ];
  const events=[],c={loadedJobs:rows,searchEl:{value:''},companyEl:{value:'all'},ageEl:{value:'all'},blocked:new Set(),blockedKw:new Set(),favs:new Set(['a']),favOnly:false,activeRegion:'all',activeCity:'all',isActiveJob:j=>j.jobStatus!=='expired',canonicalCompany:x=>x,norm:x=>x,cityOf:j=>j.city,jobId:x=>x,seenAt:j=>j.age,placeAt:j=>j.age,ageDays:x=>x,ageMatch:(sel,age)=>sel==='all'||age>=1&&age<=7};
  const context=vm.createContext(c);
  vm.runInContext(app.slice(app.indexOf('function countLoadedActiveJobs(){'),app.indexOf('function updateJobCount(count){')),context);
  assert.equal(context.countLoadedActiveJobs(),3);
  c.blocked.add('OTHER');assert.equal(context.countLoadedActiveJobs(),2);
  c.blockedKw.add('risk');assert.equal(context.countLoadedActiveJobs(),1);
  c.blockedKw.clear();c.searchEl.value='hong kong';assert.equal(context.countLoadedActiveJobs(),1);
  c.searchEl.value='';c.activeRegion='CN';assert.equal(context.countLoadedActiveJobs(),1);
  c.ageEl.value='1-7';assert.equal(context.countLoadedActiveJobs(),0);
  c.ageEl.value='all';c.activeRegion='all';c.activeCity='Hong Kong';c.companyEl.value='ACME';c.favOnly=true;assert.equal(context.countLoadedActiveJobs(),1);
  Object.assign(c,{keepLatestSameCityTitle:jobs=>jobs,updateJobCount:n=>events.push(['count',n]),requestAnimationFrame:fn=>{events.push(['frame']);fn();},setTimeout:fn=>{events.push(['yield']);fn();}});
  const start=app.indexOf('if(!Array.isArray(data))data=[];',app.indexOf('jobsDataPromise\n'));
  const end=app.indexOf('const activeData=data.filter(isActiveJob);',start);
  await vm.runInContext('(async data=>{'+app.slice(start,end)+'})',context)(rows);
  assert.deepEqual(events,[['count',1],['frame'],['yield']]);
});
