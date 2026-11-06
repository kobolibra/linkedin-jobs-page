import test from 'node:test';
import {palettes,roles} from './journey_palette_trials.mjs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {validApplicationItem} from '../account-preferences.mjs';
const scope={};vm.runInNewContext(readFileSync(new URL('../job-applications.js',import.meta.url),'utf8'),scope);
const {transition,index,graph,svg,valid}=scope.JobApplications;
const plain=x=>JSON.parse(JSON.stringify(x));
let n=0;
const change=(old,stage,job='ln:123')=>transition(old,stage,{job,id:'test_event_'+String(++n).padStart(16,'0'),time:1000+n});
test('forward stages retain the exact recorded route; rejection retains its origin',()=>{
 let state=change(null,'applied');state=change(state,'first');state=change(state,'final');state=change(state,'rejected');
 assert.deepEqual(plain(state.p),['applied','first','final']);assert.equal(state.s,'rejected');
 const g=graph(['ln:123'],new Map([['ln:123',state]]));
 assert.equal(g.nodes.some(n=>n.id==='second'),false);assert.equal(g.links.find(l=>l.target==='rejected:final').source,'final');
});
test('corrections and reopening truncate the effective route, without removing immutable history',()=>{
 const events=[];let state;
 for(const stage of ['applied','first','second','rejected','first','offer','saved']){state=change(state,stage);events.push(JSON.stringify(state));}
 assert.equal(index(events).get('ln:123').s,'saved');assert.deepEqual(plain(state.p),[]);assert.equal(events.length,7);
 const earlier=JSON.parse(events[4]);assert.deepEqual(earlier.p,['applied','first']);
});
test('offline events merge deterministically across devices and duplicate delivery does not double count',()=>{
 const a=change(null,'applied'),b=change(null,'first');b.t=a.t;
 const left=index([JSON.stringify(a),JSON.stringify(b),JSON.stringify(a)]),right=index([JSON.stringify(b),JSON.stringify(a)]);
 assert.equal(left.get('ln:123').id,right.get('ln:123').id);assert.equal(left.size,1);
 const c=transition(left.get('ln:123'),'offer',{job:'ln:123',id:'clock_skew_event_1234',time:0});assert.ok(c.t>left.get('ln:123').t);
});
test('graph conserves flow for mixed states and counts only unique favorites, including missing or expired jobs',()=>{
 const favorites=['saved','applied','first','second','final','offer','rejected','rejected-before','expired','offer-then-rejected'];
 const states=new Map();for(const s of ['applied','first','second','final','offer'])states.set(s,change(null,s,s));
 states.set('rejected',change(change(null,'first','rejected'),'rejected','rejected'));
 states.set('rejected-before',change(null,'rejected','rejected-before'));
 states.set('expired',change(null,'applied','expired'));
 states.set('offer-then-rejected',change(change(null,'offer','offer-then-rejected'),'rejected','offer-then-rejected'));
 states.set('not-favorited',change(null,'offer','not-favorited'));
 const g=graph([...favorites,'saved'],states);assert.equal(g.total,10);assert.equal(g.counts.offer,1);
 for(const node of g.nodes){const incoming=g.links.filter(l=>l.target===node.id).reduce((s,l)=>s+l.value,0),outgoing=g.links.filter(l=>l.source===node.id).reduce((s,l)=>s+l.value,0);if(incoming&&outgoing)assert.equal(incoming,outgoing,node.id);}
 assert.equal(g.links.filter(l=>l.source==='saved').reduce((s,l)=>s+l.value,0),10);
 assert.equal(g.nodes.filter(n=>!g.links.some(l=>l.source===n.id)).reduce((s,n)=>s+n.value,0),10);
 assert.ok(!/NaN|Infinity/.test(svg(g)));assert.match(svg(g),/viewBox/);
});
test('the server and client reject malformed stages, paths and timestamps',()=>{
 const event=change(null,'first');assert.ok(validApplicationItem(JSON.stringify(event)));assert.ok(valid(event));
 for(const override of [{s:'admin'},{p:['second','first']},{p:['applied']},{s:'saved'},{t:-1},{j:'\njob'},{id:'short'},{t:Infinity},{p:['first','first']}]){const e={...event,...override};assert.equal(valid(e),false,JSON.stringify(override));assert.equal(validApplicationItem(JSON.stringify(e)),false);}
 assert.equal(index(['bad','null',JSON.stringify({...event,s:'bad'})]).size,0);
});
test('empty accounts have a real empty state, without sample applications',()=>{
 const g=graph([],new Map());assert.equal(g.total,0);assert.equal(g.nodes.length,0);assert.equal(svg(g),'');
});

