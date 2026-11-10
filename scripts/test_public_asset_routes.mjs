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

test('coverage claims reflect the 16 configured tracked institutions without implying full market data',()=>{
  const companySource=readFileSync(new URL('./jobspy/fetch_linkedin_requests.py',import.meta.url),'utf8');
  const block=companySource.match(/^COMPANIES = \{([\s\S]*?)^\}/m);
  assert.ok(block,'configured companies must be discoverable');
  const monitored=[...block[1].matchAll(/^    "[^"]+": \{/gm)];
  assert.equal(monitored.length,16,'revisit public copy whenever the monitored list changes');
  const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const about=readFileSync(new URL('../about.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  assert.match(about,/16 /);
  assert.match(about,/所有职位信息均来自 LinkedIn/);
  assert.match(about,/id="coverage"/);
  assert.equal((about.match(/<div class="about-company-list">[\s\S]*?<\/div>/)?.[0]?.match(/<span>/g)||[]).length,16);
  assert.match(home,/Watch the market\./);
  assert.match(home,/Last Updated/);
  assert.match(home,/Source <span aria-hidden="true">\/<\/span> LinkedIn/);
  assert.match(home,/Top 30 Institutions by Active Roles/);
  assert.match(app,/Top 30 Institutions by Active Roles/);
  assert.match(about,/希望我们都能拿到自己的dream offer💪/);
  assert.doesNotMatch(about,/\bJEV\b/);
});

test('copy is concise and avoids duplicate disclaimer headings or a numerical market slogan',()=>{
 const about=readFileSync(new URL('../about.html',import.meta.url),'utf8');
 const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.doesNotMatch(about,/03<br>MARKETS|知道边界在哪里|坦诚说明|样本趋势，不代表整体市场|FIND YOUR FIT|CN · HK · SG|MAINLAND CHINA · HONG KONG · SINGAPORE/);
 assert.doesNotMatch(home,/Selected coverage, not the full market|16 institutions actively monitored|COVERAGE NOTE/);
 assert.equal((about.match(/id="coverage"/g)||[]).length,1);
});

test('homepage keeps approved pre-coverage language and top About entry',()=>{const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.match(home,/Market Coverage/);assert.match(home,/Glean signal from the noise/);assert.match(home,/href="\/about"/);assert.doesNotMatch(home,/REGIONS TRACKED|16 selected institutions|SOURCES <span/);});

test('About uses one editorial hero, accurate desktop/mobile instructions, and no decorative slogans',()=>{
 const about=readFileSync(new URL('../about.html',import.meta.url),'utf8');
 const styles=readFileSync(new URL('../about.css',import.meta.url),'utf8');
 assert.match(about,/希望我们都能拿到自己的dream offer💪/);
 assert.equal((about.match(/class="about-section" id="/g)||[]).length,8);
 assert.match(about,/向左轻扫/);
 assert.match(about,/Guestbook/);
 assert.match(about,/href="\/\?guestbook=1"/);
 assert.match(about,/最新 12 条有效职位预览/);
 assert.doesNotMatch(about,/about-orbit|about-art-core|NEXT CHAPTER|JEV/);
 assert.doesNotMatch(styles,/about-orbit/);
});

test('About describes LinkedIn-only company and keyword discovery and actual bubble chart drilldown',()=>{
 const about=readFileSync(new URL('../about.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const fetcher=readFileSync(new URL('./jobspy/fetch_linkedin_requests.py',import.meta.url),'utf8');
 assert.match(about,/重点机构按机构范围检索/);
 assert.match(about,/通过职位关键词检索补充/);
 assert.match(about,/所有职位信息均来自 LinkedIn/);
 assert.doesNotMatch(about,/部分其他来源|其他数据来源/);
 assert.match(about,/点击气泡或显示的机构名称/);
 assert.match(app,/closest\("\.bubble-row\[data-company\]"\)/);
 assert.match(app,/drillTop50Company\(row\.dataset\.company\)/);
 assert.match(fetcher,/params\["f_C"\] = strict_company_id/);
 assert.match(about,/让下一站，多一些交流/);
});


test('About accurately distinguishes regular LinkedIn discovery, personal workflow and the optional JD analytics',()=>{
  const about=readFileSync(new URL('../about.html',import.meta.url),'utf8');
  const applications=readFileSync(new URL('../job-applications.js',import.meta.url),'utf8');
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  assert.match(about,/每 6 小时自动同步/);
  assert.match(about,/而非企业招聘官网/);
  assert.match(about,/并非实时监控/);
  assert.match(about,/无法保证第一时间发现/);
  assert.match(about,/My Journey · 桑基图/);
  assert.match(about,/手动记录的申请进度/);
  assert.match(about,/不提供简历匹配/);
  assert.match(about,/不会根据 JD 生成或改写简历、求职信/);
  assert.match(about,/不能在本站直接提交或自动投递简历/);
  assert.match(about,/Analytics 仅针对已有 JD 提供结构化辅助解读/);
  assert.match(applications,/const stages=\[\['saved','Saved'\]/);
  assert.match(applications,/const data=graph\(favorites,states,\{regions\}\)/);
  assert.match(app,/const JEV_API_ENDPOINT="\/api\/jev\/analyze"/);
});
