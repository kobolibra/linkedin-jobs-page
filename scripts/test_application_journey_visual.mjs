/**
 * Browser-level visual contract for the actual application Sankey SVG and CSS.
 * Generates only synthetic job histories; never signs in or reads private data.
 *
 * Run: npm install --ignore-scripts --no-save playwright@1.56.1
 *      npx playwright install chromium
 *      node scripts/test_application_journey_visual.mjs
 */
import { strict as assert } from 'node:assert';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('job-applications.js', root), 'utf8');
const css = [
  readFileSync(new URL('styles.css', root), 'utf8'),
  readFileSync(new URL('job-applications.css', root), 'utf8'),
].join('\n');
const output = resolve('artifacts', 'journey-visual');
mkdirSync(output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const cases = [
  { name: 'desktop-light', width: 1440, height: 900, mode: 'light', jobs: 40 },
  { name: 'desktop-dark', width: 1440, height: 900, mode: 'dark', jobs: 40 },
  { name: 'laptop-compact', width: 1280, height: 720, mode: 'light', jobs: 40 },
  { name: 'mobile-portrait', width: 390, height: 844, mode: 'light', jobs: 40, touch: true },
  { name: 'mobile-landscape-dark', width: 844, height: 390, mode: 'dark', jobs: 40, touch: true },
  { name: 'dense-desktop', width: 1920, height: 1080, mode: 'light', jobs: 90 },
  { name: 'empty-account', width: 1280, height: 800, mode: 'light', jobs: 0 },
];
const results = [];
const cssRoot = '<style>' + css.replaceAll('</style', '<\\/style') + '</style>';
const html = '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' + cssRoot +
  '</head><body><dialog class="application-journey" aria-labelledby="ap-journey-title">' +
  '<header class="ap-journey-head"><div><h2 id="ap-journey-title">Your application journey</h2></div>' +
  '<dl class="ap-kpis"></dl><button type="button" class="ap-close" aria-label="Close application journey">×</button></header>' +
  '<div class="ap-chart" tabindex="0" aria-label="Application flow chart, fitted to the screen."></div>' +
  '<div class="ap-legend"><span class="ap-key-progress">Applied</span><span class="ap-key-contact">Recruiter Contact</span><span class="ap-key-interviews">Interviews</span><span class="ap-key-waiting">In progress / Not applied</span><span class="ap-key-offer">Offer</span><span class="ap-key-no-response">No Response</span><span class="ap-key-rejected">Rejected</span></div>' +
  '<details class="ap-accessible-data"><summary>Current stage breakdown</summary><dl class="ap-stage-summary"></dl></details>' +
  '<footer>Private to your account · Widths show role counts; percentages use saved roles in this view.</footer></dialog></body></html>';

try {
  for (const sample of cases) {
    const context = await browser.newContext({
      viewport: { width: sample.width, height: sample.height },
      deviceScaleFactor: 1,
      isMobile: !!sample.touch,
      hasTouch: !!sample.touch,
    });
    const page = await context.newPage();
    try {
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.setContent(html, { waitUntil: 'load' });
      await page.addScriptTag({ content: source });
      const check = await page.evaluate(({ mode, count }) => {
        document.documentElement.dataset.theme = mode;
        const api = window.JobApplications;
        if (!api) throw Error('Application graph not exported');
        const fav = [], states = new Map();
        const progression = ['applied', 'contact', 'first', 'second', 'final', 'offer'];
        for (let i = 0; i < count; i++) {
          const job = 'visual:' + i; fav.push(job);
          let state = null;
          if (i % 11 !== 0) {
            const steps = 1 + i % progression.length;
            for (let j = 0; j < steps; j++) {
              const stage = progression[j];
              state = api.transition(state, stage, {
                job, region: ['CN', 'HK', 'SG', 'OTHER', 'UNKNOWN'][i % 5],
                id: 'visual_' + String(i).padStart(8, '0') + '_' + String(j).padStart(8, '0'),
                time: 1000 + i * 10 + j,
              });
            }
            if (i % 9 === 0) state = api.transition(state, 'rejected', {
              job, id: 'reject_' + String(i).padStart(16, '0'), time: 5000 + i * 10,
            });
            else if (i % 7 === 0) state = api.transition(state, 'no_response', {
              job, id: 'silent_' + String(i).padStart(16, '0'), time: 5000 + i * 10,
            });
          }
          if (state) states.set(job, state);
        }
        const data = api.graph(fav, states);
        const dialog = document.querySelector('.application-journey');
        const phonePortrait = matchMedia('(pointer:coarse) and (orientation:portrait)').matches;
        const compact = (phonePortrait ? innerWidth : innerHeight) < 850;
        const chart = dialog.querySelector('.ap-chart');
        chart.innerHTML = count ? api.svg(data, { compact }) :
          '<div class="ap-empty"><h3>No saved roles yet</h3><p>Save a role and record your progress to see it here.</p></div>';
        dialog.querySelector('.ap-legend').hidden = !count;
        dialog.querySelector('.ap-kpis').innerHTML = [
          ['Saved', data.total], ['Applications', data.applied],
          ['Interviewing', data.interviewing], ['Offers', data.counts.offer],
        ].map(([name, value]) => '<div><dt>' + name + '</dt><dd>' + value + '</dd></div>').join('');
        dialog.querySelector('.ap-stage-summary').innerHTML = api.stages.map(([key, text]) =>
          '<div><dt>' + text + '</dt><dd>' + data.counts[key] + '</dd></div>').join('');
        dialog.showModal();
        const styles = getComputedStyle(dialog);
        const svg = dialog.querySelector('svg');
        const flows = [...dialog.querySelectorAll('.ap-flow')];
        const groups = [...dialog.querySelectorAll('.ap-node')];
        const result = {
          count, compact, phonePortrait, isOpen: dialog.open,
          nodes: groups.length, flows: flows.length,
          canvas: styles.backgroundColor, toneSource: styles.getPropertyValue('--ap-tone-source').trim(),
          expectedCanvas: styles.getPropertyValue('--ap-canvas').trim(),
          hasOffer: flows.some(x => x.style.fill.includes('--ap-flow-offer')),
          hasRejected: flows.some(x => x.style.fill.includes('--ap-flow-rejected')),
          hasSilence: flows.some(x => x.style.fill.includes('--ap-flow-no_response')),
          transform: styles.transform,
          allFlowLabels: flows.every(x => x.getAttribute('aria-label')?.includes(':') && x.getAttribute('tabindex') === '0'),
          graphBalanced: data.nodes.every(node => {
            const to = data.links.filter(x => x.target === node.id).reduce((a,x) => a+x.value, 0);
            const from = data.links.filter(x => x.source === node.id).reduce((a,x) => a+x.value, 0);
            return !(to && from) || to === from;
          }),
        };
        const r = el => { const b = el.getBoundingClientRect(); return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height} };
        result.bounds = { dialog:r(dialog),chart:r(chart),svg:svg?r(svg):null,viewport:{w:innerWidth,h:innerHeight} };
        if (svg) {
          const viewBox = svg.viewBox.baseVal;
          result.viewBox = { width:viewBox.width,height:viewBox.height };
          result.hasNaN = /NaN|Infinity/.test(svg.outerHTML);
          const computed = getComputedStyle(flows[0]);
          result.ribbonColor = computed.fill;
          const regions = [...svg.querySelectorAll('.ap-region-code')];
          result.labelBounding = regions.map(r);
          result.invisibleFlowCount = flows.filter(f => getComputedStyle(f).fill === 'none').length;
          const rect = svg.getBoundingClientRect();
          result.chartScreenVisible = rect.width > 0 && rect.height > 0 &&
            rect.x >= -2 && rect.y >= -2 && rect.right <= innerWidth+2 && rect.bottom <= innerHeight+2;
        }
        return result;
      }, { mode: sample.mode, count: sample.jobs });
      assert.ok(check.isOpen, sample.name + ': dialog should be open');
      assert.equal(check.count, sample.jobs);
      assert.ok(check.graphBalanced, sample.name + ': flow conservation failed');
      if (sample.jobs > 0) {
        assert.ok(check.nodes && check.flows, sample.name + ': graph is empty');
        assert.ok(check.allFlowLabels, sample.name + ': accessible ribbon labels');
        assert.ok(check.hasOffer && check.hasRejected && check.hasSilence,
          sample.name + ': terminal outcome ribbons must use their own colors');
        assert.ok(check.viewBox.width > 0 && check.viewBox.height > 0, sample.name + ': invalid SVG dimensions');
        assert.ok(!check.hasNaN, sample.name + ': SVG contains non-finite values');
        assert.equal(check.invisibleFlowCount, 0, sample.name + ': invisible ribbons');
        assert.ok(check.chartScreenVisible, sample.name + ': SVG is clipped by viewport');
      } else {
        assert.equal(check.nodes, 0);
        assert.equal(check.flows, 0);
      }
      assert.equal(pageErrors.length, 0, sample.name + ': browser JS errors: ' + pageErrors.join(', '));
      if (sample.name === 'desktop-light' || sample.name === 'desktop-dark') {
        const flow = page.locator('.ap-flow').first();
        await flow.focus();
        const focus = await flow.evaluate(el => ({
          stroke: getComputedStyle(el).stroke,
          opacity: getComputedStyle(el).fillOpacity,
        }));
        assert.notEqual(focus.stroke, 'none', sample.name + ': ribbon keyboard focus outline is invisible');
        check.focus = focus;
      }
      await page.evaluate(() => document.activeElement?.blur());
      await page.evaluate(() => document.fonts.ready);
      const screenshot = await page.screenshot({ type: 'jpeg', quality: 72, fullPage: false });
      writeFileSync(resolve(output, sample.name + '.jpg'), screenshot);
      // Compact transport proof: these exact screenshots can be inspected in CI logs.
      if (['desktop-light', 'desktop-dark', 'mobile-portrait'].includes(sample.name)) {
        const tiny = await page.screenshot({ type: 'jpeg', quality: 38, fullPage: false });
        console.log('JOURNEY_VISUAL_JPEG_' + sample.name.toUpperCase().replaceAll('-', '_') + '=' + tiny.toString('base64'));
      }
      results.push({ name: sample.name, ...check });
      console.log('PASS ' + sample.name + ' ' + JSON.stringify({
        ...check, labelBounding: check.labelBounding?.length + ' source-region labels',
      }));
    } finally {
      await context.close();
    }
  }
  writeFileSync(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log('PASS complete browser visual suite: ' + cases.length + ' responsive/theme states');
} finally {
  await browser.close();
}