test('recruiter contact follows Applied and No Response preserves its last recorded stage',()=>{
 let state=change(change(null,'applied'),'contact');state=change(state,'no_response');
 assert.deepEqual(plain(state.p),['applied','contact']);assert.equal(state.s,'no_response');
 const g=graph(['ln:123'],new Map([['ln:123',state]]));assert.equal(g.applied,1);assert.equal(g.counts.no_response,1);
 assert.equal(g.links.find(l=>l.target==='no_response:contact').source,'contact');
 state=change(state,'first');assert.deepEqual(plain(state.p),['applied','contact','first']);assert.equal(state.s,'first');
 assert.ok(validApplicationItem(JSON.stringify(state)));
});

test('regions form a breakdown of the full saved-role total, with unknown data kept explicit',()=>{
 const states=new Map([
  ['cn',change(null,'applied','cn')],
  ['hk',transition(null,'contact',{job:'hk',id:'regional_event_hk123',region:'HK',time:100})],
  ['sg',transition(null,'offer',{job:'sg',id:'regional_event_sg123',region:'SG',time:100})],
  ['missing',change(null,'no_response','missing')]
 ]);
 const regions=new Map([['cn','CN'],['hk','SG']]);
 const g=graph(['cn','hk','sg','missing'],states,{regions});
 assert.deepEqual(plain(g.regionCounts),{CN:1,HK:0,SG:2,OTHER:0,UNKNOWN:1});
 assert.equal(g.nodes.find(n=>n.id==='region:SG').value,2);
 const sourceTotal=g.nodes.filter(n=>n.type==='region').reduce((sum,n)=>sum+n.value,0);
 assert.equal(sourceTotal,g.total);assert.equal(g.total,4);assert.equal(g.applied,3);
 assert.equal(g.nodes.find(n=>n.id==='region:UNKNOWN').value,1);
});

test('new paths round-trip through server validation and old event payloads remain valid',()=>{
 let state=transition(null,'applied',{job:'ln:123',id:'full_path_event_123',region:'CN',time:1});
 for(const stage of ['contact','first','second','final','offer','no_response','rejected']){state=change(state,stage);assert.ok(valid(state));assert.ok(validApplicationItem(JSON.stringify(state)));}
 assert.deepEqual(plain(state.p),['applied','contact','first','second','final','offer']);
 assert.equal(state.r,'CN');
 const old={v:1,id:'legacy_event_123456',j:'ln:old',s:'rejected',p:['applied','first'],t:100};
 assert.ok(valid(old));assert.ok(validApplicationItem(JSON.stringify(old)));
 assert.equal(valid({...old,r:'invented'}),false);assert.equal(validApplicationItem(JSON.stringify({...old,r:'invented'})),false);
});

test('regional layout conserves widths and keeps all labels inside the SVG in dense mixed states',()=>{
 const states=new Map(),favorites=[];const stages=['saved','applied','contact','first','second','final','offer','no_response','rejected'];
 for(let i=0;i<90;i++){const j='job:'+i;favorites.push(j);let state=transition(null,'applied',{job:j,id:'dense_event_'+String(i).padStart(16,'0'),region:['CN','HK','SG','OTHER','UNKNOWN'][i%5],time:100});
  for(const step of ['contact','first','second','final','offer'].slice(0,i%6))state=change(state,step,j);
  if(['saved','no_response','rejected'].includes(stages[i%9]))state=change(state,stages[i%9],j);states.set(j,state);
 }
 const g=graph(favorites,states),drawing=scope.JobApplications.layout(g);
 for(const node of drawing.nodes){assert.ok(node.y>=43,node.id);assert.ok(node.x+150<=drawing.width,node.id);assert.ok(node.y+node.h<drawing.height);}
 for(const node of g.nodes){const incoming=g.links.filter(l=>l.target===node.id).reduce((s,l)=>s+l.value,0),outgoing=g.links.filter(l=>l.source===node.id).reduce((s,l)=>s+l.value,0);if(incoming&&outgoing)assert.equal(incoming,outgoing,node.id);}
 assert.ok(!/NaN|Infinity/.test(svg(g)));
});

