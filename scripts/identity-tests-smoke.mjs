import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { browserLaunchOptions } from './browser-runtime.mjs';
import { listenSmokeServer, smokeOrigin } from './smoke-server.mjs';
const server = await createServer({ cacheDir: 'node_modules/.vite-custom-identity', server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false, watch: null }, plugins: [{ name: 'identity-tests-fixture', configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
    if (!req.url.startsWith('/__identity-tests')) return next();
    res.setHeader('Content-Type', 'text/html');
    res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/identity-tests.jsx"></script></body></html>'));
  });
} }] });
await listenSmokeServer(server);
const browser = await chromium.launch(browserLaunchOptions());
try {
  for (const [width, height] of [[320,844],[390,844],[768,844],[820,844],[1024,844],[1440,844],[1920,1000],[1024,400],[390,400]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => { errors.push('Unexpected API request'); return route.abort(); });
    await page.goto(`${smokeOrigin(server)}/__identity-tests`);
    await page.locator('.identity-report-manager__actions').getByRole('button', { name: 'Добавить тест', exact: true }).click();
    await page.getByLabel('Название теста').fill('Ошибка');
    await page.locator('form').getByRole('button', { name: 'Добавить тест', exact: true }).click();
    await page.getByText('Не удалось сохранить: повторите попытку', { exact: true }).waitFor();
    await page.getByLabel('Название теста').fill('Мой Big Five');
    const geometry = await page.locator('form [data-control-bar] button').evaluateAll(buttons => buttons.map(button => {
      const style = getComputedStyle(button); const box = button.getBoundingClientRect();
      return { height: box.height, radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius] };
    }));
    assert.ok(geometry.length > 0);
    for (const button of geometry) {
      assert.equal(button.height, 48, `${width}: form button height`);
      assert.deepEqual(button.radii, ['24px', '24px', '24px', '24px'], `${width}: form button radii`);
    }
    if (width === 390 || width === 1440) await page.screenshot({ path: `/tmp/rollapp-custom-tests-form-${width}.png`, fullPage: true });
    await page.locator('form').getByRole('button', { name: 'Добавить тест', exact: true }).click();
    await page.getByRole('tab', { name: 'Мой Big Five', exact: true }).waitFor();
    await page.waitForFunction(() => !location.search.includes('formScreen') && location.search.includes('report=custom-fixture-5'));
    await page.getByLabel('Название теста').waitFor({ state: 'hidden' });
    const beforeCancel = await page.evaluate(() => window.__identityCalls.length);
    await page.locator('.identity-report-manager__actions').getByRole('button', { name: 'Добавить тест', exact: true }).click();
    await page.getByLabel('Название теста').fill('Несохранённый тест');
    await page.getByRole('button', { name: width < 768 ? 'Назад' : 'Закрыть настройки теста', exact: true }).click();
    await page.getByLabel('Название теста').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => !location.search.includes('formScreen'));
    assert.equal(await page.evaluate(() => window.__identityCalls.length), beforeCancel);
    await page.getByRole('button', { name: 'Изменить тест', exact: true }).click();
    const renamedTitle = 'W'.repeat(80);
    await page.getByLabel('Название теста').fill(renamedTitle);
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await page.getByRole('tab', { name: renamedTitle, exact: true }).waitFor();
    await page.waitForFunction(() => !location.search.includes('formScreen'));
    const emptyBounds = await page.locator('[data-slot="empty-title"]').evaluate(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, viewport: innerWidth }));
    assert.ok(emptyBounds.left >= -1 && emptyBounds.right <= emptyBounds.viewport + 1, `long empty title escapes ${width}: ${JSON.stringify(emptyBounds)}`);
    const filename = `${'Результат'.repeat(12)}.pdf`;
    await page.locator('input[type=file]').setInputFiles({ name: filename, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-fixture') });
    await page.getByRole('heading', { name: 'Результаты теста' }).waitFor();
    await page.getByRole('button', { name: `Удалить PDF ${filename}`, exact: true }).click();
    const fileDialog = await page.getByRole('alertdialog').evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth, top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom, height: innerHeight }));
    assert.ok(fileDialog.scroll <= fileDialog.client + 1 && fileDialog.top >= -1 && fileDialog.bottom <= fileDialog.height + 1, `long PDF confirmation escapes ${width}: ${JSON.stringify(fileDialog)}`);
    await page.getByRole('button', { name: 'Отмена', exact: true }).click();
    await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Удалить тест', exact: true }).click();
    const dialogBounds = await page.getByRole('alertdialog').evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth, left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, viewport: innerWidth, top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom, height: innerHeight }));
    assert.ok(dialogBounds.scroll <= dialogBounds.client + 1 && dialogBounds.left >= -1 && dialogBounds.right <= dialogBounds.viewport + 1 && dialogBounds.top >= -1 && dialogBounds.bottom <= dialogBounds.height + 1, `long confirmation title escapes ${width}: ${JSON.stringify(dialogBounds)}`);
    await page.getByRole('button', { name: 'Отмена', exact: true }).click();
    await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.__identityCalls.filter(call => call[0] === 'delete').length), 0);
    const rootOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert.equal(rootOverflow, false, `root overflow ${width}`);
    if (width === 390 || width === 1440) await page.screenshot({ path: `/tmp/rollapp-custom-tests-${width}.png`, fullPage: true });
    await page.getByRole('tab', { name: 'Gallup', exact: true }).click();
    await page.getByRole('tab', { name: renamedTitle, exact: true }).click();
    await page.getByRole('heading', { name: 'Результаты теста' }).waitFor();
    await page.getByRole('button', { name: 'Удалить тест', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить тест', exact: true }).click();
    await page.waitForFunction(() => location.search.includes('report=gallup'));
    assert.equal(await page.getByRole('tab', { name: renamedTitle, exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}x${height}: create/error/rename/PDF/selection/delete/cancel/overflow`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
