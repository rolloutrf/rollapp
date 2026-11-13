import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { listenSmokeServer, smokePort, smokeOrigin } from './smoke-server.mjs';
import { browserLaunchOptions } from './browser-runtime.mjs';
import { smokeBaseUiDependencies } from './smoke-dependencies.mjs';

const server = await createServer({
  cacheDir: 'node_modules/.vite-lab-results-smoke',
  optimizeDeps: { include: smokeBaseUiDependencies },
  server: { host: '127.0.0.1', port: smokePort(process.env.LAB_RESULTS_PORT), strictPort: true, hmr: false, watch: null },
  plugins: [{ name: 'lab-results-fixture', transform(source, id) {
    if (id.endsWith('/src/lib/sphere-sharing.jsx')) return `${source}\nexport { SphereSharingContext };`;
  }, configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith('/__lab-results')) return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/lab-results.jsx"></script></body></html>'));
    });
  } }],
});
await listenSmokeServer(server);
const browser = await chromium.launch(browserLaunchOptions());
try {
  for (const theme of ['light', 'dark']) for (const dpr of [1, 3]) {
    for (const [width, height] of [[320,844],[390,844],[768,844],[820,844],[1024,844],[1440,844],[1920,844],[390,400]]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', route => { errors.push('Unexpected API request'); return route.abort(); });
      await page.goto(`${smokeOrigin(server)}/__lab-results`);
      await page.locator('[data-slot=card]').first().waitFor();
      await page.evaluate(async theme => { document.documentElement.classList.toggle('dark', theme === 'dark'); await document.fonts.ready; }, theme);
      const trigger = page.locator('[data-slot=accordion-trigger]');
      // Test initial opening and a real close/reopen; settled edges must all survive clipping.
      for (let opening = 0; opening < 2; opening++) {
        if (opening) { await trigger.click(); await trigger.click(); }
        await page.waitForFunction(() => document.querySelector('[data-slot=accordion-trigger]').getAttribute('aria-expanded') === 'true' && document.getAnimations().every(a => a.playState === 'finished'));
        const geometry = await page.locator('[data-slot=card]').evaluateAll(cards => cards.map(card => {
          const r = card.getBoundingClientRect();
          const clipped = [];
          for (let ancestor = card.parentElement; ancestor; ancestor = ancestor.parentElement) {
            const style = getComputedStyle(ancestor), a = ancestor.getBoundingClientRect();
            if (['hidden','clip','auto','scroll'].includes(style.overflowX) && (r.left - 1 < a.left - .01 || r.right + 1 > a.right + .01)) clipped.push('horizontal');
            if (['hidden','clip','auto','scroll'].includes(style.overflowY) && (r.top - 1 < a.top - .01 || r.bottom + 1 > a.bottom + .01)) clipped.push('vertical');
          }
          return clipped;
        }));
        assert.deepEqual(geometry, [[],[],[]], `${theme}/${dpr}/${width}: card ring clipped`);
      }
      // Actual painted pixels, not only DOM boxes: the straight top and bottom edges match.
      const card = page.locator('[data-slot=card]').first();
      await card.scrollIntoViewIfNeeded();
      const rect = await card.boundingBox();
      const shot = await page.screenshot();
      const { data, info } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const pixel = (x,y) => [...data.subarray((Math.floor(y*dpr)*info.width+Math.floor(x*dpr))*3, (Math.floor(y*dpr)*info.width+Math.floor(x*dpr))*3+3)];
      const x = rect.x + rect.width / 2;
      assert.deepEqual(pixel(x, rect.y - .5), pixel(x, rect.y + rect.height + .5), 'top/bottom painted ring mismatch');
      assert.notDeepEqual(pixel(x, rect.y - .5), pixel(x, rect.y - 2), 'top ring missing');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
      if ([390,1440].includes(width) && dpr === 1) await page.screenshot({ path: `/tmp/rollapp-lab-results-${theme}-${width}-${height}.png` });
      console.log(`PASS lab card edges ${theme} DPR${dpr} ${width}x${height}`);
      if (dpr === 1) {
        const history = `${smokeOrigin(server)}/__lab-results?history`;
        await page.goto(history);
        await page.evaluate(theme => document.documentElement.classList.toggle('dark', theme === 'dark'), theme);
        const tile = date => page.getByRole('button', { name: date, exact: true });
        const menu = date => page.getByRole('button', { name: `Действия с анализом от ${date}`, exact: true });
        const latest = '15 августа 2025';
        const previous = '10 августа 2025';
        const oldest = '7 июля 2025';
        await tile(latest).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Настройки списка', exact: true }).count(), 0);
        assert.equal(await page.getByRole('link', { name: 'Открыть магазин за роллы' }).count(), 1);
        assert.equal(await menu(previous).evaluate(button => {
          const box = button.getBoundingClientRect();
          const tile = button.closest('.list-tabs__editable-tile').querySelector('[data-list-tile]').getBoundingClientRect();
          return box.width === 48 && box.height === 48 && box.right === tile.right && box.top === tile.top;
        }), true);
        if ([390,1440].includes(width) && height === 844) await page.screenshot({ path: `/tmp/rollapp-lab-history-${theme}-${width}.png` });
        await menu(previous).focus();
        await page.keyboard.press('Enter');
        await page.getByRole('menuitem', { name: 'Удалить анализ' }).click();
        await page.getByRole('alertdialog', { name: `Удалить анализ от ${previous}?` }).waitFor();
        assert.equal(await page.locator('[data-list-tile][aria-pressed="true"]').getAttribute('aria-label'), latest);
        await page.getByRole('button', { name: 'Отмена', exact: true }).click();
        await page.waitForFunction(label => document.activeElement?.getAttribute('aria-label') === label, `Действия с анализом от ${previous}`);
        assert.deepEqual(await page.evaluate(() => window.labDeletes), []);
        await menu(previous).click();
        await page.getByRole('menuitem', { name: 'Удалить анализ' }).click();
        if (width === 390 && height === 844) {
          await page.evaluate(() => { window.failLabDelete = true; });
          await page.getByRole('button', { name: 'Удалить', exact: true }).click();
          await page.getByText('Не удалось удалить анализ', { exact: true }).waitFor();
          await page.evaluate(() => { window.failLabDelete = false; });
        }
        await page.getByRole('button', { name: 'Удалить', exact: true }).click();
        await tile(previous).waitFor({ state: 'detached' });
        assert.equal(await tile(latest).getAttribute('aria-pressed'), 'true');
        assert.equal(await page.evaluate(() => window.labDeletes.at(-1)), '/health/lab-results/2025-08-10');
        await tile(oldest).click();
        await page.getByRole('button', { name: /Показатели 3/ }).waitFor();
        await menu(oldest).click();
        await page.getByRole('menuitem', { name: 'Удалить анализ' }).click();
        await page.getByRole('button', { name: 'Удалить', exact: true }).click();
        await tile(oldest).waitFor({ state: 'detached' });
        assert.equal(await tile(latest).getAttribute('aria-pressed'), 'true');
        await page.goto(`${history}&readonly`);
        await tile(latest).waitFor();
        assert.equal(await menu(latest).count(), 0);
        assert.equal(await page.locator('[data-add-fab]').count(), 0);
        assert.deepEqual(errors, []);
        console.log(`PASS lab history ${theme} ${width}x${height}: tile menu, focus, selected report, deletion, read-only`);
      }
      await page.close();
    }
  }
} finally { await browser.close(); await server.close(); }
