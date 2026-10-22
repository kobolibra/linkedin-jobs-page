import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const guestAuth = read('auth-guest.js');
const login = read('login.html');
const account = read('account.js');
const authCss = read('auth.css');
const guestbook = read('guestbook.js');
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

test('account control uses a four-colour butterfly avatar at a legible size', () => {
  assert.match(account, /class="account-mark" aria-hidden="true" viewBox="0 0 32 32"/);
  for (const color of ['#f35325', '#00a4ef', '#7fba00', '#ffb900']) assert.ok(account.includes(color), `missing wing colour ${color}`);
  assert.match(authCss, /account-trigger>\.account-mark\{display:block;width:22px;height:22px/);
});

test('desktop guestbook button is smaller while the mobile control stays 40 by 40', () => {
  assert.match(guestbook, /@media \(min-width:721px\)\{\s*\.gb-fab \{[^}]*height:36px[^}]*font-size:12px/);
  assert.match(guestbook, /@media \(max-width:720px\)\{\s*\.gb-fab \{[^}]*width:40px; height:40px/);
  assert.match(guestbook, /\.gb-modal \{[^}]*max-width:480px/);
});

test('changed browser assets use fresh cache keys', () => {
  assert.match(index, /auth\.css\?v=accounts-msn-2/);
  assert.match(index, /account\.js\?v=msn-avatar-1/);
  assert.match(index, /guestbook\.js\?v=reply-like-156/);
  assert.match(account, /auth-guest\.js\?v=2/);
});
