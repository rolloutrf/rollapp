import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { browserLaunchOptions } from './browser-runtime.mjs';
import { listenSmokeServer, smokePort, smokeOrigin } from './smoke-server.mjs';

async function assertVerificationActionSpacing(card, precedingAction) {
  const preceding = card.getByRole('button', { name: precedingAction, exact: true });
  const verifier = card.getByRole('region', { name: 'Проверка подписанной визитки' });
  const verify = verifier.getByRole('button', { name: 'Проверить файл', exact: true });
  const precedingBounds = await preceding.boundingBox();
  const verifyBounds = await verify.boundingBox();
  assert(Math.abs(verifyBounds.y - precedingBounds.y - precedingBounds.height - 8) < 0.5, 'Verification action must follow with an 8px gap');
  assert.equal(await verifier.evaluate(element => getComputedStyle(element).borderTopWidth), '0px');
}

const server = await createServer({ cacheDir: 'node_modules/.vite-contacts-smoke', server: { host: '127.0.0.1', port: smokePort(process.env.CONTACTS_PORT), strictPort: true, hmr: false, watch: null }, plugins: [{
  name: 'contacts-feed-fixture', enforce: 'pre',
  transform(source, id) { if (id.includes('/src/App.jsx?contacts-feed-test-export')) return `${source}\nexport { ContactsSpherePage, ToastProvider, SessionContext, ProfileEditorProvider, PersistentProfileHero, PublicProfile, CollectionNavigationProvider };`; },
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
  for (const [width, height] of [[320,844],[390,844],[768,844],[820,844],[1024,844],[1440,844],[1920,844],[1440,400],[390,400]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => { if (!request.url().startsWith(origin) && !request.url().startsWith('data:')) errors.push('Unexpected external request'); });
    await page.addInitScript(() => {
      window.cardTest = { copied: '', failCopy: false, shareMode: 'success', shares: [] };
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { async writeText(value) { if (window.cardTest.failCopy) throw Error('Denied'); window.cardTest.copied = value; } } });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async (value) => { window.cardTest.shares.push(value); if (window.cardTest.shareMode === 'cancel') throw new DOMException('Cancelled', 'AbortError'); } });
      const encodeCanvas = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        if (window.cardTest.failQr) throw new Error('QR encoding failed');
        return encodeCanvas.apply(this, args);
      };
    });
    await page.route('**/api/**', (route) => { errors.push('Unexpected API request'); return route.abort(); });
    await page.goto(`${origin}/__contacts-feed`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => document.querySelectorAll('.contact-card').length === 48);
    await page.evaluate(() => document.fonts.ready);
    for (const index of [0, 1]) {
      const card = page.locator('.contact-card').nth(index);
      const footer = card.locator('.contact-card__footer');
      const favorite = footer.getByRole('button', { name: /в избранное$/ });
      assert.equal(await card.locator('.contact-card__avatar-wrap button').count(), 0);
      assert.equal(await favorite.count(), 1);
      const fits = await footer.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        const star = element.querySelector('.contact-card__favorite').getBoundingClientRect();
        const actions = [...element.querySelectorAll('.contact-card__secondary-actions :is(button, a)')].map(action => action.getBoundingClientRect());
        return star.left - bounds.left <= 9 && star.bottom <= bounds.bottom && bounds.bottom - star.bottom <= 13 &&
          star.height === star.width && actions.every(action => action.left >= star.right + 7 && action.right <= bounds.right + 1);
      });
      assert(fits, 'Favorite must remain in the lower-left corner without overlapping notes or links');
      if (index === 0 && ((width === 390 && height === 844) || (width === 1440 && height === 844))) {
        await card.screenshot({ path: `/tmp/rollapp-contact-list-favorite-${width}.png`, animations: 'disabled' });
      }
    }
    const mobile = width < 768;
    {
      const create = page.locator('[data-add-fab]').getByRole('button', { name: 'Добавить контакт' });
      await create.click();
      const field = page.locator('.contact-detail__edit-form').getByRole('combobox', { name: 'Компания', exact: true });
      await field.waitFor();
      assert.equal(await page.getByRole('listbox', { name: 'Названия компаний' }).count(), 0);
      await field.fill('сев');
      const options = page.getByRole('listbox', { name: 'Названия компаний' }).getByRole('option');
      await options.first().waitFor();
      assert.deepEqual(await options.allTextContents(), ['Северная звезда', 'Группа Север']);
      assert.equal(await page.locator('.contact-card').filter({ hasText: 'Северная звезда' }).count(), 0, 'Company must be suggested before its contact page is loaded');
      const popup = page.locator('[data-slot="combobox-content"]').filter({ has: options.first() });
      await popup.evaluate(async element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))));
      const bounds = await options.first().boundingBox();
      assert(bounds && bounds.height >= 47.5 && bounds.x >= -0.5 && bounds.x + bounds.width <= width + 1, `${width}×${height}: company option bounds ${JSON.stringify(bounds)}`);
      if ((width === 390 && height === 400) || width === 1440) await page.screenshot({ path: `/tmp/rollapp-contact-companies-${width}-${height}.png` });
      await field.press('ArrowDown');
      await field.press('Enter');
      assert.equal(await field.inputValue(), 'Северная звезда');
      await field.fill('зелен');
      await page.getByRole('option', { name: 'Зелёный город', exact: true }).click({ timeout: 5000 });
      assert.equal(await field.inputValue(), 'Зелёный город');
      await field.fill('не отс');
      assert.equal(await options.count(), 0);
      await field.fill('сев');
      await options.first().waitFor();
      await field.press('Escape');
      await options.first().waitFor({ state: 'hidden' });
      assert.equal(await field.inputValue(), 'сев');
      await field.fill('Новая компания');
      await field.press('Tab');
      assert.equal(await field.inputValue(), 'Новая компания');
      await page.getByRole('button', { name: mobile ? 'Назад' : 'Закрыть добавление контакта', exact: true }).click();
      await field.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'Открыть контакт Контакт 000', exact: true }).click();
      await field.waitFor();
      assert.equal(await field.inputValue(), 'Компания');
      await field.fill('сев');
      await options.first().click();
      assert.equal(await field.inputValue(), 'Северная звезда');
      await page.getByRole('button', { name: mobile ? 'Назад' : 'Закрыть карточку контакта', exact: true }).click();
      await field.waitFor({ state: 'hidden' });
      console.log(`PASS ${width}×${height}: company suggestions on create/edit, unloaded contact pages, keyboard and free text`);
    }
    const profileButton = page.getByRole('button', { name: 'Редактировать профиль Тестовый Пользователь', exact: true });
    assert.equal(await page.locator('[data-persistent-profile]').getByRole('button', { name: /QR-код/ }).count(), 0);
    const menu = page.getByRole('navigation', { name: 'Разделы профиля' });
    const cardButton = menu.getByRole('button', { name: 'Визитка и QR-код', exact: true });
    const heading = page.getByRole('heading', { name: 'Визитка и QR-код', exact: true });
    const ownerCard = page.locator(mobile ? '.mobile-form-page__surface' : '.profile-settings-dialog').filter({ has: heading });
    const requestsBeforeCard = await page.evaluate(() => window.feedTest.requests.length);
    await profileButton.click();
    assert((await cardButton.boundingBox()).height >= 48);
    await cardButton.click();
    const qrImage = ownerCard.getByRole('img', { name: 'QR-код профиля Тестовый Пользователь' });
    await qrImage.waitFor();
    await ownerCard.evaluate(async (element) => { await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {}))); });
    await assertVerificationActionSpacing(ownerCard, 'Подпись TON Testnet');
    assert((await qrImage.getAttribute('src')).startsWith('data:image/png;base64,'));
    await qrImage.evaluate(image => image.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const body = ownerCard.locator('[data-contact-card-body]');
    assert(await body.evaluate((element) => element.scrollWidth <= element.clientWidth), 'Card body horizontal overflow');
    const closeButton = ownerCard.getByRole('button', { name: 'Назад', exact: true });
    const vcardButton = ownerCard.getByRole('button', { name: 'Скачать vCard', exact: true });
    const closeBounds = await closeButton.boundingBox();
    assert.equal(Math.round(closeBounds.width), 48);
    const vcardBounds = await vcardButton.boundingBox();
    const bodyBounds = await body.boundingBox();
    const qrBounds = await qrImage.boundingBox();
    let scrollTop;
    if (mobile) {
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert.equal(await body.evaluate(el => getComputedStyle(el).overflowY), 'visible');
      assert(qrBounds.y >= 0 && qrBounds.y + qrBounds.height <= vcardBounds.y + 1);
      assert.equal(closeBounds.y, vcardBounds.y);
      scrollTop = await page.evaluate(() => {
        scrollTo({ top: document.scrollingElement.scrollHeight, behavior: 'instant' });
        return scrollY;
      });
      const bottom = await body.boundingBox();
      assert(bottom.y + bottom.height <= vcardBounds.y + 1);
    } else {
      const bounds = await ownerCard.boundingBox();
      assert.equal(await ownerCard.getAttribute('data-swipe-direction'), 'right');
      assert(Math.abs(bounds.x + bounds.width - width) <= 1 && bounds.y <= 1 && Math.abs(bounds.height - height) <= 1);
      assert(qrBounds.y >= bodyBounds.y - 1 && qrBounds.y + qrBounds.height <= bodyBounds.y + bodyBounds.height + 1);
      assert(closeBounds.y + closeBounds.height <= bodyBounds.y && vcardBounds.y >= bodyBounds.y + bodyBounds.height);
      scrollTop = await body.evaluate(element => {
        element.scrollTop = element.scrollHeight;
        return element.scrollTop;
      });
    }
    if (height === 400) assert(scrollTop > 0, 'Card body must scroll in a short viewport');
    assert.deepEqual(await closeButton.boundingBox(), closeBounds, 'Close moved with the body');
    assert.deepEqual(await vcardButton.boundingBox(), vcardBounds, 'vCard moved with the body');
    for (const button of await ownerCard.locator('[data-control-bar] button').all()) {
      assert.equal(Math.round((await button.boundingBox()).height), 48);
      assert.deepEqual(await button.evaluate((element) => { const css = getComputedStyle(element); return [css.borderTopLeftRadius, css.borderTopRightRadius, css.borderBottomLeftRadius, css.borderBottomRightRadius]; }), ['24px','24px','24px','24px']);
    }
    const vcardWait = page.waitForEvent('download');
    await vcardButton.click();
    const vcard = await vcardWait;
    assert.equal(vcard.suggestedFilename(), 'synthetic-user.vcf');
    const cardText = await readFile(await vcard.path(), 'utf8');
    assert(cardText.includes('FN:Тестовый Пользователь\r\n'));
    assert(cardText.includes(`URL:${origin}/synthetic-user\r\n`));
    assert.doesNotMatch(cardText, /PRIVATE|private@example/);
    const jsonWait = page.waitForEvent('download');
    await ownerCard.getByRole('button', { name: 'Скачать JSON', exact: true }).click();
    const json = await jsonWait;
    const jsonText = await readFile(await json.path(), 'utf8');
    assert.deepEqual(Object.keys(JSON.parse(jsonText)), ['format','version','name','username','url']);
    assert.doesNotMatch(jsonText, /PRIVATE|private@example/);
    await ownerCard.getByRole('button', { name: 'Скопировать ссылку', exact: true }).click();
    assert.equal(await page.evaluate(() => window.cardTest.copied), `${origin}/synthetic-user`);
    await page.evaluate(() => { window.cardTest.failCopy = true; });
    await ownerCard.getByRole('button', { name: 'Скопировать ссылку', exact: true }).click();
    await ownerCard.getByRole('alert').waitFor();
    await page.evaluate(() => { window.cardTest.failCopy = false; });
    await ownerCard.getByRole('button', { name: 'Скопировать ссылку', exact: true }).click();
    assert.equal(await ownerCard.getByRole('alert').count(), 0);
    assert.equal(await page.evaluate(() => window.cardTest.copied), `${origin}/synthetic-user`);
    await ownerCard.getByRole('button', { name: 'Поделиться', exact: true }).click();
    assert.equal(await ownerCard.getByRole('alert').count(), 0);
    assert.equal(await page.evaluate(() => window.cardTest.shares[0].url), `${origin}/synthetic-user`);
    await page.evaluate(() => { window.cardTest.shareMode = 'cancel'; });
    await ownerCard.getByRole('button', { name: 'Поделиться', exact: true }).click();
    assert.equal(await ownerCard.getByRole('alert').count(), 0);
    assert.equal(await page.evaluate(() => window.cardTest.shares.length), 2, 'Native Share cancellation was not exercised');
    await page.evaluate(() => { Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); window.cardTest.copied = ''; });
    await ownerCard.getByRole('button', { name: 'Поделиться', exact: true }).click();
    assert.equal(await page.evaluate(() => window.cardTest.copied), `${origin}/synthetic-user`, 'Share fallback did not copy the profile');
    await page.screenshot({ path: `/tmp/rollapp-contact-card-${width}-${height}.png` });
    await closeButton.click();
    await ownerCard.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.textContent.trim() === 'Визитка и QR-код');
    assert.equal(await page.evaluate(() => window.feedTest.requests.length), requestsBeforeCard, 'Card changed feed');
    if (height === 400) await page.evaluate(() => { window.cardTest.failQr = true; });
    await cardButton.press('Enter');
    if (height === 400) {
      const retryQr = ownerCard.getByRole('button', { name: 'Повторить QR-код', exact: true });
      await retryQr.waitFor();
      assert(await retryQr.evaluate((button) => button.checkVisibility() && button.offsetWidth <= button.parentElement.clientWidth && button.closest('[aria-busy]') === null), 'QR retry must fit in the body without clipping');
      await page.evaluate(() => { window.cardTest.failQr = false; });
      await retryQr.click();
    }
    await qrImage.waitFor();
    if (mobile) await page.goBack();
    else await page.keyboard.press('Escape');
    await ownerCard.waitFor({ state: 'detached' });
    await menu.waitFor();
    await page.getByRole('button', { name: mobile ? 'Назад' : 'Закрыть', exact: true }).click();
    await menu.waitFor({ state: 'detached' });
    await page.evaluate(() => scrollTo({top:0,behavior:'instant'}));
    console.log(`PASS ${width}×${height}: card integration, local QR, private-field isolation, real downloads, clipboard retry, share/cancel, focus, 48px controls`);
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
    const search = page.getByRole('searchbox', { name: 'Поиск по контактам', exact: true });
    await search.fill('Не существует');
    await page.getByText('Контакты не найдены', {exact:true}).waitFor();
    const clear = page.getByRole('button', { name: 'Очистить поиск', exact: true });
    assert.equal(await clear.count(), 1);
    if ((width === 390 && height === 844) || (width === 1440 && height === 844)) {
      await page.locator('.contacts-sphere__search').screenshot({ path: `/tmp/rollapp-contacts-search-${width}-${height}.png`, animations: 'disabled' });
    }
    await clear.press('Enter');
    await clear.waitFor({ state: 'detached' });
    assert.equal(await search.inputValue(), '');
    await page.locator('.contact-card').first().waitFor();
    await page.goto(`${origin}/__contacts-feed/public/synthetic-user`, { waitUntil: 'domcontentloaded' });
    const visitorCard = page.getByRole('button', { name: 'Визитка', exact: true });
    const dialog = page.getByRole('dialog', { name: 'Цифровая визитка' });
    assert.deepEqual(await visitorCard.evaluate(button => {
      const style = getComputedStyle(button);
      return [style.paddingLeft, style.paddingRight];
    }), ['24px', '24px']);
    await visitorCard.click();
    await dialog.getByRole('img', { name: 'QR-код профиля Тестовый Пользователь' }).waitFor();
    await assertVerificationActionSpacing(dialog, 'Скачать JSON');
    await dialog.getByRole('button', { name: 'Закрыть визитку', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    assert(await visitorCard.evaluate((element) => document.activeElement === element));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Public profile horizontal overflow');
    // Also inspect the card in the light theme and a short viewport.
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await visitorCard.click();
    await dialog.getByRole('img').waitFor();
    await dialog.evaluate(async (element) => { await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {}))); });
    await page.screenshot({ path: `/tmp/rollapp-contact-card-light-${width}-${height}.png` });
    await page.mouse.click(8, height / 2);
    await dialog.waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}×${height}: append, retry, end, favorite scroll/DOM, failure, filters, stale request, overflow; guest public card, light/dark`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
