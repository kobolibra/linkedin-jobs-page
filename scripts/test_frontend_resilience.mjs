import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const guestbook=readFileSync(new URL('../guestbook.js',import.meta.url),'utf8');
test('denied browser storage and corrupt list preferences do not break initialization',()=>{
  const context={};
  Object.defineProperty(context,'localStorage',{get(){throw new Error('denied');}});
  Object.defineProperty(context,'sessionStorage',{get(){throw new Error('denied');}});
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function storageGet('),source.indexOf('const IC=')),context);
  assert.equal(context.storageGet('theme'),null);
  assert.deepEqual(Array.from(context.storageList('favs')),[]);
  assert.doesNotThrow(()=>context.storageSet('favs','[]'));
  for(const value of ['{broken','null','{}','42','"bad"']){
    const c={localStorage:{getItem:()=>value}};vm.createContext(c);
    vm.runInContext(source.slice(source.indexOf('function storageGet('),source.indexOf('const IC=')),c);
    assert.deepEqual(Array.from(c.storageList('favs')),[]);
  }
});
test('guestbook storage failures do not disable reading or posting',()=>{
  const context={LS_LIKES:'gbLikes'};
  Object.defineProperty(context,'localStorage',{get(){throw new Error('denied');}});
  Object.defineProperty(context,'sessionStorage',{get(){throw new Error('denied');}});
  vm.createContext(context);
  vm.runInContext(guestbook.slice(guestbook.indexOf('  function storeGet('),guestbook.indexOf('  // ===== 配置')),context);
  assert.equal(context.storeGet('gbAdminKey',true),null);
  assert.deepEqual(Array.from(context.likedIds()),[]);
  assert.doesNotThrow(()=>context.storeSet('gbLikes','[]'));
  assert.doesNotThrow(()=>context.storeRemove('gbAdminKey'));
});
test('job links allow HTTPS LinkedIn hosts and reject executable or spoofed links',()=>{
  const context={URL};vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function safeJobLink('),source.indexOf('function safeJdHtml(')),context);
  for(const link of ['javascript:alert(1)','data:text/html,hello','https://linkedin.com.evil.test/jobs/view/12345678','https://notlinkedin.com/jobs/view/12345678'])assert.equal(context.safeJobLink(link),'#');
  assert.equal(context.safeJobLink('https://hk.linkedin.com/jobs/view/12345678'),'https://hk.linkedin.com/jobs/view/12345678');
});
function analysisHarness(){
  const entry={descriptionText:'Build and operate reliable data pipelines for core business applications.'};
  const panel={hidden:true},cache={};let calls=0,renders=0,writes=0;
  const card={dataset:{id:'ln:12345678',comp:'ACME',region:'CN'},querySelector(selector){return selector==='.job-title'?{textContent:card.title}:null;},title:'Data Engineer'};
  const context={JEV_MAX_DESCRIPTION_CHARS:24000,JEV_TAXONOMY_VERSION:'jev-taxonomy-v5.1.0',JEV_API_ENDPOINT:'/api/jev/analyze',jdById:new Map([[card.dataset.id,entry]]),jdBlockText:()=>'',jdFingerprint:async text=>text,readJevCache:()=>cache,writeJevCache(){writes++;},hydrateJd:async()=>{},ensureJevPanel:()=>panel,showJevStatus(){},showJevError(){},renderJevResult(){renders++;},AbortController,setTimeout,clearTimeout,fetch:async()=>{calls++;return {ok:true,json:async()=>({analysis:{taxonomyVersion:'jev-taxonomy-v5.1.0'}})};}};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function jevRequestText('),source.indexOf('const jevText='))+'\n'+source.slice(source.indexOf('const jevRuns=new Set();'),source.indexOf('function addJevControls('))+'\nthis.run=runJevAnalysis;',context);
  return {context,card,entry,cache,counts:()=>({calls,renders,writes})};
}
test('JEV cache follows title, company, location, metadata and description',async()=>{
  const h=analysisHarness();await h.context.run(h.card);await h.context.run(h.card);
  assert.equal(h.counts().calls,1);
  h.card.title='Director of Engineering';await h.context.run(h.card);assert.equal(h.counts().calls,2);
  h.card.dataset.comp='New Employer';await h.context.run(h.card);assert.equal(h.counts().calls,3);
  h.card.dataset.region='HK';await h.context.run(h.card);assert.equal(h.counts().calls,4);
  h.entry.jevInput={schema:'jev-input-v4',jd_text:h.entry.descriptionText,employer_metadata:'Business: Global Markets'};await h.context.run(h.card);assert.equal(h.counts().calls,5);
  h.entry.jevInput.jd_text+=' Own hiring decisions.';await h.context.run(h.card);assert.equal(h.counts().calls,6);
});
test('an empty HTTP-200 analysis cannot enter the browser cache',async()=>{
  const h=analysisHarness();h.context.fetch=async()=>({ok:true,json:async()=>({})});
  await h.context.run(h.card);assert.equal(h.counts().writes,0);assert.equal(h.counts().renders,0);
});
