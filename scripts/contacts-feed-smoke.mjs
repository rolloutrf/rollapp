import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { browserLaunchOptions } from './browser-runtime.mjs';
import { listenSmokeServer, smokePort, smokeOrigin } from './smoke-server.mjs';
const server = await createServer({ cacheDir: 'node_modules/.vite-contacts-smoke', server: { host: '127.0.0.1', port: smokePort(process.env.CONTACTS_PORT), strictPort: true, hmr: false, watch: null }, plugins: [{
  name: 'contacts-feed-fixture', enforce: 'pre',
  transform(source, id) { if (id.includes('/src/App.jsx?contacts-feed-test-export')) return `${source}\nexport { ContactsSpherePage, ToastProvider };`; },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (!req.url.startsWith('/__contacts-feed')) return next();
    res.setHeader('Content-Type', 'text/html');
    res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/contacts-feed.jsx"></script></body></html>'));
  }); },
}] });
await listenSmokeServer(server);
const origin = smokeOrigin(server);
const browser = await chromium.launch(browserLaunchOptions());
try {
  for (const [width, height] of [[320,844],[390,844],[768,844],[820,844],[1024,844],[1440,844],[1920,844],[1440,400]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/**', (route) => { errors.push('Unexpected API request'); return route.abort(); });
    await page.goto(`${origin}/__contacts-feed`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => document.querySelectorAll('.contact-card').length === 48);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => { window.firstCard = document.querySelector('.contact-card'); window.feedTest.failNext = true; scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}); });
    await page.getByRole('button', { name: 'Попробовать снова', exact: true }).waitFor();
    assert.equal(await page.locator('.contact-card').count(), 48, 'Failed append must retain cards');
    await page.getByRole('button', { name: 'Попробовать снова', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.contact-card').length === 96);
    assert(await page.evaluate(() => window.firstCard === document.querySelector('.contact-card')), 'Append remounted the grid');
    const star = page.getByRole('button', { name: 'Добавить Контакт 070 в избранное', exact: true });
    await star.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    const before = await page.evaluate(() => ({ y: scrollY, requests: window.feedTest.requests.length }));
    await page.evaluate(() => { window.framesY = []; window.track = true; const frame = () => { window.framesY.push(scrollY); if(window.track) requestAnimationFrame(frame); }; frame(); });
    await star.click();
    await page.getByRole('button', { name: 'Убрать Контакт 070 из избранного', exact: true }).waitFor();
    await page.waitForTimeout(250);
    await page.evaluate(() => { window.track = false; });
    assert(await page.evaluate((y) => window.framesY.every((value) => Math.abs(value-y)<2), before.y), 'Favorite moved scroll position');
    assert.equal(await page.evaluate(() => window.feedTest.requests.length), before.requests, 'Favorite reloaded list');
    assert(await page.evaluate(() => window.firstCard === document.querySelector('.contact-card')));
    await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await page.waitForFunction(() => document.querySelectorAll('.contact-card').length === 144);
    await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await page.waitForFunction(() => document.querySelectorAll('.contact-card').length === 145);
    assert.equal(await page.locator('.contacts-load-more').count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal page overflow');
    assert.equal(await page.locator('.contact-card__name-row strong').first().textContent(), 'Контакт 000');
    await page.screenshot({ path: `/tmp/rollapp-contacts-${width}-${height}.png` });
    await page.evaluate(() => { window.feedTest.failPatch = true; });
    await page.getByRole('button', {name:'Добавить Контакт 144 в избранное',exact:true}).click();
    await page.getByText('Не удалось сохранить', {exact:true}).waitFor();
    assert.equal(await page.getByRole('button', {name:'Добавить Контакт 144 в избранное',exact:true}).getAttribute('aria-pressed'), 'false');
    await page.evaluate(() => scrollTo({top:0,behavior:'instant'}));
    await page.getByRole('button', {name:/^Избранные/}).click();
    await page.waitForFunction(() => document.querySelectorAll('.contact-card').length === 1);
    await page.evaluate(() => { window.feedTest.failPatch = false; });
    await page.getByRole('button', {name:'Убрать Контакт 070 из избранного',exact:true}).click();
    await page.getByText('В избранном пока нет контактов', {exact:true}).waitFor();
    await page.getByRole('button', {name:/^Избранные/}).click();
    await page.waitForFunction(() => document.querySelectorAll('.contact-card').length === 48);
    await page.evaluate(() => { window.feedTest.delay = 450; scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}); });
    await page.waitForFunction(() => document.querySelector('.contacts-load-more[aria-busy="true"]'));
    await page.evaluate(() => scrollTo({top:0,behavior:'instant'}));
    await page.getByRole('searchbox').fill('Контакт 001');
    await page.waitForFunction(() => document.querySelectorAll('.contact-card').length === 1);
    await page.waitForTimeout(550);
    assert.equal(await page.locator('.contact-card__name-row strong').textContent(), 'Контакт 001');
    await page.getByRole('searchbox').fill('Не существует');
    await page.getByText('Контакты не найдены', {exact:true}).waitFor();
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}×${height}: append, retry, end, favorite scroll/DOM, failure, filters, stale request, overflow`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
