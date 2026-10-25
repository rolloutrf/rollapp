import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin } from "./smoke-server.mjs";
const output = "/tmp/rollapp-health-trackers";
await mkdir(output, { recursive: true });
const server = await createServer({ server: { host: "127.0.0.1", port: 0, strictPort: true, hmr: false, watch: null }, plugins: [{ name: "health-fixture", enforce: "pre", transform(source, id) {
  if (id.endsWith("/src/lib/sphere-sharing.jsx")) return `${source}\nexport { SphereSharingContext };`;
  if (id.endsWith("/src/App.jsx?health-smoke")) return `${source}\nexport { GlobalAppChrome, SessionContext, ToastContext, CollectionNavigationContext };`;
}, configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
  if (!req.url.startsWith("/app/")) return next();
  res.setHeader("Content-Type", "text/html");
  res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/health-trackers.jsx"></script></body></html>'));
}); } }] });
await listenSmokeServer(server);
const browser = await chromium.launch(browserLaunchOptions());
let apiRequests = 0;
try {
 for (const [width, height] of [[320,900],[390,900],[768,900],[820,900],[1024,900],[1440,900],[1920,900],[390,400],[1024,400]]) {
  for (const tracker of ["sleep", "nutrition"]) {
   const page = await browser.newPage({ viewport: { width, height } });
   const errors = []; page.on("pageerror", error => errors.push(error.message));
   await page.route("**/api/**", route => { apiRequests++; return route.abort(); });
   await page.goto(`${smokeOrigin(server)}/app/spheres/health?tab=${tracker}`);
   const article = page.getByRole("article", { name: `Трекер: ${tracker === "sleep" ? "Сон" : "Питание"}` });
   await article.waitFor(); await page.evaluate(() => document.fonts.ready);
   if (tracker === 'sleep') {
    await checkSleepHistory(page, article, width, height);
    assert.deepEqual(errors, []);
    await page.close();
    continue;
   }
   await checkNutritionTodo(page, article, width, height);
   assert.deepEqual(errors, []);
   await page.close();
  }
 }
 for (const startupDelay of [0, 2200]) {
 const morning = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Moscow' });
 await morning.route('**/api/**', route => { apiRequests++; return route.abort(); });
 // Installing a ticking clock one second before midnight races cold CI loading.
 // Own time before navigation; only the explicit advance may cross midnight.
 await morning.clock.install({ time: new Date('2026-10-20T23:59:00+03:00') });
 await morning.clock.pauseAt(new Date('2026-10-20T23:59:59+03:00'));
 await delay(startupDelay);
 await morning.goto(`${smokeOrigin(server)}/app/spheres/health?tab=sleep&empty=1`);
 await morning.locator('[data-sleep-day="2026-10-20"]').waitFor();
 await morning.clock.fastForward(2100);
 await morning.locator('[data-sleep-day="2026-10-21"]').waitFor();
 assert.equal(await morning.locator('[data-sleep-day="2026-10-20"]').count(), 0, 'Unsaved placeholders are not manufactured history');
 assert.equal(await morning.getByRole('dialog').count(), 0);
 await morning.close();
 console.log(`PASS sleep midnight (${startupDelay}ms startup delay): a new daily tile appears automatically without API writes`);
 }
 assert.equal(apiRequests, 0, "UI presentation fixtures must not call API");
} finally { await browser.close(); await server.close(); }
async function assertGeometry(page, label) {
 const result = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, clipped: [...document.querySelectorAll('article input, article button, article p, article [data-slot="card-content"]')].filter(node => node.getBoundingClientRect().width > 0 && node.closest('[aria-hidden="true"]') == null).filter(node => node.scrollWidth > node.clientWidth + 1 && !/auto|scroll/.test(getComputedStyle(node).overflowX)).map(node => node.getAttribute("aria-label") || node.textContent.slice(0, 50)), body: [...document.querySelectorAll('[data-slot="card-content"].rollapp-body, [data-slot="card-content"].rollapp-body p')].map(node => ({ size: getComputedStyle(node).fontSize, line: getComputedStyle(node).lineHeight, margin: getComputedStyle(node).marginBottom })), controls: [...document.querySelectorAll('[data-control-bar] button')].filter(node => node.getBoundingClientRect().width).map(node => ({ height: node.getBoundingClientRect().height, radius: parseFloat(getComputedStyle(node).borderTopLeftRadius) })) }));
 assert(result.body.every(body => body.size === "18px" && body.line === "28px" && body.margin === "0px"), `${label}: body typography`);
 assert.deepEqual(result.clipped, [], `${label}: clipped content`);
 assert(!result.overflow, `${label}: root overflow`);
 assert(result.controls.every(control => Math.abs(control.height - 48) < 0.1 && control.radius >= 24), `${label}: shared control geometry`);
}

