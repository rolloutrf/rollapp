import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { listenSmokeServer, smokePort, smokeOrigin } from './smoke-server.mjs';

let executablePath;
for (const candidate of [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
  try { await access(candidate); executablePath = candidate; break; } catch {}
}
assert(executablePath, 'Install Chrome or set CHROME_PATH');
const server = await createServer({ cacheDir: 'node_modules/.vite-contact-photo', server: { host: '127.0.0.1', port: smokePort(process.env.CONTACT_PHOTO_TEST_PORT), strictPort: true, hmr: false, watch: null }, plugins: [{
  name: 'contact-photo-fixture',
  transform(source, id) {
    if (id.endsWith('/src/App.jsx?form-actions')) return `${source}\nexport { ContactEditForm, ToastContext, WishModal };`;
    const name = new URLSearchParams(id.split('?')[1]).get('drawer-smoke-export');
    if (name && /^[A-Z][A-Za-z]+$/.test(name) && id.includes('/src/') && !source.includes(`export function ${name}`)) return `${source}\nexport { ${name} };`;
  },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (!req.url.startsWith('/__contact-photo')) return next();
    res.setHeader('Content-Type', 'text/html');
    res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/form-actions.jsx"></script></body></html>'));
  }); },
}] });
await listenSmokeServer(server);
const origin = smokeOrigin(server);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--disable-crashpad-for-testing', '--disable-updater-scheduler'] });
const imageUrl = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="84" height="84"%3E%3Crect width="84" height="84" fill="gray"/%3E%3C/svg%3E';
try {
  for (const [width, height] of [[320,800],[390,844],[768,900],[820,900],[1024,900],[1440,1000],[1920,1080],[390,400]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    let requests = [];
    let release;
    let hold = false;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Explicit fixture transport only; all other API calls fail closed.
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/contacts/avatar/resolve') {
        requests.push(route.request().postDataJSON());
        if (hold) await new Promise(resolve => { release = resolve; });
        return route.fulfill({ json: { imageUrl, source: 'Telegram' } });
      }
      if (url.pathname === '/api/uploads/images' && route.request().method() === 'POST') return route.fulfill({ json: { imageUrl, id: 'fixture-photo' } });
      if (url.pathname === '/api/uploads/images/fixture-photo' && route.request().method() === 'DELETE') return route.fulfill({ json: {} });
      throw new Error(`Unexpected API call: ${route.request().method()} ${url.pathname}`);
    });
    await page.goto(`${origin}/__contact-photo?form=contact-photo`);
    await page.getByRole('button', { name: 'Добавить ссылку', exact: true }).click();
    const url = page.getByRole('textbox', { name: 'Адрес ссылки 1', exact: true });
    await url.fill('https://example.com/person');
    await page.waitForTimeout(800);
    assert.equal(requests.length, 0, 'Ordinary websites must not resolve');
    hold = true;
    await url.fill('https://t.me/first_person');
    await page.waitForFunction(() => document.querySelector('[aria-busy="true"].contact-detail__avatar-picker'));
    assert.equal(requests.length, 1, 'Social URL resolves without blur');
    await url.fill('https://example.com/changed');
    release();
    await page.waitForTimeout(250);
    assert.equal(await page.getByRole('button', { name: 'Сменить фото контакта', exact: true }).count(), 0, 'Stale result must not replace photo');
    hold = false;
    await url.fill('https://t.me/first_person');
    await page.getByRole('button', { name: 'Сменить фото контакта', exact: true }).waitFor();
    assert.equal(requests.length, 2);
    assert.equal(requests[1].links[0].label, 'Telegram');
    assert.equal(requests[1].links[0].url, 'https://t.me/first_person', 'Restoring a cancelled URL must retry');
    assert.equal(await page.getByRole('button', { name: /^(Загрузить фото|Из соцсетей|Удалить фото)$/ }).count(), 0);
    const picker = page.getByRole('button', { name: 'Сменить фото контакта', exact: true });
    const chooser = page.waitForEvent('filechooser');
    await picker.click();
    await (await chooser).setFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64') });
    await page.getByRole('status').filter({ hasText: 'Фото загружено вручную' }).waitFor();
    await url.fill('https://t.me/third_person');
    await page.waitForTimeout(800);
    assert.equal(requests.length, 2, 'Manual photo must survive social URL changes');
    await page.waitForFunction(() => !document.querySelector('.contact-detail__avatar-picker').disabled);
    await page.bringToFront();
    await picker.focus();
    assert.equal(await picker.evaluate(el => el === document.activeElement), true);
    const keyboardChooser = page.waitForEvent('filechooser');
    await picker.press('Space');
    await (await keyboardChooser).setFiles([]);
    await page.screenshot({ path: `/tmp/rollapp-contact-photo-${width}-${height}.png` });
    assert.deepEqual(errors, []);
    console.log(`PASS contact photo ${width}x${height}: automatic/debounce/stale/manual/native chooser/keyboard`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
