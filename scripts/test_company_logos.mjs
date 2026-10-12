import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {embedCompanyLogos} from './build_jd_shards.mjs';
const code=fs.readFileSync(new URL('../company-logos.js',import.meta.url),'utf8');
function setup(){const listeners={};const context={window:{},document:{addEventListener:(n,fn)=>listeners[n]=fn},setTimeout,clearTimeout};vm.runInNewContext(code,context);return {...context.window.CompanyLogos,listeners};}
const src='assets/company-logos/'+'a'.repeat(24)+'.webp',fallback='assets/company-logos/'+'b'.repeat(24)+'.svg';
test('logo markup exists at initial render without a manifest fetch',()=>{const s=setup();s.setManifest({'dbs bank':src},fallback);const html=s.markup('DBS Bank','D',true);assert.ok(html.includes(src));assert.ok(html.includes('loading="eager"'));assert.ok(!html.includes('>D</div>'));});
test('unresolved companies use the cached placeholder and offscreen images are lazy',()=>{const s=setup();s.setManifest({},fallback);assert.ok(s.markup('Unknown','U').includes(fallback));assert.ok(s.markup('Unknown','U').includes('loading="lazy"'));});
test('invalid sources are rejected and optional catalog failure preserves letters',()=>{const s=setup();s.setManifest({'dbs bank':'https://attacker.test/a.svg'});assert.equal(s.markup('DBS Bank','D'),'<div class="mono">D</div>');s.setManifest([],'../bad.svg');assert.equal(s.markup('X','<'),'<div class="mono">&lt;</div>');});
test('first-screen decode is bounded even when an image never finishes',async()=>{const s=setup();let eager=0;const images=Array.from({length:100},()=>({set loading(v){eager++;},addEventListener(){},decode:()=>new Promise(()=>{})}));const start=Date.now();await s.prepare({querySelectorAll:()=>images},{timeoutMs:10,maxImages:12});assert.equal(eager,12);assert.ok(Date.now()-start<200);});
test('decoded first-screen images do not wait for the timeout',async()=>{const s=setup();const img={addEventListener(){},decode:()=>Promise.resolve()};await s.prepare({querySelectorAll:()=>[img]},{timeoutMs:1000});assert.equal(img.loading,'eager');});
test('Cloudflare build refreshes the catalog without changing job rows',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'logo-build-'));try{
  const index=path.join(root,'index.json'),manifest=path.join(root,'manifest.json'),state=path.join(root,'state.json');const jobs=[{title:'Analyst'}];
  fs.writeFileSync(index,JSON.stringify({jobs}));fs.writeFileSync(manifest,JSON.stringify({'dbs bank':src,'unknown':fallback,'bad':'https://attacker.test/logo'}));fs.writeFileSync(state,JSON.stringify({'unknown':{status:'ready',imageKind:'placeholder'}}));
  assert.equal(embedCompanyLogos(index,manifest,state),2);const doc=JSON.parse(fs.readFileSync(index));assert.deepEqual(doc.jobs,jobs);assert.equal(doc.companyLogoFallback,fallback);assert.equal(doc.companyLogos['bad'],undefined);
  fs.writeFileSync(manifest,'bad JSON');assert.equal(embedCompanyLogos(index,manifest,state),0);assert.deepEqual(JSON.parse(fs.readFileSync(index)).jobs,jobs);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