test('region ownership uses the same active/newest duplicate resolution as the actual job list',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const dedup=app.slice(app.indexOf('const keepLatestSameCityTitle=data=>{'),app.indexOf('function renderTop50('));
 scope.jobId=scope.JobApplications.jobKey;scope.isActiveJob=job=>job.jobStatus!=='expired';
 vm.runInNewContext(dedup+'globalThis.keepLatestSameCityTitle=keepLatestSameCityTitle;',scope);
 const link='https://www.linkedin.com/jobs/view/4000000000';
 const rows=[{link,location:'CN',pushTime:'2026-11-01',jobStatus:'active'},{link,location:'SG',pushTime:'2026-11-03',jobStatus:'expired'}];
 assert.equal(scope.JobApplications.regionIndex(rows).get('ln:4000000000'),'CN');
 rows.push({link,location:'HK',pushTime:'2026-11-02',jobStatus:'active'});
 assert.equal(scope.JobApplications.regionIndex(rows).get('ln:4000000000'),'HK');
 assert.equal(scope.JobApplications.regionIndex([...rows].reverse()).get('ln:4000000000'),'HK');
});

test('compact landscape layout preserves counts and routes while reducing drawing dimensions',()=>{
 const favorites=[],states=new Map();
 for(let i=0;i<60;i++){const j='fit:'+i;favorites.push(j);let state=transition(null,'applied',{job:j,id:'compact_event_'+String(i).padStart(16,'0'),region:['CN','HK','SG'][i%3],time:100});
  for(const stage of ['contact','first','second','final','offer'].slice(0,i%6))state=change(state,stage,j);
  if(i%4===0)state=change(state,'no_response',j);if(i%7===0)state=change(state,'rejected',j);states.set(j,state);
 }
 const data=graph(favorites,states),before=JSON.stringify(data),full=scope.JobApplications.layout(data),compact=scope.JobApplications.layout(data,{compact:true});
 assert.ok(compact.width<full.width);assert.ok(compact.height<full.height);
 assert.equal(JSON.stringify(data),before);assert.deepEqual(plain(compact.links.map(l=>[l.source,l.target,l.value])),plain(full.links.map(l=>[l.source,l.target,l.value])));
 for(const node of compact.nodes){assert.ok(node.x>=0&&node.x+compact.nodeWidth<=compact.width);assert.ok(node.y>=0);assert.ok(node.y+node.h<compact.height);}
 const figure=svg(data,{compact:true});assert.match(figure,/ap-compact-svg/);assert.doesNotMatch(figure,/min-width:/);assert.match(figure,/preserveAspectRatio="xMidYMid meet"/);
});

