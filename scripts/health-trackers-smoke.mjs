import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin } from "./smoke-server.mjs";
import { smokeBaseUiDependencies } from "./smoke-dependencies.mjs";
const output = "/tmp/rollapp-health-trackers";
await mkdir(output, { recursive: true });
// Prebundle the transformed fixture and shared app chrome dependencies on cold startup.
const server = await createServer({ cacheDir: "node_modules/.vite-health-smoke", optimizeDeps: { entries: ["scripts/fixtures/health-trackers.jsx"], include: [...smokeBaseUiDependencies, "next-themes", "qrcode", "sonner"] }, server: { host: "127.0.0.1", port: 0, strictPort: true, hmr: false, watch: null }, plugins: [{ name: "health-fixture", enforce: "pre", transform(source, id) {
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
   const page = await browser.newPage({ viewport: { width, height }, timezoneId: "Europe/Moscow" });
   await page.clock.setFixedTime(new Date("2026-11-06T12:00:00+03:00"));
   const errors = []; page.on("pageerror", error => errors.push(error.message));
   await page.route("**/api/**", route => { apiRequests++; return route.abort(); });
   await page.goto(`${smokeOrigin(server)}/app/spheres/health?tab=${tracker}`);
   const article = page.getByRole("article", { name: `Трекер: ${tracker === "sleep" ? "Сон" : "Питание"}` });
   await article.waitFor(); await page.evaluate(() => document.fonts.ready);
   if (tracker === 'sleep') {
    await checkSleepCalendar(page, article, width, height);
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
 assert.equal(await morning.locator('[data-sleep-day="2026-10-20"]').count(), 0, 'Only the selected day is shown after midnight');
 assert.equal(await morning.getByRole('dialog').count(), 0);
 await morning.close();
 console.log(`PASS sleep midnight (${startupDelay}ms startup delay): selection follows today automatically without API writes`);
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

// A native form unmounts before its queued history Back completes. Do not open
// another form or navigate away until the owning tracker URL has returned.
function waitForTrackerReturn(page) { return page.waitForURL(url => !url.searchParams.has("formScreen")); }

async function checkSleepCalendar(page, article, width, height) {
 const mobile = width < 768;
 const day = article.locator('[data-sleep-day]');
 const activeTile = article.locator('[data-list-tile][aria-pressed="true"]');
 const dateButton = article.getByRole('button', { name: /^День сна:/ });
 const closeForm = page.getByRole('button', { name: mobile ? 'Назад' : 'Закрыть запись', exact: true });
 const save = page.getByRole('button', { name: 'Сохранить', exact: true });
 const notes = page.getByLabel('Заметки', { exact: true });
 const previous = () => mobile ? article.getByRole('button', { name: 'Предыдущий день', exact: true }).click() : activeTile.press('ArrowLeft');
 const next = () => mobile ? article.getByRole('button', { name: 'Следующий день', exact: true }).click() : activeTile.press('ArrowRight');
 const currentDate = () => day.getAttribute('data-sleep-day');
 const today = await currentDate();
 const readUrlDate = () => new URL(page.url()).searchParams.get('date');
 await article.getByText('7 ч 45 мин', { exact: true }).waitFor();
 assert.equal(await article.getByText('Прошлая ночь', { exact: true }).count(), 0);
 await assertGeometry(page, `${width} sleep calendar`);
 if (mobile) {
  assert.equal(await article.locator('.daily-todo__ribbon').count(), 0);
  const toolbar = article.getByRole('group', { name: 'День сна', exact: true });
  await toolbar.getByRole('button', { name: 'Записать сон', exact: true }).waitFor();
  assert.equal(await toolbar.getByRole('button').count(), 4);
 } else {
  const tile = await activeTile.boundingBox();
  const ribbon = await article.locator('.daily-todo__ribbon').boundingBox();
  assert.equal(tile.width, 130); assert.equal(tile.height, 100);
  assert(Math.abs(tile.x + tile.width / 2 - ribbon.x - ribbon.width / 2) < 1, 'Selected tile is centered');
  if (width <= 820) {
   assert(Math.abs(ribbon.x) < 1 && Math.abs(ribbon.width - width) < 1, 'Ribbon reaches both screen edges');
  }
  assert.match(await activeTile.getAttribute('aria-label'), /Есть запись сна/);
  const add = article.getByRole('button', { name: 'Записать сон', exact: true });
  const button = await add.evaluate(node => { const css = getComputedStyle(node); return [css.paddingLeft, css.paddingRight, node.offsetHeight]; });
  assert.deepEqual(button, ['24px', '24px', 48]);
 }
 await page.screenshot({ path: `${output}/sleep-calendar-${width}x${height}.png`, fullPage: true });
 await previous();
 await article.getByText('Прошлая ночь', { exact: true }).waitFor();
 const yesterday = await currentDate();
 assert(yesterday < today);
 assert.equal(readUrlDate(), yesterday);
 assert.equal(await article.getByText('Спокойный сон', { exact: true }).count(), 0);
 await page.reload();
 await article.getByText('Прошлая ночь', { exact: true }).waitFor();
 assert.equal(await currentDate(), yesterday, 'A selected past day survives reload');
 await article.getByRole('button', { name: 'Открыть запись сна: 14:00 — 14:45', exact: true }).click();
 assert.equal(await notes.inputValue(), 'Дневной сон');
 assert.equal(await page.getByRole('button', { name: /^Дата пробуждения:/ }).count(), 0);
 await notes.fill('Обновлённый сон');
 await save.click();
 await page.getByText('Проверка ошибки: черновик сохранён', { exact: true }).waitFor();
 assert.equal(await notes.inputValue(), 'Обновлённый сон');
 await save.click();
 await waitForTrackerReturn(page);
 await article.getByText('Обновлённый сон', { exact: true }).waitFor();
 await article.getByText('Прошлая ночь', { exact: true }).waitFor();
 assert.equal(readUrlDate(), yesterday);
 await previous();
 await article.getByText('Как вы спали?', { exact: true }).waitFor();
 const emptyDay = await currentDate();
 assert(emptyDay < yesterday);
 if (mobile) {
  await dateButton.click();
  await page.getByRole('heading', { name: 'День сна', exact: true }).waitFor();
  await page.goBack();
  await waitForTrackerReturn(page);
  assert.equal(readUrlDate(), emptyDay, 'Back cancels the date picker');
  await article.getByRole('group', { name: 'День сна', exact: true }).getByRole('button', { name: 'Записать сон', exact: true }).click();
 } else {
  assert.doesNotMatch(await activeTile.getAttribute('aria-label'), /Есть запись сна/);
  await article.getByRole('button', { name: `Записать сон: ${emptyDay}`, exact: true }).click();
 }
 await notes.fill('Не сохранено');
 if (mobile) await page.goBack(); else await closeForm.click();
 await notes.waitFor({ state: 'hidden' });
 await waitForTrackerReturn(page);
 assert.equal(readUrlDate(), emptyDay, 'Cancelling the entry preserves its selected day');
 await article.getByRole('button', { name: `Записать сон: ${emptyDay}`, exact: true }).click();
 assert.equal(await notes.inputValue(), '');
 await notes.fill('Запись за выбранный день');
 await save.click();
 await waitForTrackerReturn(page);
 await article.getByText('Запись за выбранный день', { exact: true }).waitFor();
 assert.equal(readUrlDate(), emptyDay);
 if (!mobile) assert.match(await activeTile.getAttribute('aria-label'), /Есть запись сна/);
 await next();
 await article.getByText('Обновлённый сон', { exact: true }).waitFor();
 assert.equal(await article.getByText('Запись за выбранный день', { exact: true }).count(), 0);
 if (mobile) {
  await dateButton.click();
  const calendar = page.getByRole('region', { name: 'День сна', exact: true });
  const [year, month, date] = emptyDay.split('-');
  await calendar.locator(`button[data-day="${date}.${month}.${year}"]`).click();
  await waitForTrackerReturn(page);
  await article.getByText('Запись за выбранный день', { exact: true }).waitFor();
  assert.equal(readUrlDate(), emptyDay);
 } else {
  await activeTile.press('Home');
  await article.getByText('Спокойный сон', { exact: true }).waitFor();
  assert.equal(readUrlDate(), null, 'Home restores today');
 }
 await page.goto(`${smokeOrigin(server)}/app/spheres/health?tab=sleep&readonly=1&date=${yesterday}`);
 await article.getByText('Прошлая ночь', { exact: true }).waitFor();
 assert.equal(await article.getByRole('button', { name: /^(Записать сон|Открыть запись сна)/ }).count(), 0);
 await previous();
 await article.getByText('Нет записей о сне', { exact: true }).waitFor();
 if (mobile) {
  const readonlyRow = article.getByRole('group', { name: 'День сна', exact: true });
  const row = await readonlyRow.boundingBox();
  const nextDay = await readonlyRow.getByRole('button', { name: 'Следующий день', exact: true }).boundingBox();
  assert(Math.abs(nextDay.x + nextDay.width - row.x - row.width) < 1, 'Read-only navigation uses the full width without an empty add slot');
 }
 await assertGeometry(page, `${width} read-only sleep`);
 console.log(`PASS sleep calendar ${width}x${height}: shared navigation, date URL and reload, multi-entry edit/retry, historical creation, cancel/Back, read-only and geometry`);
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
 await article.getByRole('checkbox', { name: 'Съедено: Омлет и овощи', exact: true }).waitFor();
 assert.equal(await article.locator('.daily-todo__overview').count(),0,'Removed nutrition overview must not reserve space');
 assert.equal(await article.locator('[aria-label="Итоги питания"]').count(), 0, 'Nutrition has no daily totals summary');
 assert.equal(await article.getByText('Итоги по отмеченным приёмам пищи', { exact: true }).count(), 0);
 const checkbox = article.getByRole('checkbox', { name: 'Съедено: Омлет и овощи', exact: true });
 assert(await checkbox.isChecked(), 'Legacy logged meals count as eaten');
 await checkbox.click();
 await article.getByText('Проверка ошибки: черновик сохранён', { exact: true }).waitFor();
 assert(await checkbox.isChecked(), 'Failed completion writes retain the previous checkbox');
 await checkbox.click();
 await article.locator('section[aria-label="Запланировано"]').getByRole('checkbox', { name: 'Съедено: Омлет и овощи', exact: true }).waitFor();
 assert(!(await checkbox.isChecked()));
 await checkbox.click();
 await article.locator('section[aria-label="Съедено"]').getByRole('checkbox', { name: 'Съедено: Омлет и овощи', exact: true }).waitFor();
 assert(await checkbox.isChecked());
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
 await waitForTrackerReturn(page);
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
 await waitForTrackerReturn(page);
 assert(!(await article.locator('section[aria-label="Запланировано"]').getByRole('checkbox', { name: 'Съедено: Новый приём пищи', exact: true }).isChecked()));
 if (width >= 768) {
  const composer = article.getByRole('textbox', { name: 'Новый приём пищи на этот день', exact: true });
  await composer.fill('Быстрый перекус'); await composer.press('Enter');
  await article.getByRole('checkbox', { name: 'Съедено: Быстрый перекус', exact: true }).waitFor();
  assert.equal(await composer.inputValue(), '');
 }
 await assertGeometry(page, `${width} nutrition final`);
 console.log(`PASS nutrition To Do ${width}x${height}: shared ribbon/mobile row, checkbox failure/retry and planned/eaten grouping, no daily summary, date URL, edit/draft/date Back, delete, read-only, planned creation and quick composer`);
}
