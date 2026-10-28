import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publicDependencyTarget,verifyPublicAssets} from './public_assets.mjs';

test('public route references map to packaged files without weakening missing-asset checks',()=>{
  assert.equal(publicDependencyTarget('about'),'about.html');
  assert.equal(publicDependencyTarget('about/'),'about.html');
  assert.equal(publicDependencyTarget('login'),'login.html');
  assert.equal(publicDependencyTarget('privacy'),'privacy.html');
  assert.equal(publicDependencyTarget('auth/start/google'),null);
  assert.equal(publicDependencyTarget('missing-file.css'),'missing-file.css');
  assert.equal(publicDependencyTarget('jobs-index.json'),'jobs-index.json');
});

test('homepage /about link points to a registered public page and no invented NJ icon',()=>{
  const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const about=readFileSync(new URL('../about.html',import.meta.url),'utf8');
  const published=readFileSync(new URL('./browser_assets.mjs',import.meta.url),'utf8');
  assert.match(home,/class="nj-top-nav"[^>]*>\s*<a class="nj-about-link" href="\/about">About<\/a>/);
  assert.match(about,/href="\/" class="about-brand"[^>]*><img class="nj-brand-mark" src="\/assets\/next-journey-mark\.svg"/);
  assert.doesNotMatch(about,/about-brand-mark/);
  assert.match(home,/class="nj-brand-mark" src="\/assets\/next-journey-mark\.svg"/);
  assert.match(about,/id="guestbook"/);
  assert.match(about,/href="\/\?guestbook=1"/);
  assert.match(readFileSync(new URL("../guestbook.js",import.meta.url),"utf8"),/url\.searchParams\.get\("guestbook"\) === "1"/);
  assert.doesNotMatch(about,/(?:THE NEXT CHAPTER|JEV)/);
  assert.match(published,/\'\/about.html\'/);
  assert.match(published,/\'\/about.css\'/);
  assert.match(published,/\'\/about.js\'/);
});

test('coverage claims reflect the 16 configured tracked institutions without implying full market data',()=>{
  const companySource=readFileSync(new URL('./jobspy/fetch_linkedin_requests.py',import.meta.url),'utf8');
  const block=companySource.match(/^COMPANIES = \{([\s\S]*?)^\}/m);
  assert.ok(block,'configured companies must be discoverable');
  const monitored=[...block[1].matchAll(/^    "[^"]+": \{/gm)];
  assert.equal(monitored.length,16,'revisit public copy whenever the monitored list changes');
  const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const about=readFileSync(new URL('../about.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  assert.match(about,/16 家金融机构/);
  assert.match(about,/页面数据仅代表已收录的职位/);
  assert.match(about,/id="coverage"/);
  assert.equal((about.match(/<div class="about-scope-names">[\s\S]*?<\/div>/)?.[0]?.match(/<span>/g)||[]).length,16);
  assert.match(home,/16 institutions actively monitored/);
  assert.match(home,/LATEST ROLE DATE/);
  assert.match(home,/COVERAGE NOTE/);
  assert.match(home,/Most Active Institutions in Our Sample/);
  assert.match(app,/Most Active Institutions in Our Sample/);
  assert.match(about,/希望我们都能拿到自己的dream offer💪/);
  assert.doesNotMatch(about,/\bJEV\b/);
});

test('copy is concise and avoids duplicate disclaimer headings or a numerical market slogan',()=>{
 const about=readFileSync(new URL('../about.html',import.meta.url),'utf8');
 const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.doesNotMatch(about,/03<br>MARKETS|知道边界在哪里|坦诚说明|样本趋势，不代表整体市场/);
 assert.match(home,/Selected coverage, not the full market/);
 assert.equal((about.match(/id="coverage"/g)||[]).length,1);
});
