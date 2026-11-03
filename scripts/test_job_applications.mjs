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
