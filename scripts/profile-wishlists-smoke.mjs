import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { browserLaunchOptions } from './browser-runtime.mjs';
import { listenSmokeServer, smokeOrigin } from './smoke-server.mjs';

const server = await createServer({
  cacheDir: 'node_modules/.vite-profile-wishlists-smoke',
  server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false, watch: null },
  plugins: [{
    name: 'profile-wishlist-fixture', enforce: 'pre',
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/fixture') && !req.url.startsWith('/app/wishes')) return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/profile-wishlists.jsx"></script></body></html>'));
      });
    },
  }],
});
await listenSmokeServer(server);
const origin = smokeOrigin(server);
const browser = await chromium.launch(browserLaunchOptions());
try {
  for (const [width, height] of [[320,844], [390,400], [767,844], [768,844], [820,450], [1024,844], [1440,900], [1920,900]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: width < 768 ? 3 : 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => { errors.push('Unexpected network API request'); return route.abort(); });
    await page.goto(origin + '/fixture');
    const open = page.getByRole('button', { name: 'Редактировать профиль Профиль', exact: true });
    const openPersonal = async () => {
      await open.click();
      await page.getByRole('button', { name: 'Персональная информация', exact: true }).click();
    };
    await openPersonal();
    const save = page.getByRole('button', { name: 'Сохранить', exact: true });
    const wishlist = page.getByRole('region', { name: 'Внешние вишлисты' });
    const inputs = ['OhMyWishes', 'Ozon', 'WB'].map(name => wishlist.getByRole('textbox', { name, exact: true }));
    assert(await save.isDisabled());
    assert(await save.evaluate(button => button.form?.id === 'profile-editor-form'));
    await inputs[1].fill('https://ozon.ru.example/t/test');
    await save.click();
    await wishlist.getByRole('alert').waitFor();
    assert.equal(await inputs[1].getAttribute('aria-invalid'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'settings-wishlist-ozon');
    assert.deepEqual(await page.evaluate(() => window.profilePatches), []);
    const urls = [
      'https://ohmywishes.com/users/example/lists/example',
      'https://ozon.ru/t/example?share=1',
      'https://www.wildberries.ru/wishlist/example',
    ];
    for (const [index, input] of inputs.entries()) {
      await input.fill(urls[index]);
      await input.scrollIntoViewIfNeeded();
      const box = await input.boundingBox();
      assert(box.x >= 0 && box.x + box.width <= width && box.height >= 47.5);
      assert(await input.evaluate(el => el.closest('section').scrollWidth <= el.closest('section').clientWidth + 1));
    }
    if (width < 768) {
      const back = page.getByRole('button', { name: 'Назад', exact: true });
      const saveBox = await save.boundingBox();
      const backBox = await back.boundingBox();
      assert.equal(saveBox.y, backBox.y);
      assert.equal(saveBox.height, 48);
      assert.equal(backBox.height, 48);
      assert(await wishlist.evaluate(el => {
        const viewport = el.closest('[data-slot="scroll-area-viewport"]');
        return !viewport || (viewport.scrollHeight <= viewport.clientHeight + 1 && viewport.scrollTop === 0);
      }));
      if (height === 400) {
        await page.evaluate(() => {
          Object.defineProperties(visualViewport, {
            height: { configurable: true, value: 280 },
            offsetTop: { configurable: true, value: 40 },
          });
          visualViewport.dispatchEvent(new Event('resize'));
        });
        await page.waitForFunction(() => document.documentElement.hasAttribute('data-overlay-keyboard'));
        for (const action of [save, back]) {
          const box = await action.boundingBox();
          assert.equal(box.y + box.height, 304);
        }
        await page.evaluate(() => {
          delete visualViewport.height;
          delete visualViewport.offsetTop;
          visualViewport.dispatchEvent(new Event('resize'));
        });
        await page.waitForFunction(() => !document.documentElement.hasAttribute('data-overlay-keyboard'));
      }
    }
    await page.evaluate(() => document.fonts.ready);
    if ([320,390,820,1440].includes(width)) await page.screenshot({ path: `/tmp/rollapp-profile-wishlists-form-${width}.png` });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.evaluate(() => { window.rejectProfileSave = true; });
    await save.click();
    await page.getByText('Сохранение недоступно', { exact: true }).waitFor();
    assert.equal(await inputs[1].inputValue(), urls[1]);
    await page.evaluate(() => { window.rejectProfileSave = false; });
    await save.click();
    await open.waitFor();
    const nav = page.getByRole('navigation', { name: 'Внешние вишлисты' });
    await nav.waitFor();
    const links = await nav.getByRole('link').all();
    assert.equal(links.length, urls.length);
    for (const [index, link] of links.entries()) {
      assert.equal(await link.getAttribute('href'), urls[index]);
      assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
      assert.equal(await link.getAttribute('target'), '_blank');
      const box = await link.boundingBox();
      assert(box.x >= 0 && box.x + box.width <= width && box.height >= 47.5);
      assert.equal(await link.evaluate(el => getComputedStyle(el).fontSize), '18px');
      assert(await link.evaluate(el => parseFloat(getComputedStyle(el).borderTopLeftRadius) >= 24));
    }
    await openPersonal();
    assert.equal(await inputs[1].inputValue(), urls[1]);
    await inputs[1].clear();
    await save.click();
    await wishlist.waitFor({ state: 'detached' });
    await nav.waitFor();
    await nav.getByRole('link', { name: /Ozon/ }).waitFor({ state: 'detached' });
    assert.equal(await nav.getByRole('link').count(), 2);
    assert.deepEqual(await page.evaluate(() => window.profilePatches.at(-1)), { wishlistLinks: { ozon: null } });
    await openPersonal();
    await inputs[0].clear();
    await page.getByRole('button', { name: 'Назад', exact: true }).click();
    await wishlist.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: width < 768 ? 'Назад' : 'Закрыть', exact: true }).click();
    await nav.waitFor();
    assert.equal(await nav.getByRole('link').count(), 2);
    if (width === 320 || width === 1440) {
      await openPersonal();
      const address = page.getByRole('textbox', { name: 'Адрес профиля' });
      await address.fill('fixture-renamed');
      await address.press('Enter');
      await page.waitForURL(origin + '/fixture-renamed');
      await nav.waitFor();
      assert.equal(await nav.getByRole('link').count(), 2);
    }
    assert.deepEqual(await page.evaluate(() => window.unexpectedRequests), []);
    await page.goto(origin + '/fixture?guest');
    await nav.waitFor();
    assert.equal(await nav.getByRole('link').count(), 3);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(await page.evaluate(() => window.unexpectedRequests), []);
    assert.deepEqual(errors, []);
    if ([320,390,820,1440].includes(width)) await page.screenshot({ path: `/tmp/rollapp-profile-wishlists-guest-${width}.png` });
    if (width === 320 || width === 1440) {
      await page.goto(origin + '/app/wishes?tab=products');
      await nav.waitFor();
      assert.deepEqual(await nav.getByRole('link').evaluateAll(anchors => anchors.map(anchor => anchor.href)), urls);
      await openPersonal();
      assert.equal(await inputs[2].inputValue(), urls[2]);
      await inputs[2].clear();
      await save.click();
      await wishlist.waitFor({ state: 'detached' });
      await open.waitFor();
      await nav.waitFor();
      await nav.getByRole('link', { name: /WB/ }).waitFor({ state: 'detached' });
      assert.deepEqual(await nav.getByRole('link').evaluateAll(anchors => anchors.map(anchor => anchor.href)), urls.slice(0, 2));
      assert.deepEqual(await page.evaluate(() => window.profilePatches), [{ wishlistLinks: { wb: null } }]);
      assert.deepEqual(await page.evaluate(() => window.unexpectedRequests), []);
      assert.deepEqual(errors, []);
    }
    await page.close();
    console.log(`PASS ${width}×${height}: validation, error/retry, save, remove, cancel, guest links, control geometry`);
  }
} finally {
  await browser.close();
  await server.close();
}
