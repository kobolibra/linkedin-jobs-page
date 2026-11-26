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
 for(const tone of ['source_unknown','applied','contact','first','offer','rejected','no_response','waiting']){
  assert.ok(view.includes('style="fill:var(--ap-flow-'+tone+')"'),tone+' solid-flow tone missing');
 }
 assert.match(view,/aria-label="Applied → Recruiter Contact: 1 role"/);
 assert.doesNotMatch(view,/<linearGradient|ap-flow-paper-grain|ap-ribbon-engraving/);
 assert.match(view,/style="fill:var\(--ap-flow-applied\)"/);
 assert.ok((view.match(/<path class="ap-flow/g)||[]).length>0);
});
test('My Journey original 2026-11-06 morning palette is restored byte-for-byte',()=>{
 const css=readFileSync(new URL('../job-applications.css',import.meta.url),'utf8');
 const original="/* Journey figure only: mineral hues distinguish stages without changing list/editor colors. */\n.application-journey{\n --ap-tone-source:#65737d;--ap-flow-source:#c6cfd2;\n --ap-tone-applied:#326da8;--ap-flow-applied:#a4bfd5;\n --ap-tone-contact:#227b79;--ap-flow-contact:#9dc7bf;\n --ap-tone-first:#6669a5;--ap-flow-first:#b9b6d7;\n --ap-tone-second:#90682d;--ap-flow-second:#d1be98;\n --ap-tone-final:#895174;--ap-flow-final:#c2a4bc;\n --ap-tone-offer:#307957;--ap-flow-offer:#9bc7ac;\n --ap-tone-no_response:#766957;--ap-flow-no_response:#ccc3b3;\n --ap-tone-rejected:#b05249;--ap-flow-rejected:#dba49b;\n --ap-tone-waiting:#5d707b;--ap-flow-waiting:#d5dde0;\n}\n[data-theme=dark] .application-journey{\n --ap-tone-source:#afbdc7;--ap-flow-source:#526570;\n --ap-tone-applied:#9fc7ed;--ap-flow-applied:#466f96;\n --ap-tone-contact:#8fd1c4;--ap-flow-contact:#3e7d76;\n --ap-tone-first:#bcbdec;--ap-flow-first:#686b9b;\n --ap-tone-second:#e0c18a;--ap-flow-second:#877750;\n --ap-tone-final:#dda9ca;--ap-flow-final:#925f81;\n --ap-tone-offer:#9bd6b1;--ap-flow-offer:#4e8565;\n --ap-tone-no_response:#cfc3af;--ap-flow-no_response:#786f60;\n --ap-tone-rejected:#f0afa2;--ap-flow-rejected:#a36860;\n --ap-tone-waiting:#b3c0c8;--ap-flow-waiting:#425864;\n}\n.application-journey .ap-legend .ap-key-interviews::before{background:linear-gradient(90deg,var(--ap-tone-first) 0% 33.33%,var(--ap-tone-second) 33.33% 66.67%,var(--ap-tone-final) 66.67% 100%)}\n\n.application-journey footer{color:#65757e}\n[data-theme=dark] .application-journey footer{color:#aebcc5}";
 assert.ok(css.includes(original),'original node, ribbon, legend and light/dark declarations changed');
 const blocks=[...original.matchAll(/(?:\[data-theme=dark\]\s*)?\.application-journey\s*\{([^}]+)\}/g)].slice(0,2);
 assert.equal(blocks.length,2);
 const value=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 const contrast=(a,b)=>{const w=[.2126,.7152,.0722],x=value(a).reduce((s,v,i)=>s+v*w[i],0),y=value(b).reduce((s,v,i)=>s+v*w[i],0);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
 for(const [i,block] of blocks.entries()){
  const tokens=new Map([...block[1].matchAll(/(--ap-[a-z_-]+):\s*(#[0-9a-f]{6})/gi)].map(m=>[m[1],m[2]]));
  const canvas=i?'#192a37':'#f6f6f4';
  for(const tone of ['source','applied','contact','first','second','final','offer','no_response','rejected','waiting']){
   assert.ok(tokens.get('--ap-flow-'+tone),tone+' flow missing');
   assert.ok(contrast(tokens.get('--ap-tone-'+tone),canvas)>=4.5,tone+' node contrast');
  }
 }
 assert.match(css,/\.ap-flow:focus-visible/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});

// This is an exact source-level copy lock against the original pre-redesign UI.
// Any added headline, renamed label, legend copy, or altered explanatory text fails.
test('My Journey text and UI markup match the original pre-design version',()=>{
 const src=readFileSync(new URL('../job-applications.js',import.meta.url),'utf8');
 const actual=src.split('journey.innerHTML=')[1]?.split(';document.body.append(journey)')[0];
 assert.equal(actual,"'<header class=\"ap-journey-head\"><div><h2 id=\"ap-journey-title\">Your application journey</h2></div><dl class=\"ap-kpis\"></dl><button type=\"button\" class=\"ap-close\" aria-label=\"Close application journey\">×</button></header><div class=\"ap-chart\" tabindex=\"0\" aria-label=\"Application flow chart, fitted to the screen.\"></div><div class=\"ap-legend\"><span class=\"ap-key-progress\">Applied</span><span class=\"ap-key-contact\">Recruiter Contact</span><span class=\"ap-key-interviews\">Interviews</span><span class=\"ap-key-waiting\">In progress / Not applied</span><span class=\"ap-key-offer\">Offer</span><span class=\"ap-key-no-response\">No Response</span><span class=\"ap-key-rejected\">Rejected</span></div><details class=\"ap-accessible-data\"><summary>Current stage breakdown</summary><dl class=\"ap-stage-summary\"></dl></details><footer>Private to your account · Widths show role counts; percentages use saved roles in this view.</footer>'");
 assert.doesNotMatch(actual,/THE APPLICATION ATLAS|Every saved role\. Every recorded step\./);
});

test('Original destination-stage ribbon colors restored',()=>{
 const src=readFileSync(new URL('../job-applications.js',import.meta.url),'utf8');
 assert.match(src,/const flowTone=tone\(a\.type==='region'\?a:b\)/);
 const states=new Map();
 states.set('contact',change(change(null,'applied','contact'),'contact','contact'));
 states.set('first',change(change(null,'applied','first'),'first','first'));
 const drawn=svg(graph(['contact','first'],states));
 assert.match(drawn,/style="fill:var\(--ap-flow-contact\)"/);
 assert.match(drawn,/style="fill:var\(--ap-flow-first\)"/);
});
test('Restored figure has no unrelated decorative overlays',()=>{
 const css=readFileSync(new URL('../job-applications.css',import.meta.url),'utf8');
 const js=readFileSync(new URL('../job-applications.js',import.meta.url),'utf8');
 assert.doesNotMatch(js,/ap-ribbon-engraving|ap-flow-paper-grain|<linearGradient/);
 assert.match(css,/--ap-flow-applied:#a4bfd5/);
 assert.match(css,/--ap-tone-applied:#326da8/);
});


test('My Journey matches the existing site regional, Porcelain and Top 30 colors',()=>{
 const css=readFileSync(new URL('../job-applications.css',import.meta.url),'utf8');
 const site=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 const refinement=readFileSync(new URL('../styles-refinement.css',import.meta.url),'utf8');
 const top30=readFileSync(new URL('../top30-layout.js',import.meta.url),'utf8');
 const start=css.lastIndexOf('/* SITE-NATIVE / Porcelain + Regional Density + Top 30');
 assert.ok(start>=0,'site-native palette must be last and win cascade');
 const sheet=css.slice(start);
 const blocks=[...sheet.matchAll(/(?:\[data-theme="dark"\]\s*)?\.application-journey\s*\{([^}]+)\}/g)].slice(0,2);
 assert.equal(blocks.length,2);
 const expected=[
  {canvas:'#FBFCFB',source_cn:'#9C2A33',source_hk:'#8A6520',source_sg:'#536F32',source_other:'#357585',source_unknown:'#526F93',source:'#16395A',applied:'#081F5C',contact:'#334EAC',first:'#405D9C',second:'#52679D',final:'#5E6094',offer:'#536F32',no_response:'#8A6520',rejected:'#9C2A33',waiting:'#526F78'},
  {canvas:'#1A2B3A',source_cn:'#DF8B79',source_hk:'#E5BD68',source_sg:'#A9C195',source_other:'#93B4C4',source_unknown:'#AFC5E9',source:'#F5F0E8',applied:'#AFC5E9',contact:'#B5C8F2',first:'#AEC5EC',second:'#BBBEE0',final:'#D2BDD8',offer:'#A9C195',no_response:'#E5BD68',rejected:'#DF8B79',waiting:'#AFBABD'}
 ];
 const luma=h=>h.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const contrast=(a,b)=>{const [x,y]=[luma(a),luma(b)];return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
 for(const [i,block] of blocks.entries()){
  const actual=new Map([...block[1].matchAll(/(--ap-[a-z_-]+):\s*(#[0-9a-f]{6})/gi)].map(m=>[m[1],m[2].toUpperCase()]));
  const e=expected[i];
  assert.equal(actual.get('--ap-canvas'),e.canvas);
  for(const [tone,value] of Object.entries(e)){
   if(tone==='canvas')continue;
   assert.equal(actual.get('--ap-tone-'+tone),value,tone+' node');
   assert.ok(actual.has('--ap-flow-'+tone),tone+' ribbon');
   assert.ok(contrast(value,e.canvas)>=4.5,tone+' node foreground contrast');
  }
  const distinct=['cn','hk','sg','other','unknown'].map(code=>actual.get('--ap-flow-source_'+code));
  assert.equal(new Set(distinct).size,5,'five regions remain distinguishable');
  assert.equal(new Set(['applied','contact','first','second','final'].map(stage=>actual.get('--ap-flow-'+stage))).size,5,'process retains coordinated color depth');
 }
 assert.match(site,/--cn:#9c2a33/);
 assert.match(site,/--hk:#b07c22/);
 assert.match(site,/--sg:#6e8a46/);
 assert.match(site,/--other:#357585/);
 assert.match(site,/--navy:#16395a/);
 // Homepage figures share one region system; dark-mode HK is amber, as in My Journey.
 const home=readFileSync(new URL('../home.css',import.meta.url),'utf8');
 assert.match(home,/--r-hk-ink:#e5bd68/);
 assert.match(site,/\[data-theme="dark"\][\s\S]*?--hk:#e5bd68/);
 assert.ok(refinement.length>0);
 // Top 30 bubbles are coloured by dominant market, using the same region classes as every other figure.
 assert.match(top30,/const DOMINANT_SHARE = 0\.6;/);
 assert.match(top30,/' region-' \+ String\(p\.region \|\| 'MIX'\)\.toLowerCase\(\)/);
 assert.match(sheet,/\.ap-node-region \.ap-region-code\s*\{\s*fill:currentColor/);
 assert.match(sheet,/\.ap-key-interviews::before\s*\{\s*background:linear-gradient/);
});
test('Region ribbons inherit original five source codes without changing graph math or copy',()=>{
 const js=readFileSync(new URL('../job-applications.js',import.meta.url),'utf8');
 assert.match(js,/n\.type==='region'\?'source_'\+n\.context\.toLowerCase\(\)/);
 const states=new Map();
 const regions=new Map([['a','CN'],['b','HK'],['c','SG'],['d','OTHER'],['e','UNKNOWN']]);
 const output=svg(graph(['a','b','c','d','e'],states,{regions}));
 for(const code of ['cn','hk','sg','other','unknown']){
  assert.match(output,new RegExp('style="fill:var\\(--ap-flow-source_'+code+'\\)"'));
  assert.match(output,new RegExp('data-tone="source_'+code+'"'));
 }
});

test('historical favorites retain their last observed type; missing IDs belong to Full only',()=>{
 const {favoriteScope,captureFavoriteTypes,favoriteTypeIndex}=scope.JobApplications;
 const favorites=['direct-live','agency-live','direct-gone','agency-gone','unknown-gone','old-missing','unlisted-live'];
 const initial=new Map([['direct-live','direct_employer'],['agency-live','recruitment_agency'],['direct-gone','direct_employer'],['agency-gone','recruitment_platform'],['unknown-gone','unknown'],['unlisted-live','unlisted']]);
 const items=captureFavoriteTypes(favorites,initial,[],100),history=favoriteTypeIndex(items);
 assert.equal(items.length,6);assert.equal(captureFavoriteTypes(favorites,initial,items,200).length,6);
 const current=new Map([['direct-live','direct_employer'],['agency-live','recruitment_agency'],['unlisted-live','unlisted']]);
 assert.deepEqual(plain(favoriteScope(favorites,'direct',current,history).visible),['direct-live','direct-gone']);
 assert.deepEqual(plain(favoriteScope(favorites,'agency',current,history).visible),['agency-live','agency-gone','unknown-gone','unlisted-live']);
 assert.deepEqual(plain(favoriteScope(favorites,'full',current,history).visible),favorites);
 assert.deepEqual(plain(favoriteScope(favorites,'agency',current,history).missing),['old-missing']);
 // A new verified classification wins; an offline stale snapshot must not replace history.
 current.set('direct-gone','recruitment_agency');
 assert.ok(favoriteScope(favorites,'agency',current,history).visible.includes('direct-gone'));
 assert.ok(favoriteScope(favorites,'direct',current,history,{fresh:false}).visible.includes('direct-gone'));
 const newer=favoriteTypeIndex(captureFavoriteTypes(favorites,current,items,300));
 assert.equal(newer.get('direct-gone').k,'recruitment_agency');
 assert.ok(favoriteScope(favorites,'agency',new Map(),newer).visible.includes('direct-gone'));
 assert.equal(graph(favoriteScope(favorites,'direct',new Map(),newer).visible,new Map()).total,1);
 assert.equal(favoriteTypeIndex(['{}',JSON.stringify({v:1,j:'bad',k:'invented',t:1})]).size,0);
});

test('two open pages with different index snapshots cannot continually overwrite each other',()=>{
 const {captureFavoriteTypes,favoriteTypeIndex}=scope.JobApplications;
 const favorites=['ln:role'],old=new Map([['ln:role','direct_employer']]),fresh=new Map([['ln:role','recruitment_agency']]);
 const oldObserved=new Set(),freshObserved=new Set();
 let items=captureFavoriteTypes(favorites,old,[],100,oldObserved);
 items=captureFavoriteTypes(favorites,fresh,items,200,freshObserved);
 assert.equal(favoriteTypeIndex(items).get('ln:role').k,'recruitment_agency');
 assert.equal(captureFavoriteTypes(favorites,old,items,300,oldObserved).length,2);
 assert.equal(captureFavoriteTypes(favorites,fresh,items,400,freshObserved).length,2);
});