async function checkSleepHistory(page, article, width, height) {
 await assertGeometry(page, `${width} sleep history`);
 assert.equal(await article.getByRole('button', { name: /Предыдущий день|Следующий день|День трекера|Добавить/ }).count(), 0);
 assert.equal(await article.locator('[data-sleep-day]').count(), 2);
 const tiles = article.locator('[data-sleep-day]');
 const today = await tiles.first().getAttribute('data-sleep-day');
 const yesterday = await tiles.nth(1).getAttribute('data-sleep-day');
 assert(today > yesterday, 'History is newest first');
 await article.getByText('Прошлая ночь', { exact: true }).waitFor();
 await page.screenshot({ path: `${output}/sleep-history-${width}x${height}.png`, fullPage: true });
 await page.getByRole('button', { name: `Открыть запись сна: ${today}`, exact: true }).click();
 assert.equal(await page.getByRole('button', { name: /^Дата пробуждения:/ }).count(), 0);
 await page.getByLabel('Заметки', { exact: true }).fill('Обновлённый сон');
 await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
 await page.getByText('Проверка ошибки: черновик сохранён', { exact: true }).waitFor();
 assert.equal(await page.getByLabel('Заметки', { exact: true }).inputValue(), 'Обновлённый сон');
 await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
 await article.getByText('Обновлённый сон', { exact: true }).waitFor();
 await article.getByText('Прошлая ночь', { exact: true }).waitFor();
 await article.locator(`[data-sleep-day="${today}"]`).getByRole('button', { name: /^Удалить:/ }).click();
 await page.getByRole('button', { name: 'Отмена', exact: true }).click();
 await page.getByRole('button', { name: `Открыть запись сна: ${today}`, exact: true }).waitFor();
 await article.locator(`[data-sleep-day="${today}"]`).getByRole('button', { name: /^Удалить:/ }).click();
 await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить', exact: true }).click();
 await page.getByRole('button', { name: `Записать сон: ${today}`, exact: true }).waitFor();
 await article.getByText('Прошлая ночь', { exact: true }).waitFor();
 await page.getByRole('button', { name: `Записать сон: ${today}`, exact: true }).click();
 await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
 await page.getByRole('button', { name: `Открыть запись сна: ${today}`, exact: true }).waitFor();
 await page.goto(`${smokeOrigin(server)}/app/spheres/health?tab=sleep&readonly=1`);
 await article.waitFor();
 assert.equal(await article.getByRole('button').count(), 0, 'Read-only history is not interactive');
 await page.goto(`${smokeOrigin(server)}/app/spheres/health?tab=sleep&empty=1`);
 await article.waitFor();
 assert.equal(await article.locator('[data-sleep-day]').count(), 1);
 await page.getByRole('button', { name: /^Записать сон:/ }).click();
 await page.getByLabel('Заметки', { exact: true }).fill('Не сохранено');
 await page.getByRole('button', { name: width < 768 ? 'Назад' : 'Закрыть запись', exact: true }).click();
 await article.getByText('Как вы спали?', { exact: true }).waitFor();
 console.log(`PASS sleep history ${width}x${height}: daily tiles, descending history, whole-card open, no calendar/add, retry, edit/delete, create/cancel, read-only`);
}

