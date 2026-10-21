import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../auth-guest.js',import.meta.url),'utf8');
function fixture(){
 const nodes=[],handlers={},stored={},navigated=[];
 const element=tag=>{const x={tag,children:[],dataset:{},style:{setProperty(){}},classList:{add(){}},setAttribute(){},append(...xs){this.children.push(...xs)},getBoundingClientRect:()=>({width:142}),querySelector(){return this.link??=element('a')},after(x){nodes.push(x)}};nodes.push(x);return x};
 const shell=element('div'),content=element('div'),theme=element('button');
 const document={createElement:element,querySelector:q=>q==='.shell'?shell:q==='.content-row'?content:q.includes('.seg.active')?{dataset:{region:'HK'}}:null,getElementById:id=>id==='themeToggle'?theme:null,addEventListener:(name,fn)=>handlers[name]=fn};
 const context={document,window:{},location:{assign:url=>navigated.push(url)},sessionStorage:{setItem:(k,v)=>stored[k]=JSON.parse(v)},addEventListener(){},Date,scrollY:530,ResizeObserver:class{observe(){}}};
 vm.runInNewContext(source,context);context.window.AuthGuest.install();return {nodes,handlers,stored,navigated};
}
test('top and bottom entry use the same login page and retain the browsing region',()=>{
 const f=fixture(),top=f.nodes.find(n=>n.className==='auth-guest-sign'),gate=f.nodes.find(n=>n.className==='auth-guest-gate');
 assert.equal(top.tag,'a');assert.equal(top.href,'/login?next=%2F');assert.ok(gate.innerHTML.includes('href="'+top.href+'"'));
 assert.ok(gate.innerHTML.includes('Sign in to access all roles'));assert.ok(!gate.innerHTML.includes('<h2>'));assert.ok(!gate.innerHTML.includes('Google'));
 top.onclick();assert.equal(f.stored['finance-preview-intent'].region,'HK');assert.equal(f.stored['finance-preview-state'].scroll,530);
 assert.ok(!f.nodes.some(n=>n.tag==='dialog'));assert.ok(!source.includes('/auth/start/'));
});
test('gated job details preserve the role and navigate to that same login page',()=>{
 const f=fixture(),card={dataset:{id:'ln:42',region:'SG'},querySelector:()=>({textContent:'Analyst'})};
 const target={matches:()=>false,closest:q=>q==='.job'?card:target};let prevented=false;
 f.handlers.click({target:{closest:()=>target},preventDefault(){prevented=true},stopImmediatePropagation(){}});
 assert.ok(prevented);assert.equal(f.navigated[0],'/login?next=%2F');assert.equal(f.stored['finance-preview-intent'].id,'ln:42');assert.equal(f.stored['finance-preview-intent'].action,'details');
});
