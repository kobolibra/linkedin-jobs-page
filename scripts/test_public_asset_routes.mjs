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
  assert.match(about,/href="\/" class="about-brand"[^>]*>Next Journey<\/a>/);
  assert.doesNotMatch(about,/about-brand-mark/);
  assert.match(published,/\'\/about.html\'/);
  assert.match(published,/\'\/about.css\'/);
  assert.match(published,/\'\/about.js\'/);
});