async function checkNutritionTodo(page, article, width, height) {
 await assertGeometry(page, `${width} nutrition checklist`);
 if (width < 768) {
  assert.equal(await article.locator('.daily-todo__ribbon').count(), 0);
  await article.getByRole('button', { name: 'Добавить приём пищи', exact: true }).waitFor();
 } else {
  const day = await article.locator('[data-list-tile][aria-pressed="true"]').boundingBox();
  assert.equal(day.width, 130); assert.equal(day.height, 100);
 }
 await article.getByText('350 ккал', { exact: true }).waitFor();
 assert.equal(await article.locator('.daily-todo__overview').count(),0,'Removed nutrition overview must not reserve space');
 const checkbox = article.getByRole('checkbox', { name: 'Съедено: Омлет и овощи', exact: true });
 assert(await checkbox.isChecked(), 'Legacy logged meals count as eaten');
 await checkbox.click();
 await article.getByText('Проверка ошибки: черновик сохранён', { exact: true }).waitFor();
 assert(await checkbox.isChecked(), 'Failed completion writes retain the previous checkbox');
 await checkbox.click();
 await article.getByText('— ккал', { exact: true }).waitFor();
 assert(!(await checkbox.isChecked()));
 await checkbox.click();
 await article.getByText('350 ккал', { exact: true }).waitFor();
 await page.screenshot({ path: `${output}/nutrition-todo-${width}x${height}.png`, fullPage: true });
 if (width < 768) {
  await article.getByRole('button', { name: 'Предыдущий день', exact: true }).click();
  await article.getByText('Нет записей о питании', { exact: true }).waitFor();
  assert(new URL(page.url()).searchParams.has('date'));
  await article.getByRole('button', { name: 'Следующий день', exact: true }).click();
 } else {
  await article.locator('[data-list-tile][aria-pressed="true"]').press('ArrowLeft');
  await article.getByText('Нет записей о питании', { exact: true }).waitFor();
  assert(new URL(page.url()).searchParams.has('date'));
  await article.locator('[data-list-tile][aria-pressed="true"]').press('ArrowRight');
 }
 await checkbox.waitFor();
 await page.reload();
 await article.getByRole('button', { name: /^Редактировать приём пищи:/ }).click();
 await page.getByLabel('Заметки', { exact: true }).fill('Черновик питания');
 if (width < 768) {
  await page.getByRole('button', { name: /^Дата приёма пищи:/ }).click();
  await page.getByRole('heading', { name: 'Дата приёма пищи', exact: true }).waitFor();
  await page.goBack();
  await page.getByLabel('Заметки', { exact: true }).waitFor();
 }
 await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
 await page.getByText('Проверка ошибки: черновик сохранён', { exact: true }).waitFor();
 assert.equal(await page.getByLabel('Заметки', { exact: true }).inputValue(), 'Черновик питания');
 await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
 await article.getByText('Черновик питания', { exact: true }).waitFor();
 await article.getByRole('button', { name: /^Удалить:/ }).click();
 await page.getByRole('button', { name: 'Отмена', exact: true }).click();
 await article.getByRole('button', { name: /^Удалить:/ }).click();
 await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить', exact: true }).click();
 await article.getByText('Нет записей о питании', { exact: true }).waitFor();
 await page.goto(`${smokeOrigin(server)}/app/spheres/health?tab=nutrition&readonly=1`);
 await article.waitFor();
 assert(await checkbox.isDisabled());
 assert.equal(await article.getByRole('button', { name: /^Удалить:|^Добавить/ }).count(), 0);
 await page.goto(`${smokeOrigin(server)}/app/spheres/health?tab=nutrition&empty=1`);
 await article.getByRole('button', { name: 'Добавить приём пищи', exact: true }).click();
 await page.getByLabel('Блюдо или продукты', { exact: true }).fill('Новый приём пищи');
 assert(!(await page.getByRole('checkbox', { name: 'Приём пищи состоялся', exact: true }).isChecked()));
 await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
 await page.getByText('Проверка ошибки: черновик сохранён', { exact: true }).waitFor();
 await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
 await article.getByRole('checkbox', { name: 'Съедено: Новый приём пищи', exact: true }).waitFor();
 await article.getByText('— ккал', { exact: true }).waitFor();
 if (width >= 768) {
  const composer = article.getByRole('textbox', { name: 'Новый приём пищи на этот день', exact: true });
  await composer.fill('Быстрый перекус'); await composer.press('Enter');
  await article.getByRole('checkbox', { name: 'Съедено: Быстрый перекус', exact: true }).waitFor();
  assert.equal(await composer.inputValue(), '');
 }
 await assertGeometry(page, `${width} nutrition final`);
 console.log(`PASS nutrition To Do ${width}x${height}: shared ribbon/mobile row, checkbox failure/retry and totals, date URL, edit/draft/date Back, delete, read-only, planned creation and quick composer`);
}
