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

test('About sourcing and firm list match collector configuration',()=>{
 const about=readFileSync(new URL('../about.html',import.meta.url),'utf8');
 const source=readFileSync(new URL('./jobspy/fetch_linkedin_requests.py',import.meta.url),'utf8');
 const roster=about.match(/<div class="about-company-list">([\s\S]*?)<\/div>/)?.[1]||'';
 const companyConfig=source.match(/^COMPANIES = \{([\s\S]*?)^\}/m);
 assert.ok(companyConfig,'tracked company configuration exists');
 assert.equal([...companyConfig[1].matchAll(/^    "[^"]+": \{/gm)].length,16);
 assert.equal((roster.match(/<span>/g)||[]).length,16);
 assert.match(about,/company-filtered LinkedIn searches/);
 assert.match(about,/Role-keyword searches/);
 assert.match(about,/not the full hiring market/);
});
test('About uses homepage vocabulary with one product thesis and six coherent sections',()=>{
 const about=readFileSync(new URL('../about.html',import.meta.url),'utf8');
 const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const styles=readFileSync(new URL('../about.css',import.meta.url),'utf8');
 assert.match(about,/<html lang="en">/);
 assert.doesNotMatch(about,/[\u4e00-\u9fff]/);
 assert.match(home,/Where finance<br>is hiring/);
 assert.match(about,/Where finance is hiring/);
 assert.match(home,/The Landscape in Numbers/);
 assert.match(about,/The Landscape in Numbers/);
 assert.match(about,/Company Insight/);
 assert.match(about,/Role History/);
 assert.match(about,/My Journey/);
 assert.equal((about.match(/class="about-hero"/g)||[]).length,1);
 assert.equal((about.match(/class="about-purpose"/g)||[]).length,1);
 assert.equal((about.match(/class="about-section" id="/g)||[]).length,6);
 assert.equal((about.match(/<details><summary>/g)||[]).length,4);
 const ids=['market','search','save','account','faq','guestbook'];
 for(const id of ids){assert.match(about,new RegExp('id="'+id+'"'));assert.match(about,new RegExp('href="#'+id+'"'));}
 assert.doesNotMatch(about,/See the market\.|Understand the market|Start with the wider view|Know where you stand|see the bigger picture|Narrow the field|More than a saved list/);
 assert.doesNotMatch(about,/class="about-start-nav"|class="about-closing"/);
 assert.match(styles,/\.about-facts\{/);
 assert.match(about,/\/about\.css\?v=13/);
});
test('About states source, update limitations and unsupported work explicitly',()=>{
 const about=readFileSync(new URL('../about.html',import.meta.url),'utf8');
 const hero=about.match(/<section class="about-hero"[\s\S]*?<\/section>/)?.[0]||'';
 assert.match(hero,/LinkedIn/);
 assert.match(hero,/Every 6 hours/);
 assert.match(hero,/Not sourced from employer career sites or monitored in real time/);
 assert.match(hero,/Some openings may be missing, delayed or already closed/);
 assert.match(hero,/does not offer instant job alerts/);
 assert.match(hero,/résumé-to-role matching/);
 assert.match(hero,/JD-specific CV and cover-letter editing/);
 assert.equal((about.match(/Every 6 hours/g)||[]).length,1,'only one refresh-frequency disclosure');
});
test('About accurately describes analytics, first-seen times and manually tracked Sankey',()=>{
 const about=readFileSync(new URL('../about.html',import.meta.url),'utf8');
 const jobs=readFileSync(new URL('../job-applications.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(about,/horizontal and vertical axes show mean and median days since first seen/);
 assert.match(about,/not full JD text/);
 assert.match(about,/Manually record/);
 assert.match(about,/Stage history is retained/);
 assert.match(about,/Flow widths represent role counts, not offer probabilities/);
 assert.match(about,/Main-list filters do not change the chart/);
 assert.match(about,/not a personal fit assessment/);
 assert.match(about,/12 latest active listings/);
 assert.match(about,/Swipe left/);
 assert.match(about,/500 characters/);
 assert.match(jobs,/const stages=\[\['saved','Saved'\]/);
 assert.match(jobs,/const data=graph\(favorites,states,\{regions\}\)/);
 assert.match(app,/const JEV_API_ENDPOINT="\/api\/jev\/analyze"/);
});
test('About preserves all external routes and private asset boundaries',()=>{
 const about=readFileSync(new URL('../about.html',import.meta.url),'utf8');
 const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const published=readFileSync(new URL('./browser_assets.mjs',import.meta.url),'utf8');
 assert.match(home,/class="nj-top-nav"[^>]*>\s*<a class="nj-about-link" href="\/about">About<\/a>/);
 for(const link of ['\/','\/login','\/privacy','\/\?guestbook=1'])assert.ok(about.includes('href="'+link+'"'),link);
 assert.match(about,/href="\/" class="about-brand"[^>]*><img src="\/assets\/next-journey-mark\.svg"/);
 assert.match(readFileSync(new URL('../guestbook.js',import.meta.url),'utf8'),/url\.searchParams\.get\("guestbook"\) === "1"/);
 for(const asset of ['about.html','about.css','about.js'])assert.ok(published.includes("'\/"+asset+"'"));
 assert.doesNotMatch(about,/JEV|about-brand-mark/);
});
