import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PUBLIC_FILES, buildPublicAssets, isPublicAsset, verifyPublicAssets} from './public_assets.mjs';
import {buildJdShards, jdShard} from './build_jd_shards.mjs';

const logo = 'assets/company-logos/' + 'a'.repeat(24) + '.svg';
function write(root, path, data) {
  const target = join(root, path); mkdirSync(join(target, '..'), {recursive:true});
  writeFileSync(target, data); return target;
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(),'public-assets-'));
  for (const name of PUBLIC_FILES) write(root,name,name==='index.html'?'<script src="app.js?v=1"></script><img src="'+logo+'">':'');
  const index = {jobs:[{title:'Analyst',link:'https://www.linkedin.com/jobs/view/12345',hasJd:true}],companyLogos:{acme:logo},companyLogoFallback:logo};
  write(root,'jobs-index.json',JSON.stringify(index));write(root,'company-logos.json',JSON.stringify({acme:logo}));
  write(root,logo,'<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  write(root,'avatars/backgrounds/public.jpg',Buffer.from([1,2,3]));
  const details = {'ln:12345':{descriptionHtml:'<p><strong>Contact hiring@example.invalid</strong></p><ul><li>Original JD</li></ul>',jevInput:{schema:'jev-input-v4',jd_text:'Original JD'}}};
  write(root,'jobs-details.json',JSON.stringify({details}));buildJdShards(join(root,'jobs-details.json'),join(root,'jd-parts'));
  return root;
}
function withFixture(t) {const root=fixture();t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}

test('both public deployments contain only browser assets, unchanged JD and working dependencies',t=>{
  const root=withFixture(t);
  for(const name of ['worker.js','account-auth.mjs','account-preferences.mjs','migrations/0001_accounts.sql','migrations/0002_account_sync.sql','jev-taxonomy.mjs','auto-daily-companies.py','gen-taxonomy-doc.mjs','package.json','pv.json','financial_blacklist.json','company_industries.json','jobs.json','jobs-details.json.bak.gz','.env','data/private.json','scripts/private.js','server-new.js','app.js.map','assets/private.py','assets/.env.svg'])write(root,name,'private input');
  const result=buildPublicAssets(root);assert.ok(result.files>256);
  const out=join(root,'public-assets');
  for(const name of ['worker.js','account-auth.mjs','account-preferences.mjs','migrations/0001_accounts.sql','migrations/0002_account_sync.sql','jobs.json','jobs-details.json','pv.json','data','scripts','server-new.js','app.js.map','assets/private.py','assets/.env.svg'])assert.equal(isPublicAsset(name),false,name);
  assert.equal(readdirSync(out).includes('worker.js'),false);
  for(const name of PUBLIC_FILES.concat([logo,'avatars/backgrounds/public.jpg','jd-parts/'+jdShard('ln:12345')+'.json']))assert.deepEqual(readFileSync(join(out,name)),readFileSync(join(root,name)),name);
  write(out,'jobs.json','stale previous export');buildPublicAssets(root);assert.equal(readdirSync(out).includes('jobs.json'),false);
});
test('the predeploy gate rejects injected source, raw data, archives and source maps',t=>{
  const root=withFixture(t);const out=join(root,'public-assets');
  for(const name of ['worker.js','account-auth.mjs','account-preferences.mjs','migrations/0001_accounts.sql','migrations/0002_account_sync.sql','jobs.json','data/raw.json','app.js.map','jobs-index.json.gz']){
    buildPublicAssets(root);write(out,name,'injected');assert.throws(()=>verifyPublicAssets(out),/Private or unapproved/);
  }
});
test('credential checks fail without logging the secret, and normal public job contacts are preserved',t=>{
  const root=withFixture(t),secret='ghp_'+'A'.repeat(36);
  write(root,'app.js','const accidental="'+secret+'";');
  assert.throws(()=>buildPublicAssets(root),e=>e.message.includes('GitHub token')&&!e.message.includes(secret));
  write(root,'app.js','const accidental="-----BEGIN PRIVATE KEY-----";');assert.throws(()=>buildPublicAssets(root),/private key/);
  write(root,'app.js','');buildPublicAssets(root);
  const part=readFileSync(join(root,'public-assets','jd-parts',jdShard('ln:12345')+'.json'),'utf8');
  assert.match(part,/hiring@example.invalid/);assert.match(part,/<strong>/);assert.match(part,/<li>/);
});
test('missing frontend files, partitions or logo dependencies stop publication',t=>{
  const root=withFixture(t),out=join(root,'public-assets');buildPublicAssets(root);
  rmSync(join(out,'jd-parts','00.json'));assert.throws(()=>verifyPublicAssets(out),/Missing JD partition/);
  buildPublicAssets(root);rmSync(join(out,logo));assert.throws(()=>verifyPublicAssets(out),/Missing or unsafe company logo/);
  buildPublicAssets(root);rmSync(join(out,'account-identity.css'));assert.throws(()=>verifyPublicAssets(out),/Missing browser asset/);
  buildPublicAssets(root);write(out,'index.html','<script src="missing.js"></script>');assert.throws(()=>verifyPublicAssets(out),/Missing local homepage dependency/);
});
test('public builds cannot erase the checkout or follow links to private inputs',t=>{
  const root=withFixture(t);assert.throws(()=>buildPublicAssets(root,'.'),/Public output must/);
  symlinkSync(join(root,'jobs-details.json'),join(root,'assets','private.svg'));
  assert.throws(()=>buildPublicAssets(root),/Symbolic link/);
  rmSync(join(root,'assets','private.svg'));symlinkSync(join(root,'assets'),join(root,'public-assets'));
  assert.throws(()=>buildPublicAssets(root),/symbolic link/);
});
test('only Cloudflare publishes the protected asset bundle and the Worker intercepts all requests',()=>{
  const root=new URL('../',import.meta.url);
  const config=JSON.parse(readFileSync(new URL('wrangler.jsonc',root),'utf8'));
  assert.equal(config.assets.directory,'./public-assets');assert.equal(config.main,'worker.js');
  const workflow=readFileSync(new URL('.github/workflows/deploy.yml',root),'utf8');
  assert.doesNotMatch(workflow,/peaceiris\/actions-gh-pages|publish_dir:/);
  assert.equal(config.assets.run_worker_first,true);assert.equal(config.preview_urls,false);
  assert.ok(workflow.indexOf('public_assets.mjs --check')<workflow.indexOf('Deploy to Cloudflare Worker'));
  const build=readFileSync(new URL('scripts/build_jd_shards.mjs',root),'utf8');assert.match(build,/buildPublicAssets\(\)/);
});
