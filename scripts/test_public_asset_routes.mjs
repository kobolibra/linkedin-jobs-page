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
  assert.match(about,/href="\/" class="about-brand"[^>]*><img src="\/assets\/next-journey-mark\.svg"/);
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

test('tracked-company list and scope match the configured LinkedIn collector',()=>{
 const about=readFileSync(new URL('../about.html',import.meta.url),'utf8');
 const source=readFileSync(new URL('./jobspy/fetch_linkedin_requests.py',import.meta.url),'utf8');
 const list=about.match(/<div class="about-company-list">([\s\S]*?)<\/div>/)?.[1]||'';
 const companyBlock=source.match(/^COMPANIES = \{([\s\S]*?)^\}/m);
 assert.ok(companyBlock,'company configuration must exist');
 const monitored=[...companyBlock[1].matchAll(/^    "[^"]+": \{/gm)];
 assert.equal(monitored.length,16,'revisit About when tracked-firm configuration changes');
 assert.equal((list.match(/<span>/g)||[]).length,16,'public tracked list must match configuration');
 assert.match(about,/mainland China, Hong Kong and Singapore/);
 assert.match(about,/company-filtered LinkedIn searches/);
 assert.match(about,/keyword searches/);
 assert.match(about,/Coverage is selective/);
 assert.match(about,/Listings come from LinkedIn, not employer career sites/);
});

test('About presents one consistent English narrative and preserves navigable sections',()=>{
 const about=readFileSync(new URL('../about.html',import.meta.url),'utf8');
 const styles=readFileSync(new URL('../about.css',import.meta.url),'utf8');
 const script=readFileSync(new URL('../about.js',import.meta.url),'utf8');
 const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(about,/<html lang="en">/);
 assert.doesNotMatch(about,/[\u4e00-\u9fff]/);
 assert.equal((about.match(/class="about-hero"/g)||[]).length,1);
 assert.equal((about.match(/class="about-purpose"/g)||[]).length,1);
 assert.equal((about.match(/class="about-section" id="/g)||[]).length,8);
 assert.equal((about.match(/<details><summary>/g)||[]).length,4);
 for(const id of ['market','search','details','save','devices','account','guestbook','faq']){
  assert.match(about,new RegExp('id="'+id+'"'));
  assert.match(about,new RegExp('href="#'+id+'"'));
 }
 assert.match(about,/href="\/\?guestbook=1"/);
 assert.match(home,/Watch the market\./);
 assert.match(home,/Where finance<br>is hiring/);
 assert.match(about,/THE HIRING LANDSCAPE/);
 assert.match(about,/The Landscape in Numbers/);
 assert.match(about,/Top 30 Institutions by Active Roles/);
 assert.match(about,/My Journey · Sankey diagram/);
 assert.match(about,/Find your next move\./);
 assert.doesNotMatch(about,/See the market\.|Understand the market|Start with the wider view|see the bigger picture|Narrow the field|More than a saved list|Your search, wherever you are/);
 assert.match(home,/Last Updated/);
 assert.match(home,/Source <span aria-hidden="true">\/<\/span> LinkedIn/);
 assert.match(home,/Top 30 Institutions by Active Roles/);
 assert.match(styles,/font-family:"Source Serif 4",Georgia,serif/);
 assert.match(script,/Switch to light mode/);
 assert.doesNotMatch(about,/about-orbit|about-art-core|NEXT CHAPTER|JEV/);
});

test('About distinguishes real job data and its limitations from personal job matching',()=>{
 const about=readFileSync(new URL('../about.html',import.meta.url),'utf8');
 const hero=about.match(/<section class="about-hero"[\s\S]*?<\/section>/)?.[0]||'';
 assert.match(hero,/Not real-time job alerts/);
 assert.match(hero,/Not résumé-based job matching/);
 assert.match(hero,/Not CV or cover-letter rewriting/);
 assert.match(hero,/refreshed every six hours/);
 assert.match(hero,/openings may be delayed, missed or no longer available/);
 assert.match(hero,/About<br><em>Next Journey/);
 assert.match(hero,/Sankey diagram/);
 assert.equal((about.match(/refreshed every six hours/g)||[]).length,1,'refresh disclosure belongs in the hero');
 assert.doesNotMatch(about,/automatically match you|instant alerts|all open jobs/);
 assert.match(about,/No personal résumé assessment/);
 assert.match(about,/Applications are not submitted or automated here/);
});

test('About documents actual chart, search, Sankey and account behavior',()=>{
 const about=readFileSync(new URL('../about.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const applications=readFileSync(new URL('../job-applications.js',import.meta.url),'utf8');
 const fetcher=readFileSync(new URL('./jobspy/fetch_linkedin_requests.py',import.meta.url),'utf8');
 assert.match(about,/mean and median days since first seen/);
 assert.match(about,/Select a bubble or employer label/);
 assert.match(app,/closest\("\.bubble-row\[data-company\]"\)/);
 assert.match(app,/drillTop50Company\(row\.dataset\.company\)/);
 assert.match(fetcher,/params\["f_C"\] = strict_company_id/);
 assert.match(about,/not the full text of job descriptions/);
 assert.match(about,/Manually record Applied/);
 assert.match(about,/Flow width reflects role counts/);
 assert.match(about,/Main-list filters do not change the chart/);
 assert.match(about,/12 latest active listings/);
 assert.match(about,/Swipe left/);
 assert.match(about,/500 characters/);
 assert.match(applications,/const stages=\[\['saved','Saved'\]/);
 assert.match(applications,/const data=graph\(favorites,states,\{regions\}\)/);
 assert.match(app,/const JEV_API_ENDPOINT="\/api\/jev\/analyze"/);
});

test('About entry remains registered and public asset paths remain protected',()=>{
 const about=readFileSync(new URL('../about.html',import.meta.url),'utf8');
 const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const published=readFileSync(new URL('./browser_assets.mjs',import.meta.url),'utf8');
 assert.match(home,/class="nj-top-nav"[^>]*>\s*<a class="nj-about-link" href="\/about">About<\/a>/);
 assert.match(about,/href="\/" class="about-brand"[^>]*><img src="\/assets\/next-journey-mark\.svg"/);
 assert.match(about,/href="\/privacy"/);
 assert.match(about,/href="\/login"/);
 assert.match(about,/href="\/\?guestbook=1"/);
 assert.match(readFileSync(new URL("../guestbook.js",import.meta.url),"utf8"),/url\.searchParams\.get\("guestbook"\) === "1"/);
 assert.doesNotMatch(about,/about-brand-mark/);
 assert.match(published,/'\/about.html'/);
 assert.match(published,/'\/about.css'/);
 assert.match(published,/'\/about.js'/);
});
