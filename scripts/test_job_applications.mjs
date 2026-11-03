import test from 'node:test';
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
