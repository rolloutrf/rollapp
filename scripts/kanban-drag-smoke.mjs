import { listenSmokeServer, smokePort, smokeOrigin } from "./smoke-server.mjs";
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { browserLaunchOptions } from './browser-runtime.mjs';
const port = smokePort(process.env.KANBAN_DRAG_PORT);

const server = await createServer({ cacheDir: 'node_modules/.vite-kanban-drag', server: { host: '127.0.0.1', port: smokePort(process.env.KANBAN_DRAG_PORT), strictPort: true, hmr: false, watch: null }, plugins: [{
  name: 'kanban-drag-fixture',
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (!req.url.startsWith('/kanban-drag')) return next();
    res.setHeader('Content-Type', 'text/html');
    res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/kanban-drag.jsx"></script></body></html>'));
  }); },
}] });
await listenSmokeServer(server);
const origin = smokeOrigin(server);
const browser = await chromium.launch(browserLaunchOptions());
await mkdir('/tmp/rollapp-kanban-drag', { recursive: true });
const order = page => page.locator('[data-kanban-column]').evaluateAll(elements => elements.map(element => element.dataset.kanbanColumn));
const calls = async page => JSON.parse(await page.locator('[data-drag-calls]').textContent());
async function ready(page, query = '') {
  await page.goto(`${origin}/kanban-drag${query}`);
  await page.locator('[data-kanban-column]').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function begin(page, id = 'c0') {
  const handle = page.getByRole('button', { name: `Перетащить список Список ${Number(id.slice(1)) + 1}`, exact: true });
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2, { steps: 5 });
  await page.locator(`[data-kanban-column="${id}"][data-dragging]`).waitFor();
}
async function dropAt(page, x, y) {
  await page.mouse.move(x, y, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction(() => !document.querySelector('[data-dragging]') && document.querySelector('.kanban-workspace').getAttribute('aria-busy') === 'false');
}
async function belowShortColumn(page) {
  const box = await page.locator('[data-kanban-column="c1"]').boundingBox();
  const board = await page.locator('.planning-board').boundingBox();
  return { x: box.x + box.width * 3 / 4, y: Math.min(Math.max(box.y + box.height + 60, board.y + 150), (await page.viewportSize()).height - 80) };
}
try {
  for (const width of [768, 820, 1024, 1440, 1920]) {
    for (const height of width === 820 ? [844, 400] : [844]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', route => { errors.push('Unexpected API request'); return route.abort(); });
      const label = `${width}x${height}`;
      await ready(page);
      await begin(page);
      const point = await belowShortColumn(page);
      await page.mouse.move(point.x, point.y, { steps: 10 });
      await page.locator('[data-kanban-column="c2"][data-drop-column]').waitFor();
      await page.screenshot({ path: `/tmp/rollapp-kanban-drag/${label}-insertion.png` });
      await dropAt(page, point.x, point.y);
      assert.deepEqual(await order(page), ['c1', 'c0', 'c2', 'c3', 'c4', 'c5'], `${label}: drop under short column`);
      assert.deepEqual(await calls(page), [{ path: 'columns/c0/move', payload: { beforeId: 'c2' } }]);
      await page.getByRole('status').filter({ hasText: 'Порядок списков сохранён' }).waitFor();

      await ready(page);
      await begin(page);
      const second = await page.locator('[data-kanban-column="c1"]').boundingBox();
      await dropAt(page, second.x + second.width + 6, second.y + 25);
      assert.deepEqual((await order(page)).slice(0, 3), ['c1', 'c0', 'c2'], `${label}: drop in gap`);

      await ready(page);
      await page.locator('.planning-board').evaluate(board => { board.scrollTop = 400; });
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const header = await page.locator('[data-kanban-column="c0"] .planning-column__header').evaluate(element => ({
        position: getComputedStyle(element).position,
        top: element.getBoundingClientRect().top,
        boardTop: element.closest('.planning-board').getBoundingClientRect().top,
      }));
      assert.equal(header.position, 'static', `${label}: column header must scroll with cards`);
      assert(header.top < header.boardTop, `${label}: column header stayed fixed after scrolling`);
      await begin(page);
      const scrolledTarget = await belowShortColumn(page);
      await dropAt(page, scrolledTarget.x, scrolledTarget.y);
      assert.deepEqual((await order(page)).slice(0, 3), ['c1', 'c0', 'c2'], `${label}: drag after vertical scroll`);

      await ready(page, '?columns=3&empty=1');
      await begin(page);
      await page.locator('.planning-board').evaluate(board => { board.scrollLeft = board.scrollWidth; });
      const end = await page.locator('.kanban-new-column').boundingBox();
      const endX = Math.max(60, Math.min(width - 60, end.x + end.width / 2));
      await page.mouse.move(endX, end.y + 24, { steps: 10 });
      await page.locator('[data-drop-column-end]').waitFor();
      await dropAt(page, endX, end.y + 24);
      assert.deepEqual(await order(page), ['c1', 'c2', 'c0'], `${label}: append to end`);
      assert.equal((await calls(page))[0].payload.beforeId, null);

      await ready(page, '?columns=3&empty=1');
      await begin(page, 'c2');
      await page.locator('.planning-board').evaluate(board => { board.scrollLeft = 0; });
      const first = await page.locator('[data-kanban-column="c0"]').boundingBox();
      await dropAt(page, first.x + 70, first.y + 24);
      assert.deepEqual(await order(page), ['c2', 'c0', 'c1'], `${label}: move collapsed column to beginning`);

      await ready(page);
      await begin(page);
      const own = await page.locator('[data-kanban-column="c0"]').boundingBox();
      await dropAt(page, own.x + 100, own.y + 25);
      assert.equal((await calls(page)).length, 0, `${label}: no-op must not save`);

      await begin(page);
      const cancelPoint = await belowShortColumn(page);
      await page.mouse.move(cancelPoint.x, cancelPoint.y, { steps: 10 });
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await page.waitForFunction(() => !document.querySelector('[data-dragging],[data-drop-column],[data-drop-column-end]'));
      assert.equal((await calls(page)).length, 0, `${label}: cancel must not save`);

      // Foreign browser drags have no Rollapp source, even if they use our MIME.
      const foreign = await page.evaluateHandle(() => { const transfer = new DataTransfer(); transfer.setData('application/x-rollapp-kanban', '{}'); return transfer; });
      await page.locator('.planning-column').first().dispatchEvent('drop', { dataTransfer: foreign });
      assert.equal((await calls(page)).length, 0, `${label}: ignore foreign drop`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: root overflow`);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS ${label}: mouse drag, short/empty/collapsed columns, gap, first/last positions, no-op, Escape, foreign drop`);
    }
  }

  let page = await browser.newPage({ viewport: { width: 1024, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => { errors.push('Unexpected API request'); return route.abort(); });
  await ready(page);
  await begin(page);
  const board = page.locator('.planning-board');
  const bounds = await board.boundingBox();
  await page.mouse.move(bounds.x + bounds.width - 5, bounds.y + 150, { steps: 10 });
  const scrollStart = await board.evaluate(element => element.scrollLeft);
  await page.waitForFunction(start => document.querySelector('.planning-board').scrollLeft > start + 400, scrollStart, { timeout: 3000 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('.kanban-workspace').getAttribute('aria-busy') === 'false');
  assert.equal((await calls(page)).length, 1, 'Stationary edge scroll must commit one move');
  const stoppedAt = await board.evaluate(element => element.scrollLeft);
  await page.waitForTimeout(150);
  assert.equal(await board.evaluate(element => element.scrollLeft), stoppedAt, 'Autoscroll must stop after release');
  console.log('PASS stationary mouse edge scrolling and cleanup');

  await ready(page);
  await board.evaluate(element => { element.scrollLeft = element.scrollWidth; });
  await begin(page, 'c5');
  await page.mouse.move(5, bounds.y + 150, { steps: 10 });
  const leftStart = await board.evaluate(element => element.scrollLeft);
  await page.waitForFunction(start => document.querySelector('.planning-board').scrollLeft < start - 400, leftStart, { timeout: 3000 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  const canceledAt = await board.evaluate(element => element.scrollLeft);
  await page.waitForTimeout(150);
  assert.equal(await board.evaluate(element => element.scrollLeft), canceledAt);
  assert.equal((await calls(page)).length, 0);
  console.log('PASS left edge scrolling and cancellation cleanup');

  await ready(page, '?delay=600');
  await begin(page);
  const delayedPoint = await belowShortColumn(page);
  await page.mouse.move(delayedPoint.x, delayedPoint.y, { steps: 10 });
  await page.mouse.up();
  await page.locator('.kanban-workspace[aria-busy="true"]').waitFor();
  assert(await page.getByRole('button', { name: 'Перетащить список Список 2', exact: true }).isDisabled());
  const repeated = await page.evaluateHandle(() => { const transfer = new DataTransfer(); transfer.setData('application/x-rollapp-kanban', '{}'); return transfer; });
  await board.dispatchEvent('drop', { dataTransfer: repeated, clientX: delayedPoint.x, clientY: delayedPoint.y });
  await page.waitForFunction(() => document.querySelector('.kanban-workspace').getAttribute('aria-busy') === 'false');
  assert.equal((await calls(page)).length, 1, 'Saving must prevent duplicate moves');
  console.log('PASS save in flight disables handles and rejects duplicate drops');

  await ready(page, '?fail=1');
  await begin(page);
  const failedPoint = await belowShortColumn(page);
  await dropAt(page, failedPoint.x, failedPoint.y);
  assert.deepEqual(await order(page), ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'], 'Failed save must preserve order');
  await page.getByText('Не удалось сохранить порядок', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-dragging],[data-drop-column],[data-drop-column-end]').count(), 0);
  console.log('PASS failed save preserves order, reports error and resets drag');

  await page.close();
  page = await browser.newPage({ viewport: { width: 1024, height: 844 }, hasTouch: true });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => { errors.push('Unexpected API request'); return route.abort(); });
  await ready(page);
  const client = await page.context().newCDPSession(page);
  const handle = await page.getByRole('button', { name: 'Перетащить список Список 1', exact: true }).boundingBox();
  const touchPoint = await belowShortColumn(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: handle.x + 20, y: handle.y + 20 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touchPoint] });
  await page.locator('[data-dragging]').waitFor();
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => document.querySelector('[data-kanban-column]')?.dataset.kanbanColumn === 'c1');
  assert.equal((await calls(page)).length, 1, 'Touch drag must save exactly once');
  console.log('PASS touch pointer capture and column insertion');

  await ready(page);
  const touchCancelHandle = await page.getByRole('button', { name: 'Перетащить список Список 1', exact: true }).boundingBox();
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchCancelHandle.x + 20, y: touchCancelHandle.y + 20 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [await belowShortColumn(page)] });
  await page.locator('[data-dragging]').waitFor();
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.waitForFunction(() => !document.querySelector('[data-dragging],[data-drop-column],[data-drop-column-end]'));
  assert.equal((await calls(page)).length, 0);
  console.log('PASS pointer cancellation releases drag without saving');

  await ready(page);
  const card = await page.locator('[data-kanban-card="t0"]').boundingBox();
  await page.mouse.move(card.x + 80, card.y + 30);
  await page.mouse.down();
  await page.mouse.move(card.x + 95, card.y + 30, { steps: 5 });
  await page.locator('[data-kanban-card="t0"][data-dragging]').waitFor();
  const emptyList = await page.locator('[data-kanban-column="c1"] .planning-column__tasks').boundingBox();
  await dropAt(page, emptyList.x + 100, emptyList.y + 20);
  assert.deepEqual(await calls(page), [{ path: 'tasks/t0/move', payload: { columnId: 'c1', beforeId: null } }]);
  assert.equal(await page.locator('[data-kanban-column="c1"] [data-kanban-card="t0"]').count(), 1);
  console.log('PASS task drag into an empty column remains functional');

  await ready(page, '?columns=3&empty=1');
  await page.getByRole('button', { name: 'Меню списка Список 1', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Сдвинуть вправо', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-kanban-column]')?.dataset.kanbanColumn === 'c1');
  assert.deepEqual(await order(page), ['c1', 'c0', 'c2']);
  assert.deepEqual(errors, []);
  await page.close();
  console.log('PASS accessible menu alternative');

  for (const width of [320, 390]) {
    const phone = await browser.newPage({ viewport: { width, height: 844 } });
    await phone.route('**/api/**', route => route.abort());
    await ready(phone, '?columns=3&empty=1');
    assert.equal(await phone.getByRole('button', { name: /^Перетащить список/ }).filter({ visible: true }).count(), 0);
    await phone.getByRole('button', { name: 'Меню списка Список 1', exact: true }).click();
    await phone.getByRole('menuitem', { name: 'Сдвинуть ниже', exact: true }).click();
    await phone.waitForFunction(() => document.querySelector('[data-kanban-column]')?.dataset.kanbanColumn === 'c1');
    assert.deepEqual(await order(phone), ['c1', 'c0', 'c2']);
    assert(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await phone.screenshot({ path: `/tmp/rollapp-kanban-drag/${width}-mobile.png` });
    await phone.close();
    console.log(`PASS ${width}: vertical mobile list and menu ordering`);
  }
} finally { await browser.close(); await server.close(); }
