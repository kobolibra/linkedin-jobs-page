import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const rowFixes = fs.readFileSync(new URL('../row-fixes.js', import.meta.url), 'utf8');
class Classes {
  constructor(values=[]) { this.values=new Set(values); }
  contains(v) { return this.values.has(v); }
  toggle(v,on=!this.contains(v)) { on?this.values.add(v):this.values.delete(v); return on; }
  add(v) { this.values.add(v); }
  remove(v) { this.values.delete(v); }
}
const element = (value='all') => ({value,style:{display:''},dataset:{},classList:new Classes(),events:{},textContent:'',
  contains(){return true;},addEventListener(name,fn){this.events[name]=fn;},setAttribute(name,v){this[name]=v;},parentElement:{classList:new Classes()}});
function card(id, region='CN', status='active', title='analyst') {
  return {dataset:{id,region,status,comp:'Bank',city:'Shanghai',title,search:title+' bank shanghai',age:'1'},
    style:{display:''},classList:new Classes(),_coData:{status,region}};
}
function section(cards,key='2026-10-11',continuation=false) {
  const s={dataset:{dayKey:key,dayLabel:key},style:{display:'',height:'',minHeight:''},_jobCards:cards,_favoriteCards:new Set(),
    _regionCounts:{CN:0,HK:0,SG:0,OTHER:0},_regionActiveCounts:{CN:0,HK:0,SG:0,OTHER:0},_activeCount:0,
    count:{textContent:''},hasHead:!continuation,generated:false};
  cards.forEach(c=>{s._regionCounts[c.dataset.region]++;if(c.dataset.status!=='expired'){s._activeCount++;s._regionActiveCounts[c.dataset.region]++;}});
  s.querySelectorAll=()=>s.generated?[{remove(){s.generated=false;s.hasHead=false;}}]:[];
  s.querySelector=selector=>selector==='.day-head'?(s.hasHead?{querySelector:()=>s.count}:null):s.count;
  s.insertAdjacentHTML=()=>{s.hasHead=true;s.generated=true;};
  return s;
}
function harness(sections=[]) {
  const c={Set,Map,window:{},CustomEvent:class{},document:{getElementById(){return element();},dispatchEvent(){}},
    jobsEl:element(),emptyEl:element(),searchEl:element(''),companyEl:element(),ageEl:element(),cityEl:element(),
    favEl:element(),compClear:element(),regionsEl:{querySelectorAll:()=>[]},activeCountEl:element(),activeOnlyEl:element(),
    blocked:new Set(),blockedKw:new Set(),favs:new Set(),daySections:sections,filteredCards:new Set(),
    activeRegion:'all',activeCity:'all',activeOnly:false,favOnly:false,simpleFilterActive:true,renderReady:true,loadedJobs:null,
    REGIONS:{CN:{},HK:{},SG:{},OTHER:{}},esc:s=>s,canonicalCompany:s=>s,norm:s=>s,cityOf:j=>j.city||'Shanghai',
    isActiveJob:j=>j.jobStatus!=='expired',seenAt:j=>j.firstSeen,placeAt:j=>j.pushTime||j.firstSeen,jobId:s=>s,ageDays:()=>1,ageMatch:(sel,d)=>sel==='all'||sel==='0'&&d===0||sel==='1-7'&&d>=1&&d<=7,
    clearTimeout(){},cancelAnimationFrame(){},setTimeout(){},requestAnimationFrame(){},coRecords:[],
    saveFavs(){},renderCo(name,records){c.coRecords=records;}};
  vm.createContext(c);
  const controls=app.slice(app.indexOf('favEl.addEventListener("click"'),app.indexOf('const setRegion='));
  const filtering=app.slice(app.indexOf('function countLoadedActiveJobs(){'),app.indexOf('document.addEventListener("keydown"',app.indexOf('function refreshFavoriteFilterView(){')));
  const clicks=app.slice(app.indexOf('jobsEl.addEventListener("click",e=>{'),app.indexOf('jobsEl.addEventListener("keydown",e=>',app.indexOf('jobsEl.addEventListener("click",e=>{')));
  vm.runInContext(controls+'\n'+filtering+'\n'+clicks,c);
  return c;
}
test('favorite control responds before data/rendering and preserves its loading-time choice',()=>{
  const c=harness();c.renderReady=false;
  c.favEl.events.click();assert.equal(c.favOnly,true);assert.equal(c.favEl.classList.contains('active'),true);assert.equal(c.jobsEl.classList.contains('fav-only'),true);
  c.loadedJobs=[{link:'saved',title:'analyst',company:'Bank',location:'CN',firstSeen:'2026-10-11',jobStatus:'active'}];
  c.favs.add('saved');c.apply();assert.equal(c.activeCountEl.textContent,1);
  const saved=card('saved');const s=section([saved]);s._favoriteCards.add(saved);c.daySections=[s];c.renderReady=true;
  c.apply();assert.equal(c.activeCountEl.textContent,1);assert.equal(c.favOnly,true);
});
test('simple favorite/region toggles never inspect unsaved cards in a 12000-row list',()=>{
  const a=card('saved','CN'),b=card('closed','HK','expired'),s=section([a,b]);
  s._favoriteCards.add(a);s._favoriteCards.add(b);
  // A large unsaved list is deliberately unreadable: the fast path must use cached totals.
  s._jobCards=new Proxy({length:12000},{get(target,key){if(key==='length')return 12000;throw Error('Unnecessary full-card scan: '+String(key));}});
  const c=harness([s]);c.favEl.events.click();assert.equal(c.activeCountEl.textContent,1);assert.equal(c.emptyEl.classList.contains('show'),false);
  c.activeRegion='HK';c.apply();assert.equal(c.activeCountEl.textContent,0);assert.equal(s.style.display,''); // closed favorite is still shown
  c.activeRegion='all';c.favEl.events.click();assert.equal(c.activeCountEl.textContent,1);assert.equal(s.style.display,'');
});
test('entering Saved clears a previously selected age cohort so older saved roles stay visible',()=>{
 const a=card('saved-oct'),b=card('saved-aug'),s=section([a,b]);
 s._favoriteCards.add(a);s._favoriteCards.add(b);
 const c=harness([s]);c.favs.add('saved-oct');c.favs.add('saved-aug');
 c.ageEl.value='15-21';c.favEl.events.click();
 assert.equal(c.ageEl.value,'all','saved mode must not inherit a stale 15-21 day cohort');
 assert.equal(c.favOnly,true);assert.equal(c.activeCountEl.textContent,2);
 c.ageEl.value='0';c.apply();assert.equal(c.activeCountEl.textContent,0,'explicit filtering within Saved still works');
});
test('favorites remain correct after search changes while favorite mode is enabled',()=>{
  const a=card('saved','CN','active','analyst'),b=card('other','CN','active','engineer'),s=section([a,b]);
  s._favoriteCards.add(a);const c=harness([s]);c.favs.add('saved');c.searchEl.value='analyst';c.apply();
  c.favEl.events.click();assert.equal(c.activeCountEl.textContent,1);
  c.searchEl.value='engineer';c.apply();assert.equal(c.activeCountEl.textContent,0);
  c.favEl.events.click();assert.equal(c.activeCountEl.textContent,1);assert.equal(b.style.display,'');
  c.searchEl.value='';c.apply();assert.equal(c.activeCountEl.textContent,2);assert.equal(s.style.display,'');
});
test('personal blocked companies and keyword/time/active filters still constrain favorites',()=>{
  const a=card('saved'),b=card('closed','CN','expired'),s=section([a,b]);s._favoriteCards.add(a);s._favoriteCards.add(b);
  const c=harness([s]);c.favs.add('saved');c.favs.add('closed');c.favEl.events.click();
  c.blocked.add('Bank');c.apply();assert.equal(c.activeCountEl.textContent,0);assert.equal(s.style.display,'none');
  c.blocked.clear();c.activeOnly=true;c.apply();assert.equal(c.activeCountEl.textContent,1);assert.equal(b.style.display,'none');
  c.activeOnly=false;c.ageEl.value='0';c.apply();assert.equal(c.activeCountEl.textContent,0);
  c.ageEl.value='all';c.blockedKw.add('analyst');c.apply();assert.equal(c.activeCountEl.textContent,0);
  c.blockedKw.clear();c.apply();assert.equal(c.activeCountEl.textContent,1);assert.equal(b.style.display,'');
});
test('a favorite in a continuation retains a date heading and totals after repeated toggles',()=>{
  const a=card('other'),b=card('saved'),s1=section([a]),s2=section([b],'2026-10-11',true);s2._favoriteCards.add(b);
  const c=harness([s1,s2]);c.favEl.events.click();assert.equal(s1.style.display,'none');assert.equal(s2.hasHead,true);assert.equal(s2.count.textContent,'Σ=1');
  c.favEl.events.click();assert.equal(s1.style.display,'');assert.equal(s2.generated,false);assert.equal(s1.count.textContent,'Σ=2');
  c.favEl.events.click();assert.equal(s2.hasHead,true);assert.equal(s2.count.textContent,'Σ=1');
});
test('all date-heading paths format active counts as Σ=N',()=>{
 const view=fs.readFileSync(new URL('../list-view.js',import.meta.url),'utf8');
 assert.equal((app.match(/data-role="daycount">Σ='/g)||[]).length,3,
   'fallback initial, fast filter and full filter headings use the same symbol');
 assert.equal((app.match(/c.textContent="Σ="\+/g)||[]).length,2,
   'fast and full filter updates retain the sigma prefix');
 assert.equal((view.match(/data-role="daycount">Σ='/g)||[]).length,1,
   'virtualized day heading uses the same symbol');
 assert.doesNotMatch(app,/ 个有效职位/);
 assert.doesNotMatch(view,/ 个有效职位/);
});
test('each star click synchronizes both device buttons and the favorite index',()=>{
  const a=card('saved'),s=section([a]),c=harness([s]),buttons=[element(),element()];
  a.closest=()=>s;a.querySelectorAll=()=>buttons;
  const event={preventDefault(){},target:{closest:selector=>selector==='.job'?a:selector==='.star'?buttons[0]:null}};
  c.jobsEl.events.click(event);
  assert.equal(c.favs.has('saved'),true);assert.equal(s._favoriteCards.has(a),true);
  for(const b of buttons){assert.equal(b.classList.contains('on'),true);assert.equal(b['aria-pressed'],'true');}
  c.favEl.events.click();assert.equal(c.activeCountEl.textContent,1);
  c.jobsEl.events.click(event);
  assert.equal(c.favs.has('saved'),false);assert.equal(s._favoriteCards.size,0);assert.equal(c.activeCountEl.textContent,0);
  for(const b of buttons){assert.equal(b.classList.contains('on'),false);assert.equal(b['aria-pressed'],'false');}
});
function badgeHarness(n=3842) {
  const reads=[],writes=[],frames=[],events={},media={matches:true};
  const jobs=Array.from({length:n},(_,i)=>{
    const style=new Proxy({top:'',right:''},{set(o,k,v){writes.push(i);o[k]=v;return true;}});
    const badge={style,get offsetHeight(){reads.push(i);return 20;}};
    const sub={getBoundingClientRect(){reads.push(i);return {top:40+i*80,height:20};}};
    const right={getBoundingClientRect(){reads.push(i);return {right:392};}};
    const line={lastElementChild:badge,appendChild(){throw Error('Unexpected move');}};
    badge.parentElement=line;
    return {isConnected:true,querySelector(s){return s==='.status-expired-company'?badge:s==='.job-meta-line'?line:s==='.job-sub'?sub:right;},
      getBoundingClientRect(){reads.push(i);assert.equal(writes.length,0,'all geometry reads precede writes');return {top:i*80,right:400};}};
  });
  const list={nodeType:1,matches:()=>false,querySelectorAll:()=>jobs};
  let io;
  const c={Set,WeakSet,Math,requestAnimationFrame:fn=>frames.push(fn),IntersectionObserver:class{constructor(fn){io=this;this.fn=fn;this.observed=[];}observe(job){this.observed.push(job);}},
    MutationObserver:class{observe(){}},window:{matchMedia:()=>media,addEventListener:(n,fn)=>events[n]=fn},
    document:{body:{},readyState:'complete',getElementById:()=>list,addEventListener:(n,fn)=>events[n]=fn}};
  vm.runInNewContext(rowFixes,c);
  return {jobs,io,reads,writes,events,media,flush(){while(frames.length)frames.shift()();}};
}
test('3842 offscreen closed rows cause no geometry reads; only intersecting rows are measured',()=>{
  const h=badgeHarness();assert.equal(h.io.observed.length,3842);h.flush();assert.equal(h.reads.length,0);
  h.io.fn(h.jobs.map(job=>({target:job,isIntersecting:false})));h.flush();assert.equal(h.reads.length,0);
  h.io.fn([{target:h.jobs[1],isIntersecting:true},{target:h.jobs[5],isIntersecting:true}]);h.flush();
  assert.deepEqual([...new Set(h.reads)],[1,5]);assert.deepEqual(h.writes,[1,1,5,5]);
  h.reads.length=0;h.writes.length=0;h.events.resize();h.flush();assert.deepEqual([...new Set(h.reads)],[1,5]);assert.equal(h.writes.length,0);
});
test('mobile and rows leaving the viewport do not trigger hidden geometry work',()=>{
  const h=badgeHarness(2);h.media.matches=false;h.io.fn([{target:h.jobs[0],isIntersecting:true}]);h.flush();assert.equal(h.reads.length,0);
  h.io.fn([{target:h.jobs[0],isIntersecting:false}]);h.writes.length=0;h.media.matches=true;h.events.jobsfilterchange();h.flush();assert.equal(h.reads.length,0);
});
