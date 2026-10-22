import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const guestAuth = read('auth-guest.js');
const login = read('login.html');
const account = read('account.js');
const authCss = read('auth.css');
const guestbook = read('guestbook.js');
const app = read('app.js');
const listCss = read('styles-list.css');
const index = read('index.html');

test('sign-in dialog moves initial focus off the brand and clears inherited text selection', () => {
  assert.match(guestAuth, /showModal\(\);loginDialog\.querySelector\('#signInTitle'\)\?\.focus\(\{preventScroll:true\}\);window\.getSelection\?\.\(\)\?\.removeAllRanges\(\)/);
  assert.match(guestAuth, /querySelector\('#signInTitle'\)\?\.setAttribute\('tabindex','-1'\)/);
  assert.match(read('auth-login-design.css'), /\.auth-modal #signInTitle:focus\{outline:none\}/);
});

test('shared sign-in copy has no trailing period', () => {
  assert.match(login, /New accounts are created automatically<\/p>/);
  assert.doesNotMatch(login, /New accounts are created automatically\./);
});

test('account avatar uses the sourced classic single blue MSN buddy asset', () => {
  assert.match(account, /<img class="account-mark" src="\/assets\/avatars\/misc-buddy-blue\.png" alt="" aria-hidden="true">/);
  assert.match(authCss, /account-trigger>\.account-mark\{display:block;width:24px;height:24px;flex:none;object-fit:contain\}/);
});

test('desktop corner controls share the same edge inset and button height', () => {
  assert.match(listCss, /--corner-action-inset:20px; --corner-action-size:36px/);
  assert.match(listCss, /\.totop \{ position:fixed;right:var\(--corner-action-inset\);bottom:var\(--corner-action-inset\);width:var\(--corner-action-size\);height:var\(--corner-action-size\)/);
  assert.match(guestbook, /@media \(min-width:721px\)\{\s*\.gb-fab \{ left:var\(--corner-action-inset,20px\); bottom:var\(--corner-action-inset,20px\); height:var\(--corner-action-size,36px\)/);
  assert.match(guestbook, /\.gb-fab:hover \{ transform:none;/);
});

test('guestbook and return-to-top glyphs have matching visual bounds and stroke weight', () => {
  assert.match(guestbook, /\.gb-fab svg \{ width:15px; height:15px; \}/);
  assert.match(listCss, /\.totop svg \{ width:15px;height:15px; \}/);
  assert.match(app, /up:'<svg viewBox="0 0 24 24"[^>]*stroke-width="2"[^>]*><line x1="12" y1="21" x2="12" y2="3"\/><polyline points="3 12 12 3 21 12"\/>/);
  assert.match(guestbook, /const BUBBLE = '<svg viewBox="0 0 24 24"[^>]*stroke-width="2"/);
});

test('mobile guestbook remains 40 by 40 and the dialog is unchanged', () => {
  assert.match(guestbook, /@media \(max-width:720px\)\{\s*\.gb-fab \{[^}]*width:40px; height:40px/);
  assert.match(guestbook, /\.gb-modal \{[^}]*max-width:480px/);
});

test('changed browser assets use fresh cache keys', () => {
  assert.match(index, /styles-list\.css\?v=corner-controls-1/);
  assert.match(index, /app\.js\?v=corner-icons-1/);
  assert.match(index, /auth\.css\?v=professional-avatar-1/);
  assert.match(index, /account\.js\?v=msn-buddy-asset-2/);
  assert.match(index, /guestbook\.js\?v=reply-like-157/);
});
