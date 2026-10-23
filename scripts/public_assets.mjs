import {cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {relative, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildGuestPreview} from './guest_preview.mjs';

// Only browser assets belong in the Worker static asset bundle.
// Worker entry points, provider rules, build inputs and repository metadata stay private.
export const PUBLIC_FILES = [
  'preview-index.json', 'auth-guest.js', 'auth-guest.css', 'guest-resume.js', 'auth-login-design.css', 'account.js', 'account-sync.js', 'auth-login.js', 'auth.css', 'account-identity.css', 'login.html', 'privacy.html',
  'index.html', '_headers', 'jobs-index.json', 'jobs-version.json', 'company-logos.json',
  'cn-city-map.js', 'cn-city-map.css', 'assets/maps/cn-cities.json', 'assets/maps/NOTICE.txt',
  'job-store.js', 'list-query.js', 'list-view.js',
  'app.js', 'company-insight.js', 'company-logos.js', 'editorial-mapping.js',
  'guestbook.js', 'row-fixes.js', 'row-hover.js', 'salary-display.js', 'top30-layout.js',
  'ui-refinement.js', 'visitor-count.js', 'layout-fixes.css', 'styles-company.css',
  'styles-cursor.css', 'styles-list.css', 'styles-refinement.css', 'styles.css', 'next-journey-masthead.css',
];
const optional = new Set(['CNAME', 'robots.txt', 'sitemap.xml', '.nojekyll']);
const roots = new Set(PUBLIC_FILES);
const secrets = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/],
  ['provider secret key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/],
  ['assigned service credential', /\b(?:GOOGLE_CLIENT_SECRET|GITHUB_CLIENT_SECRET|JEV_API_KEY|TYPESAFE_API_KEY|PRIVATE_REPO_TOKEN|CLOUDFLARE_API_TOKEN|GITHUB_TOKEN)\s*[:=]\s*["'][^"'\r\n]{12,}["']/],
];

export function isPublicAsset(path) {
  if (roots.has(path) || optional.has(path)) return true;
  if (path.includes('\\') || path.split('/').some(p => !p || p.startsWith('.'))) return false;
  return /^jd-parts\/[a-f0-9]{2}\.json$/.test(path)
    || /^(?:assets|avatars)\/[^\s]+\.(?:webp|svg|png|jpe?g|gif|avif|ico|woff2?|ttf|otf)$/i.test(path);
}

function files(directory, prefix = '') {
  const found = [];
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    const name = prefix + entry.name, path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw Error('Symbolic link in asset input: ' + name);
    if (entry.isDirectory()) found.push(...files(path, name + '/'));
    else if (entry.isFile()) found.push(name);
    else throw Error('Unsupported asset input: ' + name);
  }
  return found;
}

export function verifyPublicAssets(directory = 'public-assets') {
  const root = resolve(directory);
  if (lstatSync(root).isSymbolicLink()) throw Error('Public asset directory is a symbolic link');
  const published = files(root);
  for (const name of published) {
    if (!isPublicAsset(name)) throw Error('Private or unapproved file in public assets: ' + name);
    if (!/\.(?:webp|png|jpe?g|gif|avif|ico|woff2?|ttf|otf)$/i.test(name)) {
      const text = readFileSync(resolve(root, name), 'utf8');
      for (const [label, pattern] of secrets) {
        // Report the file and credential class, never the matched value.
        if (pattern.test(text)) throw Error('Possible ' + label + ' in public asset: ' + name);
      }
    }
  }
  for (const name of PUBLIC_FILES) if (!published.includes(name)) throw Error('Missing browser asset: ' + name);
  for (let i = 0; i < 256; i++) {
    const name = 'jd-parts/' + i.toString(16).padStart(2, '0') + '.json';
    if (!published.includes(name)) throw Error('Missing JD partition: ' + name);
  }
  const index = JSON.parse(readFileSync(resolve(root, 'jobs-index.json'), 'utf8'));
  const catalog = JSON.parse(readFileSync(resolve(root, 'company-logos.json'), 'utf8'));
  if (!Array.isArray(index.jobs) || !catalog || typeof catalog !== 'object' || Array.isArray(catalog)) throw Error('Invalid browser data payload');
  for (const asset of [...Object.values(catalog), ...Object.values(index.companyLogos || {}), index.companyLogoFallback].filter(Boolean)) {
    if (!/^assets\/company-logos\/[a-f0-9]{24}\.(?:svg|webp)$/.test(asset) || !published.includes(asset)) throw Error('Missing or unsafe company logo asset');
  }
  for (const htmlFile of ['index.html','login.html']) {
  const html = readFileSync(resolve(root, htmlFile), 'utf8');
  for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
    const value = match[1];
    if (/^(?:[a-z]+:|\/\/|#)/i.test(value)) continue;
    const path = value.split(/[?#]/)[0].replace(/^\//, '') || 'index.html';
    if (['login','privacy','auth/start/google'].includes(path)) continue;
    if (!published.includes(path)) throw Error('Missing local homepage dependency: ' + path);
  }
  }
  return {files: published.length};
}

export function buildPublicAssets(source = '.', destination = 'public-assets') {
  const root = resolve(source), output = resolve(root, destination);
  // Never erase the checkout, its parent, or a caller's unrelated directory.
  if (relative(root, output) !== 'public-assets') throw Error('Public output must be the checkout public-assets directory');
  if (existsSync(output) && lstatSync(output).isSymbolicLink()) throw Error('Public output is a symbolic link');
  buildGuestPreview(root);
  const selected = PUBLIC_FILES.concat([...optional].filter(name => existsSync(resolve(root, name))));
  for (const directory of ['assets', 'avatars', 'jd-parts']) {
    const path = resolve(root, directory);
    if (existsSync(path)) {
      if (lstatSync(path).isSymbolicLink()) throw Error('Asset input directory is a symbolic link');
      selected.push(...files(path, directory + '/').filter(isPublicAsset));
    }
  }
  for (const name of selected) {
    const path = resolve(root, name);
    if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw Error('Missing or unsafe browser input: ' + name);
  }
  rmSync(output, {recursive: true, force: true});
  for (const name of selected) {
    const target = resolve(output, name);
    mkdirSync(resolve(target, '..'), {recursive: true});
    cpSync(resolve(root, name), target);
  }
  return verifyPublicAssets(output);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = process.argv[2] === '--check' ? verifyPublicAssets() : buildPublicAssets();
  console.log('public_assets_verified ' + JSON.stringify(result));
}


