import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { browserLaunchOptions } from './browser-runtime.mjs';
import { listenSmokeServer, smokeOrigin } from './smoke-server.mjs';

async function assertProfileHeading(page, { owner, name = 'Профиль', selector = '.public-collection-page__hero' }) {
  const hero = page.locator(selector);
  const heading = hero.getByRole('heading', { name, exact: true, level: 1 });
  await heading.waitFor();
  const memberNumber = hero.getByText("ID #12345", { exact: true });
  const friends = hero.getByRole('link', { name: 'Друзья', exact: true });
  if (owner) {
    await memberNumber.waitFor();
    await friends.waitFor();
  }
  assert.equal(await memberNumber.count(), owner ? 1 : 0);
  assert(await heading.evaluate(element => !element.closest('a, button')));
  assert.equal(await friends.count(), owner ? 1 : 0);
  if (!owner) return;
  assert.equal(await friends.getAttribute('href'), '/app/friends');
  // A profile rename can replace the hero between Playwright calls. Resolve
  // the current row and read its layout in one callback on a rendered frame.
  const renderedGeometry = await page.waitForFunction(({ selector, name }) => {
    const hero = document.querySelector(selector);
    const link = hero?.querySelector('a[href="/app/friends"]');
    const nav = link?.parentElement;
    const heading = nav?.previousElementSibling;
    const id = nav?.querySelector(':scope > span');
    const label = link?.querySelector('span');
    if (heading?.textContent.trim() !== name || !id || !label) return false;
    const linkBox = link.getBoundingClientRect();
    const rowBox = nav.getBoundingClientRect();
    const nameBox = heading.getBoundingClientRect();
    const textStyle = element => {
      const style = getComputedStyle(element);
      return [style.fontSize, style.lineHeight, style.fontWeight, style.color];
    };
    return {
      nameTag: heading.tagName,
      gap: linkBox.top - nameBox.bottom,
      centerOffset: rowBox.left + rowBox.width / 2 - nameBox.left - nameBox.width / 2,
      sameStyle: JSON.stringify(textStyle(id)) === JSON.stringify(textStyle(label)),
      sameLine: Math.abs(id.getBoundingClientRect().top - label.getBoundingClientRect().top) < 1,
      height: linkBox.height,
      icons: link.querySelectorAll('svg').length,
    };
  }, { selector, name });
  const geometry = await renderedGeometry.jsonValue();
  await renderedGeometry.dispose();
  assert.equal(geometry.nameTag, 'H1');
  assert(Math.abs(geometry.gap) <= 1, 'Friends should sit directly below the profile name');
  assert(Math.abs(geometry.centerOffset) <= 1, 'Friends and the profile name should share a center');
  assert.equal(geometry.height, 48);
  assert.equal(geometry.icons, 0);
  assert(geometry.sameStyle && geometry.sameLine);
}

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
    await assertProfileHeading(page, { owner: true });
    const open = page.getByRole('button', { name: 'Редактировать профиль Профиль', exact: false });
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
    const refresh = page.getByRole('button', { name: 'Обновить все сохранённые вишлисты', exact: true });
    const wishlist = page.getByRole('region', { name: 'Внешние вишлисты' });
    assert(await refresh.isDisabled());
    const footerGeometry = await refresh.evaluate(button => {
      const save = button.closest('[data-control-bar]').querySelector('[type="submit"]');
      const box = button.getBoundingClientRect(), saveBox = save.getBoundingClientRect(), style = getComputedStyle(button);
      return { width: box.width, height: box.height, radius: style.borderTopLeftRadius,
        gap: box.left - saveBox.right, row: box.top === saveBox.top };
    });
    assert.deepEqual(footerGeometry, { width: 48, height: 48, radius: '24px', gap: 8, row: true });
    assert.equal(await wishlist.getByRole('button', { name: /Импортировать позиции ·/ }).count(), 0);
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
    const browserDisclosure = wishlist.getByRole('button', { name: 'Импорт из браузера', exact: true });
    const importBrowser = wishlist.getByRole('button', { name: 'Импортировать все списки · Яндекс Маркет', exact: true });
    assert.equal(await browserDisclosure.getAttribute('aria-expanded'), 'false');
    assert.equal(await importBrowser.isVisible(), false);
    const [lastInputBox, disclosureBox] = await Promise.all([inputs.at(-1).boundingBox(), browserDisclosure.boundingBox()]);
    assert(lastInputBox.y + lastInputBox.height < disclosureBox.y && disclosureBox.height >= 48);
    assert.equal(await browserDisclosure.evaluate(el => getComputedStyle(el).fontSize), '18px');
    if ((width === 390 && height === 844) || width === 1440) {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `/tmp/rollapp-profile-wishlists-links-${width}.png` });
    }
    await browserDisclosure.click();
    const importBox = await importBrowser.boundingBox();
    assert(importBox.x >= 0 && importBox.x + importBox.width <= width && importBox.height >= 47.5);
    assert.equal(await importBrowser.evaluate(el => getComputedStyle(el).paddingInlineStart), '24px');
    const downloadExtension = wishlist.getByRole('link', { name: 'Скачать расширение RULAB', exact: true });
    await downloadExtension.scrollIntoViewIfNeeded();
    assert.equal(await downloadExtension.getAttribute('href'), '/rollapp-browser-extension.zip');
    assert.equal(await downloadExtension.getAttribute('download'), '');
    assert.equal(await wishlist.getByText(/Распакуйте архив/).count(), 0);
    const downloadGeometry = await downloadExtension.evaluate(element => {
      const { left, right, height } = element.getBoundingClientRect();
      const { paddingInlineStart, paddingInlineEnd, borderTopLeftRadius, textDecorationLine } = getComputedStyle(element);
      return { left, right, height, paddingInlineStart, paddingInlineEnd, radius: parseFloat(borderTopLeftRadius), textDecorationLine };
    });
    assert(downloadGeometry.left >= 0 && downloadGeometry.right <= width && downloadGeometry.height >= 48);
    assert.equal(downloadGeometry.paddingInlineStart, '24px');
    assert.equal(downloadGeometry.paddingInlineEnd, '24px');
    assert(downloadGeometry.radius >= downloadGeometry.height / 2);
    assert.equal(downloadGeometry.textDecorationLine, 'none');
    if (width === 320 || width === 1440) {
      const originalUrl = page.url();
      const [download] = await Promise.all([page.waitForEvent('download'), downloadExtension.click()]);
      assert.equal(download.suggestedFilename(), 'rollapp-browser-extension.zip');
      const response = await page.request.get(download.url());
      assert.equal(response.headers()['content-type'], 'application/zip');
      assert.equal((await response.body()).subarray(0, 4).toString('hex'), '504b0304');
      assert.equal(page.url(), originalUrl);
      await importBrowser.click();
      const extensionNotice = wishlist.getByRole('status').getByText(/Установите или обновите расширение Rollapp/);
      await extensionNotice.waitFor();
      const ozonImport = wishlist.getByRole('button', { name: 'Импортировать все списки · Ozon', exact: true });
      await ozonImport.click();
      await wishlist.getByRole('status').getByText('Читаем избранное и списки…').waitFor({ state: 'hidden' });
      assert.equal(await extensionNotice.count(), 1);
      await downloadExtension.scrollIntoViewIfNeeded();
      if (width === 1440) await page.screenshot({ path: `/tmp/rollapp-profile-wishlists-extension-${width}.png` });
      assert.deepEqual(await page.evaluate(() => window.browserWishlistImports), []);
      await page.evaluate(() => {
        window.addEventListener('message', ({ data, origin, source }) => {
          if (source !== window || origin !== location.origin || data?.source !== 'rollapp-page' || data.url) return;
          const type = data.type === 'ROLLAPP_WISHLIST_PING' ? 'ROLLAPP_WISHLIST_PONG'
            : data.type === 'ROLLAPP_WISHLIST_IMPORT' ? 'ROLLAPP_WISHLIST_RESULT' : null;
          if (!type) return;
          const items = [{ url: 'https://market.yandex.ru/card/example/1001', title: 'Карточка из браузера' }];
          const result = type === 'ROLLAPP_WISHLIST_RESULT' && window.browserWishlistRequiresAccess
            ? { ok: false, code: 'marketplace_access_required', error: 'Завершите проверку в магазине.' }
            : { ok: true, items, linkedWishlist: true };
          window.postMessage({ type, source: 'rollapp-retailer-helper', requestId: data.requestId, result }, location.origin);
        });
        window.browserWishlistRequiresAccess = true;
      });
      await importBrowser.click();
      const openStore = wishlist.getByRole('link', { name: 'Открыть избранное в Яндекс Маркете' });
      await openStore.waitFor();
      assert.equal(await extensionNotice.count(), 0);
      assert.equal(await openStore.getAttribute('href'), 'https://market.yandex.ru/my/wishlist');
      assert.equal(await openStore.getAttribute('target'), '_blank');
      assert.deepEqual(await page.evaluate(() => window.browserWishlistImports), []);
      await page.evaluate(() => { window.browserWishlistRequiresAccess = false; });
      await importBrowser.click();
      await wishlist.getByRole('status').getByText('Добавлено в «Товары»: 1. Уже было в Rollapp: 0.').waitFor();
      assert.equal(await openStore.count(), 0);
      assert.deepEqual(await page.evaluate(() => window.browserWishlistImports), [{
        ownerId: 'fixture',
        items: [{ url: 'https://market.yandex.ru/card/example/1001', title: 'Карточка из браузера' }],
      }]);
      assert.deepEqual(await page.evaluate(() => window.profilePatches), []);
    }
    await browserDisclosure.click();
    await importBrowser.waitFor({ state: 'hidden' });
    const ozonDisclosure = wishlist.getByRole('button', { name: 'Открытый список Ozon', exact: true });
    const pasteCards = wishlist.getByRole('textbox', { name: 'Скопированные карточки', exact: true });
    const readClipboard = wishlist.getByRole('button', { name: 'Импортировать из буфера', exact: true });
    const bookmarkDisclosure = wishlist.getByRole('button', { name: 'Закладка для копирования', exact: true });
    const bookmark = wishlist.getByRole('link', { name: 'Скопировать список Ozon', exact: true });
    assert.equal(await ozonDisclosure.getAttribute('aria-expanded'), 'false');
    const captureOzon = (width === 390 && height === 844) || width === 1440;
    if (captureOzon) await ozonDisclosure.click();
    else await ozonDisclosure.press('Enter');
    await pasteCards.waitFor();
    await pasteCards.evaluate(async input => {
      const panel = input.closest('[data-slot="accordion-content"]');
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.allSettled(panel.getAnimations({ subtree: true }).map(animation => animation.finished));
    });
    await pasteCards.scrollIntoViewIfNeeded();
    assert.equal(await bookmarkDisclosure.getAttribute('aria-expanded'), 'false');
    assert.equal(await bookmark.isVisible(), false);
    const pasteBox = await pasteCards.boundingBox();
    const clipboardBox = await readClipboard.boundingBox();
    for (const box of [pasteBox, clipboardBox]) assert(box.x >= 0 && box.x + box.width <= width && box.height >= 48);
    assert.deepEqual(await readClipboard.evaluate(element => {
      const { paddingInlineStart, paddingInlineEnd } = getComputedStyle(element);
      return [paddingInlineStart, paddingInlineEnd];
    }), ['24px', '24px']);
    if (width === 320) assert(clipboardBox.y >= pasteBox.y + pasteBox.height + 7);
    if (width === 1440) assert(Math.abs(clipboardBox.y - pasteBox.y) < 1);
    if (captureOzon) {
      await page.evaluate(() => document.fonts.ready);
      await bookmarkDisclosure.evaluate(toggle => toggle.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await page.screenshot({ path: `/tmp/rollapp-profile-ozon-import-${width}.png` });
    }
    if (width === 320 || width === 1440 || height === 400) {
      const before = await page.evaluate(() => window.browserWishlistImports.length);
      const item = { url: 'https://www.ozon.ru/product/smoke-123456789/', title: 'Карточка Ozon', imageUrl: '' };
      const html = `<a href="${item.url}">${item.title}</a>`;
      await page.evaluate(html => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
          async read() {
            if (window.rejectOzonClipboard) throw new Error('Clipboard permission denied');
            return [new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }) })];
          },
          async writeText(value) { window.copiedOzonBookmark = value; },
        } });
      }, html);
      await readClipboard.click();
      const importsCompleted = count => page.waitForFunction(length => window.browserWishlistImports.length === length, before + count);
      const imported = wishlist.getByText('Добавлено в «Товары»: 1. Уже было в Rollapp: 0.', { exact: true });
      await importsCompleted(1);
      await imported.waitFor();
      await page.evaluate(() => { window.rejectOzonClipboard = true; });
      await readClipboard.click();
      await wishlist.getByText('Вставьте карточки в поле «Скопированные карточки».', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.browserWishlistImports.length), before + 1);
      await pasteCards.focus();
      await pasteCards.evaluate((input, html) => {
        const clipboardData = new DataTransfer();
        clipboardData.setData('text/html', html);
        input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
      }, html);
      await importsCompleted(2);
      await imported.waitFor();
      await bookmarkDisclosure.press('Enter');
      await bookmark.waitFor();
      if (height === 400) {
        await bookmark.evaluate(link => link.scrollIntoView({ block: 'center', behavior: 'instant' }));
        const link = await bookmark.boundingBox();
        assert(link.y >= 0 && link.y + link.height <= (await save.boundingBox()).y);
      }
      const address = await bookmark.getAttribute('href');
      assert(address.startsWith('javascript:'));
      assert.deepEqual(await bookmark.evaluate(link => {
        const transfer = new DataTransfer();
        link.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
        return [transfer.getData('text/uri-list'), transfer.getData('text/plain')];
      }), [address, address]);
      await bookmark.press('Enter');
      await wishlist.getByText(/^Адрес скопирован/).waitFor();
      assert.equal(await page.evaluate(() => window.copiedOzonBookmark), address);
      await page.evaluate(item => {
        navigator.clipboard.readText = async () => 'ROLLAPP_OZON_WISHLIST_V1\n' + JSON.stringify([item]);
      }, item);
      await readClipboard.click();
      await importsCompleted(3);
      await imported.waitFor();
      assert.deepEqual(await page.evaluate(start => window.browserWishlistImports.slice(start), before),
        Array.from({ length: 3 }, () => ({ ownerId: 'fixture', items: [item] })));
    }
    await ozonDisclosure.press('Enter');
    await pasteCards.waitFor({ state: 'hidden' });
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
      'https://www.wildberries.ru/wlg/example',
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
        for (const action of [save, refresh, back]) {
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
    const providers = ['ohmywishes', 'ozon', 'wb', 'yandex-market'];
    assert.deepEqual(await page.evaluate(() => window.wishlistImports), providers);
    const providerStatus = (provider) => wishlist.locator('[data-slot="field"]')
      .filter({ has: page.getByRole('textbox', { name: provider, exact: true }) }).getByRole('status');
    await providerStatus('OhMyWishes').getByText('Добавлено в «Товары»: 1.', { exact: true }).waitFor();
    await providerStatus('WB').getByText('Добавлено в «Товары»: 1.', { exact: true }).waitFor();
    await providerStatus('Ozon').getByText(/Ссылка Ozon не открывает вишлист/).waitFor();
    await page.getByRole('status').getByText('Не удалось прочитать список Маркета').waitFor();
    if (width === 320 || width === 1440) {
      await page.evaluate(() => {
        window.wishlistBridgeRequests = [];
        window.addEventListener('message', ({ data, origin, source }) => {
          if (source !== window || origin !== location.origin || data?.source !== 'rollapp-page') return;
          if (data.type?.startsWith('ROLLAPP_WISHLIST_')) window.wishlistBridgeRequests.push(data.type);
        });
        window.rejectMarketImport = false;
        window.deferOzonImport = true;
      });
      const draft = 'https://ozon.ru/t/unsaved';
      await inputs[1].fill(draft);
      const patches = await page.evaluate(() => window.profilePatches.length);
      await refresh.click();
      await page.waitForFunction(() => Boolean(window.finishOzonImport));
      assert.equal(await refresh.getAttribute('aria-busy'), 'true');
      assert(await save.isDisabled());
      await providerStatus('WB').getByText('Новых позиций среди прочитанных нет.').waitFor();
      await page.evaluate(() => window.finishOzonImport());
      await providerStatus('Ozon').getByText(/Ссылка Ozon не открывает вишлист/).waitFor();
      await page.getByRole('status').getByText('Добавлено в «Товары»: 1. Сервис отдал только первую страницу списка.', { exact: true }).waitFor();
      await page.waitForFunction(() => !document.querySelector('[aria-label="Обновить все сохранённые вишлисты"]').disabled);
      assert.deepEqual(await page.evaluate(() => window.wishlistImports), [...providers, ...providers]);
      assert.deepEqual(await page.evaluate(() => window.wishlistBridgeRequests), []);
      assert.equal(await page.evaluate(() => window.profilePatches.length), patches);
      assert.equal(await inputs[1].inputValue(), draft);
      await inputs[1].fill(urls[1]);
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
    const badges = page.locator('nav[aria-label="Внешние вишлисты"], a[aria-label^="Открыть вишлист "]');
    assert.equal(await badges.count(), 0, 'Saved external links must stay out of the profile');
    await page.getByText('Айтем из ohmywishes', { exact: true }).waitFor();
    await page.getByText('Айтем из wb', { exact: true }).waitFor();
    if (width === 320 || width === 1440) await page.getByText('Айтем из yandex-market', { exact: true }).waitFor();
    await openWishlists();
    assert.equal(await inputs[1].inputValue(), urls[1]);
    await inputs[1].clear();
    await saveWishlists();
    await backToMenu();
    await closeSettings();
    assert.equal(await badges.count(), 0);
    assert.deepEqual(await page.evaluate(() => window.profilePatches.at(-1)), { wishlistLinks: { ozon: null } });
    await openWishlists();
    await inputs[0].clear();
    await backToMenu();
    await wishlistEntry.click();
    assert.equal(await inputs[0].inputValue(), '');
    await backToMenu();
    await closeSettings();
    assert.equal(await badges.count(), 0);
    if (width === 320 || width === 1440) {
      await open.click();
      await personalEntry.click();
      const address = page.getByRole('textbox', { name: 'Адрес профиля' });
      assert.equal(await address.isEditable(), false);
      const name = page.getByRole('textbox', { name: 'Имя', exact: true });
      await name.fill('Mikhail Koloskov');
      assert.equal(await address.inputValue(), 'колосков-михаил');
      await name.press('Enter');
      await page.waitForURL(url => decodeURI(url.pathname) === '/колосков-михаил');
      assert.deepEqual(await page.evaluate(() => window.profilePatches.at(-1)), { name: 'Mikhail Koloskov' });
      await page.locator('.profile-settings-dialog').waitFor({ state: 'detached' });
      await assertProfileHeading(page, { owner: true, name: 'Mikhail Koloskov' });
      assert.equal(await badges.count(), 0);
    }
    assert.deepEqual(await page.evaluate(() => window.unexpectedRequests), []);
    await page.goto(origin + '/fixture?guest');
    await assertProfileHeading(page, { owner: false });
    assert.equal(await badges.count(), 0, 'Guests must not see external wishlist badges');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(await page.evaluate(() => window.unexpectedRequests), []);
    assert.deepEqual(errors, []);
    if ([320,390,820,1440].includes(width)) await page.screenshot({ path: `/tmp/rollapp-profile-wishlists-guest-${width}.png` });
    if (width === 320 || width === 1440) {
      await page.goto(origin + '/app/wishes?tab=products');
      await page.locator('[data-persistent-profile]').getByRole('heading', { name: 'Профиль', exact: true }).waitFor();
      assert.equal(await badges.count(), 0, 'The private wishlist must not render provider badges');
      await openWishlists();
      assert.equal(await inputs[3].inputValue(), urls[3]);
      await inputs[3].clear();
      await saveWishlists();
      await backToMenu();
      await closeSettings();
      assert.equal(await badges.count(), 0);
      assert.deepEqual(await page.evaluate(() => window.profilePatches), [{ wishlistLinks: { 'yandex-market': null } }]);
      assert.deepEqual(await page.evaluate(() => window.unexpectedRequests), []);
      assert.deepEqual(errors, []);
    }
    await page.goto(origin + '/app/wishes?tab=products&sharing-fixture');
    const hero = page.locator('[data-persistent-profile]');
    await assertProfileHeading(page, { owner: true, selector: '[data-persistent-profile]' });
    assert.equal(await page.getByRole('region', { name: 'Запросы доступа к пространству' }).count(), 0);
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
    console.log(`PASS ${width}×${height}: validation, error/retry, save, remove, cancel, hidden profile badges, control geometry, Wishlist owner controls`);
  }
} finally {
  await browser.close();
  await server.close();
}
