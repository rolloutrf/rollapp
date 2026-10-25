import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { browserLaunchOptions } from './browser-runtime.mjs';
import { listenSmokeServer, smokeOrigin } from './smoke-server.mjs';

const server = await createServer({
  cacheDir: 'node_modules/.vite-calendar-gestures',
  server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false, watch: null },
  plugins: [{ name: 'calendar-gestures',
    transform(source, id) { if (id.includes('planning-space.jsx?calendar-events-export')) return `${source}\nexport { TaskEditor };`; },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/__calendar-gestures')) return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/calendar-events.jsx"></script></body></html>'));
      });
    },
  }],
});
await listenSmokeServer(server);
const browser = await chromium.launch(browserLaunchOptions());
try {
  for (const width of (process.env.CALENDAR_WIDTHS || '320,390,767,768,820,1024,1440,1920').split(',').map(Number)) {
    for (const height of [900, 400]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce', deviceScaleFactor: width === 390 ? 3 : 1 });
      const errors = [];
      page.setDefaultTimeout(12000);
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', route => { errors.push('Unexpected API'); return route.abort(); });
      const state = () => page.locator('[data-state]').textContent().then(JSON.parse);
      const writes = async count => {
        await page.waitForFunction(count => JSON.parse(document.querySelector('[data-state]').textContent).writes.length === count, count);
        await page.locator('.schedule[aria-busy="false"]').waitFor();
      };
      const event = id => page.locator(`[data-calendar-event="${id}"] .schedule-event`);
      const viewport = page.locator('.schedule-timeline [data-slot="scroll-area-viewport"]');
      const load = async (view = 'day', extra = '') => {
        await page.goto(`${smokeOrigin(server)}/__calendar-gestures?date=2026-10-02&view=${view}${extra}`);
        await (view === 'month' ? page.locator('.schedule-month__grid') : event('long')).waitFor(); await page.evaluate(() => document.fonts.ready);
      };
      const reveal = async (locator, offset = 30) => {
        await locator.evaluate((node, offset) => {
          const viewport = node.closest('[data-slot="scroll-area-viewport"]');
          const rect = node.getBoundingClientRect();
          const bounds = viewport.getBoundingClientRect();
          viewport.scrollBy({ top: rect.top + offset - bounds.top - viewport.clientHeight / 2, behavior: 'instant' });
        }, offset);
        const box = await locator.boundingBox(), vp = await viewport.boundingBox();
        return { x: Math.max(vp.x + 82, Math.min(box.x + box.width / 2, vp.x + vp.width - 24)), y: box.y + offset, box };
      };
      const start = async (locator, offset) => {
        const point = await reveal(locator, offset);
        await page.mouse.move(point.x, point.y); await page.mouse.down();
        return point;
      };
      console.log('START calendar-gestures', width, height);
      await load();
      // Long-card middle grab: the pointer never becomes the event start.
      let point = await start(event('long'), 100);
      await page.mouse.move(point.x, point.y + 24, { steps: 3 });
      assert.equal(await event('long').evaluate(node => node.hasPointerCapture(1)), true);
      const ghost = await page.locator('.schedule-drag-preview').boundingBox();
      assert(Math.abs(ghost.width - point.box.width) < 1 && Math.abs(ghost.height - point.box.height) < 1, 'Preview changed source geometry');
      assert(Math.abs(ghost.y - point.box.y - 24) < 1, 'Preview lost the original grab point');
      assert.match(await page.locator('[data-calendar-preview="move"]').textContent(), /09:15–11:30/);
      assert.equal((await state()).writes.length, 0, 'Preview saved before release');
      await page.mouse.up(); await writes(1);
      assert.equal((await state()).tasks.find(t => t.id === 'long').startTime, '09:15');
      assert.equal((await state()).tasks.find(t => t.id === 'long').durationMinutes, 135);
      assert.equal(await page.locator('.schedule-preview[data-open]').count(), 0, 'Drop opened popover');
      await page.getByRole('button', { name: 'Отменить', exact: true }).last().click(); await writes(2);
      assert.equal((await state()).tasks.find(t => t.id === 'long').startTime, '09:00');
      // Moving across the card while staying in the same slot is a no-op.
      point = await start(event('long'), 100);
      await page.mouse.move(point.x + 12, point.y, { steps: 3 }); await page.mouse.up();
      assert.equal((await state()).writes.length, 2, 'No-op drag wrote a patch');
      for (const cancellation of ['escape', 'outside', 'capture', 'source', 'blur', 'pointercancel']) {
        point = await start(event('long'), 100);
        await page.mouse.move(point.x, point.y + 24, { steps: 3 });
        if (cancellation === 'escape') { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
        if (cancellation === 'outside') await page.mouse.move(2, 2);
        if (cancellation === 'capture') await event('long').evaluate(node => node.releasePointerCapture(1));
        if (cancellation === 'source') await page.locator('[data-update]').dispatchEvent('click');
        if (cancellation === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        if (cancellation === 'pointercancel') await event('long').dispatchEvent('pointercancel', { pointerId: 1, bubbles: true });
        await page.mouse.up();
        assert.equal((await state()).writes.length, 2, `${cancellation} wrote a schedule`);
        await page.waitForFunction(() => !document.querySelector('.schedule-drag-preview, [data-calendar-preview]'));
        assert.equal(await page.locator('.schedule-preview[data-open]').count(), 0, `${cancellation} opened an event`);
      }
      await event('series@2026-10-02').click();
      await page.locator('.schedule-preview[data-open]').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('.schedule-preview[data-open]').waitFor({ state: 'hidden' });
      assert.equal((await state()).writes.length, 2, 'Opening a recurring event wrote data');
      // Resize delta is independent of the point inside the bottom handle.
      const handle = page.getByRole('button', { name: 'Изменить длительность: Встреча с командой', exact: true });
      point = await start(handle, 1);
      await page.mouse.move(point.x, point.y + 24, { steps: 3 }); await page.mouse.up(); await writes(3);
      assert.equal((await state()).tasks.find(t => t.id === 'long').durationMinutes, 150, 'Resize included handle grab offset');
      await page.getByRole('button', { name: 'Отменить', exact: true }).last().click(); await writes(4);
      assert.equal((await state()).tasks.find(t => t.id === 'long').durationMinutes, 135);
      await load();
      point = await start(handle, 18);
      await page.mouse.move(point.x, point.y + 24, { steps: 3 }); await page.mouse.up(); await writes(1);
      assert.equal((await state()).tasks.find(t => t.id === 'long').durationMinutes, 150);
      await load();
      await page.locator('[data-fail]').dispatchEvent('click');
      point = await start(event('long'), 100);
      await page.mouse.move(point.x, point.y + 24, { steps: 3 }); await page.mouse.up();
      await page.getByText('Не удалось сохранить событие', { exact: true }).waitFor();
      assert.equal((await state()).writes.length, 0);
      assert.equal((await state()).tasks.find(t => t.id === 'long').startTime, '09:00');
      await page.locator('[data-fail]').dispatchEvent('click');
      point = await start(event('long'), 100);
      await page.mouse.move(point.x, point.y + 24, { steps: 3 }); await page.mouse.up(); await writes(1);
      const oldUndo = page.getByRole('button', { name: 'Отменить', exact: true }).last();
      await oldUndo.evaluate(node => node.setAttribute('data-stale-undo', ''));
      point = await start(event('long'), 100);
      await page.mouse.move(point.x, point.y + 24, { steps: 3 }); await page.mouse.up(); await writes(2);
      await page.locator('[data-stale-undo]').press('Enter');
      await page.getByText('Расписание уже изменилось. Откройте событие для редактирования.', { exact: true }).waitFor();
      assert.equal((await state()).writes.length, 2, 'Stale Undo overwrote a newer schedule');
      assert.equal((await state()).tasks.find(t => t.id === 'long').startTime, '09:30');
      await load();
      await handle.press('ArrowDown'); await writes(1);
      await page.locator('[data-shift-date]').dispatchEvent('click');
      await page.getByRole('button', { name: 'Отменить', exact: true }).last().press('Enter');
      await page.getByText('Расписание уже изменилось. Откройте событие для редактирования.', { exact: true }).waitFor();
      assert.equal((await state()).writes.length, 1, 'Resize Undo overwrote a later date-only change');
      assert.equal((await state()).tasks.find(t => t.id === 'long').durationMinutes, 150);
      await load();
      await page.locator('[data-hold]').dispatchEvent('click');
      point = await start(event('long'), 100);
      await page.mouse.move(point.x, point.y + 24, { steps: 3 }); await page.mouse.up();
      await page.locator('.schedule[aria-busy="true"]').waitFor();
      point = await start(event('long'), 100);
      await page.mouse.move(point.x, point.y + 24, { steps: 3 }); await page.mouse.up();
      assert.equal(await page.locator('.schedule-drag-preview').count(), 0, 'Busy calendar began a second drag');
      await page.locator('[data-release]').dispatchEvent('click'); await writes(1);
      assert.equal((await state()).tasks.find(t => t.id === 'long').startTime, '09:15');
      if (width < 768) {
        await load();
        point = await reveal(event('long'), 100);
        const beforeTouch = await viewport.evaluate(node => node.scrollTop);
        const touch = await page.context().newCDPSession(page);
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] });
        for (const offset of [20, 40, 60]) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y - offset }] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForFunction(before => document.querySelector('.schedule-timeline [data-slot="scroll-area-viewport"]').scrollTop > before + 20, beforeTouch);
        assert.equal((await state()).writes.length, 0, 'Touch scrolling moved a calendar event');
        assert.equal(await page.locator('.schedule-preview[data-open]').count(), 0, 'Touch scrolling opened event details');
        await touch.detach();
      }
      await load('week');
      const thursday = page.locator('.schedule-time-column[data-date="2026-10-01"]');
      // Keep the two destination columns visible, even at narrow widths.
      await viewport.evaluate(node => { const column = node.querySelector('[data-date="2026-10-01"]'); node.scrollLeft += column.getBoundingClientRect().left - node.getBoundingClientRect().left - 80; });
      const shortBefore = (await state()).tasks.find(t => t.id === 'short');
      point = await start(event('short'), 5);
      const previous = await thursday.boundingBox();
      await page.mouse.move(previous.x + previous.width - 12, point.y, { steps: 4 });
      await page.mouse.up(); await writes(1);
      assert.deepEqual((await state()).tasks.find(t => t.id === 'short'), { ...shortBefore, dueOn: '2026-10-01' });
      // Center the source day so the vertical case does not also scroll horizontally.
      await event('long').evaluate(node => {
        const viewport = node.closest('[data-slot="scroll-area-viewport"]');
        const column = node.closest('[data-date]').getBoundingClientRect();
        viewport.scrollLeft += column.left + column.width / 2 - viewport.getBoundingClientRect().left - (76 + viewport.clientWidth) / 2;
      });
      // Stationary pointer at the edge must continue scrolling and update time.
      point = await start(event('long'), 100);
      const vp = await viewport.boundingBox();
      const beforeScroll = await viewport.evaluate(node => node.scrollTop);
      await page.mouse.move(point.x, vp.y + vp.height - 4, { steps: 3 });
      await page.waitForFunction(before => document.querySelector('.schedule-timeline [data-slot="scroll-area-viewport"]').scrollTop > before + 60, beforeScroll);
      assert.equal(await event('long').evaluate(node => node.hasPointerCapture(1)), true, 'Edge scrolling lost capture');
      await page.keyboard.press('Escape'); await page.mouse.up();
      assert.equal((await state()).writes.length, 1, 'Edge scroll cancellation saved');
      // Commit a move after scrolling several initially invisible hours.
      point = await start(event('long'), 100);
      const farBefore = await viewport.evaluate(node => node.scrollTop);
      await page.mouse.move(point.x, vp.y + vp.height - 4, { steps: 3 });
      await page.waitForFunction(before => document.querySelector('.schedule-timeline [data-slot="scroll-area-viewport"]').scrollTop > before + 360, farBefore);
      await page.mouse.move(point.x, vp.y + vp.height / 2, { steps: 3 });
      const proposed = (await page.locator('[data-calendar-preview="move"]').textContent()).match(/· (\d{2}:\d{2})–/)[1];
      await page.screenshot({ path: `/tmp/rollapp-calendar-drag-preview-${width}-${height}.png` });
      await page.mouse.up(); await writes(2);
      let moved = (await state()).tasks.find(t => t.id === 'long');
      assert.equal(moved.startTime, proposed, 'Far drop did not save the visible preview time');
      assert.equal(moved.dueOn, '2026-10-02', 'Vertical drag changed the day');
      assert.equal(moved.durationMinutes, 135, 'Far drop changed duration');
      assert.notEqual(moved.startTime, '09:00');
      let scheduleWrites = 2;
      if (width <= 1024) {
        await viewport.evaluate(node => { if (node.scrollWidth - node.clientWidth - node.scrollLeft < 80) node.scrollLeft -= 100; });
        point = await start(event('long'), 100);
        const before = await viewport.evaluate(node => node.scrollLeft);
        await page.mouse.move(vp.x + vp.width - 18, point.y, { steps: 4 });
        await page.waitForFunction(before => document.querySelector('.schedule-timeline [data-slot="scroll-area-viewport"]').scrollLeft > before + 40, before);
        await page.mouse.move(vp.x + vp.width - 50, point.y, { steps: 2 });
        const destination = await page.locator('[data-calendar-preview="move"]').evaluate(node => node.closest('[data-date]').dataset.date);
        const startTime = (await page.locator('[data-calendar-preview="move"]').textContent()).match(/· (\d{2}:\d{2})–/)[1];
        await page.mouse.up(); await writes(++scheduleWrites);
        moved = (await state()).tasks.find(t => t.id === 'long');
        assert.equal(moved.dueOn, destination, 'Horizontal edge scroll saved another date');
        assert.notEqual(moved.dueOn, '2026-10-02', 'Horizontal edge scroll did not reach another day');
        assert.equal(moved.startTime, startTime);
        assert.equal(moved.durationMinutes, 135);
      }
      if (width < 768) {
        await load('month');
        const task = page.locator('.schedule-agenda__task').filter({ hasText: 'Без времени' });
        await task.evaluate((node) => {
          const transfer = new DataTransfer();
          node.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }));
          document.querySelector('.schedule-month__cell[data-date="2026-10-03"]').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
          node.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: transfer }));
        });
        await writes(1);
        const untimed = (await state()).tasks.find(t => t.id === 'untimed');
        assert.equal(untimed.dueOn, '2026-10-03');
        assert.equal(untimed.startTime, '', 'Date-only drop materialized a display time');
        assert.equal(untimed.durationMinutes, 60, 'Date-only drop materialized a display duration');
        await page.getByRole('button', { name: 'Отменить', exact: true }).last().click(); await writes(2);
        assert.equal((await state()).tasks.find(t => t.id === 'untimed').dueOn, '2026-10-02');
      }
      await load('day', '&large=1');
      await viewport.evaluate(node => { node.scrollTop = 10 * 96; });
      const title = await page.locator('[data-calendar-event="long"] .schedule-event__title').boundingBox();
      const visible = await viewport.boundingBox();
      assert(title.y >= visible.y && title.y + title.height <= visible.y + visible.height, 'Long event lost its title while scrolling');
      assert.equal((await state()).tasks.find(t => t.id === 'long').durationMinutes, 1440, 'Reading changed a long appointment');
      assert.equal((await state()).writes.length, 0);
      const longBox = await event('long').boundingBox();
      const grab = { x: longBox.x + longBox.width / 2, y: visible.y + visible.height / 2 };
      await page.mouse.move(grab.x, grab.y); await page.mouse.down();
      const sourceTitle = await page.locator('[data-calendar-event="long"] .schedule-event__title').boundingBox();
      await page.mouse.move(grab.x + 12, grab.y, { steps: 3 });
      const previewTitle = await page.locator('.schedule-drag-preview .schedule-event__title').boundingBox();
      assert(Math.abs(previewTitle.y - sourceTitle.y) < 1, 'Portalled long-event preview moved its sticky title');
      assert(Math.abs(previewTitle.x - sourceTitle.x - 12) < 1, 'Long-event title lost the horizontal grab offset');
      await page.mouse.up();
      assert.equal((await state()).writes.length, 0, 'Long-event no-op saved');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Root overflow');
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `/tmp/rollapp-calendar-gestures-${width}-${height}.png` });
      console.log('PASS calendar-gestures', width, height);
      await page.close();
    }
  }
} finally { await browser.close(); await server.close(); }
