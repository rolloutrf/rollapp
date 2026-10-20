import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { browserLaunchOptions, smokePort } from './browser-runtime.mjs';
const port = smokePort(5298);
import { checkIdentityChartStability, checkIdentityReportCharts, checkIdentityChartNavigation } from './identity-report-chart-checks.mjs';

const review = process.env.HOGAN_SCALES_REVIEW_LAYOUT ? JSON.parse(await readFile(process.env.HOGAN_SCALES_REVIEW_LAYOUT, 'utf8')) : null;
const server = await createServer({
  define: { __HOGAN_SCALES_REVIEW__: JSON.stringify(review) },
  cacheDir: 'node_modules/.vite-hogan-scales',
  server: { host: '127.0.0.1', port, strictPort: true, hmr: false, watch: null },
  plugins: [{ name: 'hogan-scales-fixture', configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith('/__hogan-scales')) return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/hogan-scales.jsx"></script></body></html>'));
    });
  } }],
});
await server.listen();
const origin = `http://127.0.0.1:${port}`;
const browser = await chromium.launch(browserLaunchOptions());
try {
  if (!review) await checkIdentityReportCharts(browser, origin, {navigationOnly:process.argv.includes('--navigation-only'),slowFonts:process.argv.includes('--slow-fonts')});
  else {
    const blocks = review.pages.flatMap(page => page.blocks);
    const scores = blocks.filter(block => block.type === 'score-chart').flatMap(block => block.rows);
    const subscales = blocks.filter(block => block.type === 'subscale-charts').flatMap(block => block.columns.flatMap(column => column.sections.flatMap(section => section.rows)));
    for (const [width, height] of [[320,844],[390,844],[390,400],[768,844],[820,844],[1024,844],[1440,844],[1920,844]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', route => { errors.push('Unexpected API request'); return route.abort(); });
      await page.goto(`${origin}/__hogan-scales`);
      await page.locator('.identity-pdf-subscale__cells').last().waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.deepEqual(await page.locator('.identity-pdf-score__value').allTextContents(), scores.map(row => row.value));
      assert.equal(await page.locator('.identity-pdf-subscale__cells').count(), subscales.length);
      assert.equal(await page.locator('.identity-pdf-subscale__cells > span').count(), subscales.reduce((sum, row) => sum + row.cells.length, 0));
      assert.deepEqual(await page.locator('.identity-pdf-subscale__cells').evaluateAll(nodes => nodes.map(node => [...node.children].map(cell => cell.style.backgroundColor))), subscales.map(row => row.cells.map(color => {
        const values = [1,3,5].map(start => parseInt(color.slice(start, start + 2), 16));
        return Math.max(...values) - Math.min(...values) > 40 ? `rgb(${values.join(', ')})` : '';
      })));
      const overflow = await page.evaluate(() => ({ root: document.documentElement.scrollWidth > innerWidth + 1, descendants: [...document.querySelectorAll('.identity-pdf-content *')].filter(el => el.clientWidth && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== 'inline').map(el => el.className || el.tagName) }));
      assert(!overflow.root, `${width}: source root overflow`);
      assert.deepEqual(overflow.descendants, [], `${width}: source descendants`);
      await checkIdentityChartNavigation(page, width);
      if (width === 390 || width === 1440) {
        await page.locator('.identity-pdf-scores').first().scrollIntoViewIfNeeded();
        await page.screenshot({ path: `/tmp/rollapp-hogan-source-scales-${width}-${height}.png` });
        await page.locator('.identity-pdf-subscale-columns').evaluate(node => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
        await page.screenshot({ path: `/tmp/rollapp-hogan-source-subscales-${width}-${height}.png` });
      }
      assert.deepEqual(errors, []);
      console.log(`PASS source Hogan ${width}×${height}: ${scores.length} scores, ${subscales.length} subscales, every source segment and no overflow/API`);
      await page.close();
    }
  }
  if (!review && !process.argv.includes("--navigation-only")) await checkIdentityChartStability(browser, origin);
} finally { await browser.close(); await server.close(); }