test('Sankey ribbons carry process tones and distinguish terminal branches',()=>{
 const states=new Map();
 const apply=change(null,'applied','p');
 states.set('p',change(apply,'contact','p'));
 states.set('offer',change(null,'offer','offer'));
 states.set('post-offer-reject',change(change(null,'offer','post-offer-reject'),'rejected','post-offer-reject'));
 states.set('reject',change(change(null,'first','reject'),'rejected','reject'));
 states.set('silent',change(change(null,'contact','silent'),'no_response','silent'));
 const view=svg(graph(['p','offer','reject','silent','saved','post-offer-reject'],states));
 for(const tone of ['source','applied','offer','rejected','no_response','waiting']){
  assert.ok(view.includes('stop-color:var(--ap-flow-'+tone+')'),tone+' gradient stop missing');
 }
 assert.match(view,/aria-label="Applied → Recruiter Contact: 1 role"/);
 assert.match(view,/<defs><linearGradient id="ap-ribbon-0"/);
 assert.match(view,/style="fill:url\(#ap-ribbon-0\)"/);
 assert.equal((view.match(/<linearGradient /g)||[]).length,(view.match(/<path class="ap-flow/g)||[]).length);
});
test('Journey-scoped light and dark palettes provide readable, complete state colors',()=>{
 const css=readFileSync(new URL('../job-applications.css',import.meta.url),'utf8');
 const start=css.indexOf('/* EDITORIAL VERMILION');
 assert.ok(start>0);
 const area=css.slice(start);
 const groups=[...area.matchAll(/(?:\[data-theme=dark\]\s*)?\.application-journey\s*\{([^}]+)\}/g)].slice(0,2);
 assert.equal(groups.length,2);
 const value=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 const contrast=(a,b)=>{const w=[.2126,.7152,.0722],x=value(a).reduce((s,v,i)=>s+v*w[i],0),y=value(b).reduce((s,v,i)=>s+v*w[i],0);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
 for(const group of groups){
  const tokens=new Map([...group[1].matchAll(/(--ap-[a-z_-]+):\s*(#[0-9a-f]{6})/gi)].map(m=>[m[1],m[2]]));
  const canvas=tokens.get('--ap-canvas');assert.ok(canvas);
  for(const tone of ['source','applied','contact','first','second','final','offer','no_response','rejected','waiting']){
   const node=tokens.get('--ap-tone-'+tone),flow=tokens.get('--ap-flow-'+tone);
   assert.ok(node&&flow,tone+' theme tokens are incomplete');
   assert.ok(contrast(node,canvas)>=4.5,tone+' text contrast');
  }
 }
 assert.match(area,/\.ap-flow:focus-visible/);
 assert.match(area,/prefers-reduced-motion:reduce/);
});

// This is an exact source-level copy lock against the original pre-redesign UI.
// Any added headline, renamed label, legend copy, or altered explanatory text fails.
test('My Journey text and UI markup match the original pre-design version',()=>{
 const src=readFileSync(new URL('../job-applications.js',import.meta.url),'utf8');
 const actual=src.split('journey.innerHTML=')[1]?.split(';document.body.append(journey)')[0];
 assert.equal(actual,"'<header class=\"ap-journey-head\"><div><h2 id=\"ap-journey-title\">Your application journey</h2></div><dl class=\"ap-kpis\"></dl><button type=\"button\" class=\"ap-close\" aria-label=\"Close application journey\">×</button></header><div class=\"ap-chart\" tabindex=\"0\" aria-label=\"Application flow chart, fitted to the screen.\"></div><div class=\"ap-legend\"><span class=\"ap-key-progress\">Applied</span><span class=\"ap-key-contact\">Recruiter Contact</span><span class=\"ap-key-interviews\">Interviews</span><span class=\"ap-key-waiting\">In progress / Not applied</span><span class=\"ap-key-offer\">Offer</span><span class=\"ap-key-no-response\">No Response</span><span class=\"ap-key-rejected\">Rejected</span></div><details class=\"ap-accessible-data\"><summary>Current stage breakdown</summary><dl class=\"ap-stage-summary\"></dl></details><footer>Private to your account · Widths show role counts; percentages use saved roles in this view.</footer>'");
 assert.doesNotMatch(actual,/THE APPLICATION ATLAS|Every saved role\. Every recorded step\./);
});

test('selected Editorial Vermilion CSS agrees with original-copy-locked design tokens',()=>{
 const css=readFileSync(new URL('../job-applications.css',import.meta.url),'utf8');
 const start=css.indexOf('/* EDITORIAL VERMILION');
 assert.ok(start>=0);
 const blocks=[...css.slice(start).matchAll(/(?:\[data-theme=dark\]\s*)?\.application-journey\s*\{([^}]+)\}/g)].slice(0,2);
 assert.equal(blocks.length,2,'full light/dark palette required');
 for(const [i,mode] of ['light','dark'].entries()){
  const expected=palettes.vermilion[mode],actual=new Map([...blocks[i][1].matchAll(/(--ap-[a-z_-]+):\s*(#[0-9a-f]{6})/gi)].map(m=>[m[1],m[2].toUpperCase()]));
  for(const role of roles)for(const prefix of ['--ap-tone-','--ap-flow-']){
   const token=prefix+role;
   assert.equal(actual.get(token),expected[token].toUpperCase(),mode+' '+token);
  }
  for(const token of ['--ap-canvas','--ap-heading','--ap-figure-secondary','--ap-paper-border']){
   assert.equal(actual.get(token),expected[token].toUpperCase(),mode+' '+token);
  }
  for(const stage of ['contact','first','second','final']){
   assert.equal(actual.get('--ap-flow-'+stage),actual.get('--ap-flow-applied'),'mainline must not change hue');
   assert.equal(actual.get('--ap-tone-'+stage),actual.get('--ap-tone-applied'),'stage node must share one semantic color');
  }
 }
});
