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
  for (const [width, height] of [[320,844], [390,400], [390,844], [767,844], [768,844], [820,450], [1024,844], [1440,900], [1920,900]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: width < 768 ? 3 : 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => { errors.push('Unexpected network API request'); return route.abort(); });
    await page.goto(origin + '/fixture');
    const open = page.getByRole('button', { name: 'Редактировать профиль Профиль', exact: true });
    const wishlistEntry = page.getByRole('button', { name: 'Внешние вишлисты', exact: true });
    const personalEntry = page.getByRole('button', { name: 'Персональная информация', exact: true });
    const openWishlists = async () => {
      await open.click();
      await wishlistEntry.click();
    };
    if (width === 320) {
      await open.click();
      await personalEntry.click();
      assert.equal(await page.getByRole('textbox', { name: 'Яндекс Маркет' }).count(), 0);
      await page.getByRole('textbox', { name: 'Имя', exact: true }).fill('Черновик имени');
      await page.getByRole('button', { name: 'Назад', exact: true }).click();
      await wishlistEntry.click();
    } else await openWishlists();
    const save = page.getByRole('button', { name: 'Сохранить', exact: true });
    const wishlist = page.getByRole('region', { name: 'Внешние вишлисты' });
    const backToMenu = async () => {
      await page.getByRole('button', { name: 'Назад', exact: true }).click();
      await wishlistEntry.waitFor();
    };
    const closeSettings = async () => {
      await page.getByRole('button', { name: width < 768 ? 'Назад' : 'Закрыть', exact: true }).click();
      await open.waitFor();
    };
    const saveWishlists = async () => {
      await save.click();
      await page.waitForFunction(() => {
        const button = document.querySelector('button[form="profile-wishlists-form"]');
        return button?.disabled && button.getAttribute('aria-busy') !== 'true';
      });
    };
    const inputs = ['OhMyWishes', 'Ozon', 'WB', 'Яндекс Маркет'].map(name => wishlist.getByRole('textbox', { name, exact: true }));
    const importBrowser = wishlist.getByRole('button', { name: 'Импортировать все списки · Яндекс Маркет', exact: true });
    const importBox = await importBrowser.boundingBox();
    assert(importBox.x >= 0 && importBox.x + importBox.width <= width && importBox.height >= 47.5);
    assert.equal(await importBrowser.evaluate(el => getComputedStyle(el).paddingInlineStart), '24px');
    if (width === 320 || width === 1440) {
      await importBrowser.click();
      await wishlist.getByRole('status').getByText(/Установите или обновите расширение Rollapp/).waitFor();
      assert.deepEqual(await page.evaluate(() => window.browserWishlistImports), []);
      await page.evaluate(() => {
        window.addEventListener('message', ({ data, origin, source }) => {
          if (source !== window || origin !== location.origin || data?.source !== 'rollapp-page') return;
          const type = data.type === 'ROLLAPP_WISHLIST_PING' ? 'ROLLAPP_WISHLIST_PONG'
            : data.type === 'ROLLAPP_WISHLIST_IMPORT' ? 'ROLLAPP_WISHLIST_RESULT' : null;
          if (!type) return;
          const items = [{ url: 'https://market.yandex.ru/card/example/1001', title: 'Карточка из браузера' }];
          window.postMessage({ type, source: 'rollapp-retailer-helper', requestId: data.requestId, result: { ok: true, items } }, location.origin);
        });
      });
      await importBrowser.click();
      await wishlist.getByRole('status').getByText('Добавлено в «Товары»: 1. Уже было в Rollapp: 0.').waitFor();
      assert.deepEqual(await page.evaluate(() => window.browserWishlistImports), [{
        ownerId: 'fixture',
        items: [{ url: 'https://market.yandex.ru/card/example/1001', title: 'Карточка из браузера' }],
      }]);
      assert.deepEqual(await page.evaluate(() => window.profilePatches), []);
    }
    assert(await save.isDisabled());
    assert(await save.evaluate(button => button.form?.id === 'profile-wishlists-form'));
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
      'https://market.yandex.ru/cc/example?share=1',
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
    await page.evaluate(() => { window.rejectProfileSave = false; window.rejectMarketImport = true; });
    await saveWishlists();
    assert.deepEqual(await page.evaluate(() => window.wishlistImports), ['ohmywishes', 'yandex-market']);
    await page.getByRole('status').getByText('Добавлено в «Товары»: 1.', { exact: true }).waitFor();
    await page.getByRole('status').getByText('Не удалось прочитать список Маркета').waitFor();
    if (width === 320 || width === 1440) {
      await page.getByRole('button', { name: 'Импортировать позиции · OhMyWishes' }).click();
      await page.getByRole('status').getByText('Новых позиций среди прочитанных нет.').waitFor();
      await page.evaluate(() => { window.rejectMarketImport = false; });
      await page.getByRole('button', { name: 'Импортировать позиции · Яндекс Маркет' }).click();
      await page.getByRole('status').getByText('Добавлено в «Товары»: 1. Сервис отдал только первую страницу списка.', { exact: true }).waitFor();
      await page.screenshot({ path: `/tmp/rollapp-profile-wishlist-import-${width}.png` });
    }
    await backToMenu();
    if (width === 320) {
      await personalEntry.click();
      assert.equal(await page.getByRole('textbox', { name: 'Имя', exact: true }).inputValue(), 'Черновик имени');
      assert.deepEqual(Object.keys(await page.evaluate(() => window.profilePatches.at(-1))), ['wishlistLinks']);
      await backToMenu();
    }
    await closeSettings();
    const nav = page.getByRole('navigation', { name: 'Внешние вишлисты' });
    const waitForNavLinks = count => page.waitForFunction(expected =>
      document.querySelector('nav[aria-label="Внешние вишлисты"]')?.querySelectorAll('a').length === expected,
    count);
    await nav.waitFor();
    await page.getByText('Айтем из ohmywishes', { exact: true }).waitFor();
    if (width === 320 || width === 1440) await page.getByText('Айтем из yandex-market', { exact: true }).waitFor();
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
    await openWishlists();
    assert.equal(await inputs[1].inputValue(), urls[1]);
    await inputs[1].clear();
    await saveWishlists();
    await backToMenu();
    await closeSettings();
    await nav.waitFor();
    await nav.getByRole('link', { name: /Ozon/ }).waitFor({ state: 'detached' });
    assert.equal(await nav.getByRole('link').count(), urls.length - 1);
    assert.deepEqual(await page.evaluate(() => window.profilePatches.at(-1)), { wishlistLinks: { ozon: null } });
    await openWishlists();
    await inputs[0].clear();
    await backToMenu();
    await wishlistEntry.click();
    assert.equal(await inputs[0].inputValue(), '');
    await backToMenu();
    await closeSettings();
    await nav.waitFor();
    assert.equal(await nav.getByRole('link').count(), urls.length - 1);
    if (width === 320 || width === 1440) {
      await open.click();
      await personalEntry.click();
      const address = page.getByRole('textbox', { name: 'Адрес профиля' });
      await address.fill('fixture-renamed');
      await address.press('Enter');
      await page.waitForURL(origin + '/fixture-renamed');
      await waitForNavLinks(urls.length - 1);
      assert.equal(await nav.getByRole('link').count(), urls.length - 1);
    }
    assert.deepEqual(await page.evaluate(() => window.unexpectedRequests), []);
    await page.goto(origin + '/fixture?guest');
    await waitForNavLinks(urls.length);
    assert.equal(await nav.getByRole('link').count(), urls.length);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(await page.evaluate(() => window.unexpectedRequests), []);
    assert.deepEqual(errors, []);
    if ([320,390,820,1440].includes(width)) await page.screenshot({ path: `/tmp/rollapp-profile-wishlists-guest-${width}.png` });
    if (width === 320 || width === 1440) {
      await page.goto(origin + '/app/wishes?tab=products');
      await waitForNavLinks(urls.length);
      assert.deepEqual(await nav.getByRole('link').evaluateAll(anchors => anchors.map(anchor => anchor.href)), urls);
      await openWishlists();
      assert.equal(await inputs[3].inputValue(), urls[3]);
      await inputs[3].clear();
      await saveWishlists();
      await backToMenu();
      await closeSettings();
      await nav.waitFor();
      await nav.getByRole('link', { name: /Яндекс Маркет/ }).waitFor({ state: 'detached' });
      assert.deepEqual(await nav.getByRole('link').evaluateAll(anchors => anchors.map(anchor => anchor.href)), urls.slice(0, -1));
      assert.deepEqual(await page.evaluate(() => window.profilePatches), [{ wishlistLinks: { 'yandex-market': null } }]);
      assert.deepEqual(await page.evaluate(() => window.unexpectedRequests), []);
      assert.deepEqual(errors, []);
    }
    await page.goto(origin + '/app/wishes?tab=products&sharing-fixture');
    const hero = page.locator('[data-persistent-profile]');
    await page.getByRole('region', { name: 'Запросы доступа к пространству' }).getByRole('button', { name: 'Открыть доступ', exact: true }).waitFor();
    assert.equal(await hero.getByRole('button', { name: /Открыть доступ/ }).count(), 0);
    assert.equal(await hero.getByRole('button', { name: /QR-код/ }).count(), 0);
    assert(await open.isVisible());
    assert(await page.getByRole('button', { name: 'Добавить', exact: true }).isVisible());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if ((width === 390 && height === 844) || width === 1440) {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `/tmp/rollapp-wishlist-owner-${width}.png` });
    }
    assert.deepEqual(await page.evaluate(() => window.unexpectedRequests), []);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${width}×${height}: validation, error/retry, save, remove, cancel, guest links, control geometry, Wishlist owner controls`);
  }
} finally {
  await browser.close();
  await server.close();
}
