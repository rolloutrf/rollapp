import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { browserLaunchOptions, smokePort } from './browser-runtime.mjs';
const port = smokePort(5195);
const server = await createServer({ cacheDir: 'node_modules/.vite-drag-drop', server: { host: '127.0.0.1', port, strictPort: true, hmr: false, watch: null }, plugins: [{
  name: 'drag-drop-fixture', enforce: 'pre',
  transform(source, id) { if (id.includes('/src/components/workouts.jsx?collection-badges-export')) return `${source}\nexport { WorkoutCard };`; if (id.includes('/src/App.jsx?drag-drop-test-export')) return `${source}\nexport { WishesPage, SessionContext, ToastContext, PublicWishGrid };`; },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => { if (!req.url.startsWith('/__drag-drop')) return next(); res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/drag-drop.jsx"></script></body></html>')); }); },
}] });
await server.listen();
const browser = await chromium.launch(browserLaunchOptions());
await mkdir('/tmp/rollapp-drag-drop', { recursive: true });
const calls = page => page.evaluate(() => window.dragTest.calls);
const order = (page, mode) => page.locator(mode === 'collection' ? '[data-sortable-card-id]' : '.wishes-page > .wish-grid > *').evaluateAll(nodes => nodes.map(node => node.dataset.sortableCardId || node.dataset.groupWishId || node.dataset.groupId));
async function load(page, query = '') {
  const destination = `http://127.0.0.1:${port}/__drag-drop${query}`;
  if (page.url().startsWith(`http://127.0.0.1:${port}/__drag-drop`)) await page.evaluate(query => window.dragTest.reset(query), query);
  else await page.goto(destination);
  await page.locator('[data-group-wish-id], [data-sortable-card-id], .schedule-event').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function start(page, mode = 'wishes', id = 'w0') {
  const source = page.locator(mode === 'collection' ? `[data-sortable-card-id="${id}"]` : `.wishes-page > .wish-grid [data-group-wish-id="${id}"]`);
  await source.scrollIntoViewIfNeeded();
  const rect = await source.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + 20);
  await page.mouse.down();
  if (mode === 'wishes') await page.waitForTimeout(280);
  await page.mouse.move(rect.x + rect.width / 2 + 12, rect.y + 20);
  const preview = page.locator(mode === 'collection' ? '.education-card--drag-preview' : '.wish-card--drag-preview');
  await preview.waitFor();
  const sizes = await source.evaluate(element => ({ width: element.offsetWidth, height: element.offsetHeight }));
  const snapshot = await preview.evaluate(element => ({ width: element.offsetWidth, height: element.offsetHeight, hidden: element.getAttribute('aria-hidden'), inert: element.inert }));
  assert(Math.abs(snapshot.width - sizes.width) <= 1 && Math.abs(snapshot.height - sizes.height) <= 1, 'Preview must retain source dimensions outside page CSS');
  assert(snapshot.inert && snapshot.hidden === 'true', 'Preview is isolated from interaction and accessibility');
}
const page = await browser.newPage({ viewport: { width: 320, height: 900 } });
const touch = await browser.newPage({ viewport: { width: 320, height: 900 }, hasTouch: true, isMobile: true });
const client = await touch.context().newCDPSession(touch);
let errors = [];
page.setDefaultNavigationTimeout(120000); touch.setDefaultNavigationTimeout(120000);
page.on('pageerror', error => errors.push(error.message));
touch.on('pageerror', error => errors.push(error.message));
for (const target of [page, touch]) await target.route('**/*', route => { const url = new URL(route.request().url()); if (url.pathname.startsWith('/api/')) { errors.push('Unexpected API request'); return route.abort(); } return url.origin === `http://127.0.0.1:${port}` ? route.continue() : route.abort(); });
try {
  for (const width of (process.env.DRAG_WIDTHS || '320,390,767,768,820,1024,1440,1920').split(',').map(Number)) {
    await page.setViewportSize({ width, height: width === 820 ? 450 : 900 });
    console.log(`RUN ${width}: drag/drop matrix`);
    errors = [];
    await touch.setViewportSize({ width, height: width === 820 ? 450 : 900 });
    for (const [target, input] of [[page, 'mouse'], [touch, 'touch']]) {
      await load(target, '?mode=badges');
      for (const dark of [true, false]) {
        await target.evaluate(value => document.documentElement.classList.toggle('dark', value), dark);
        const badges = await target.locator('[data-snippet-badge-case]').evaluateAll(cards => cards.map(card => {
          const badge = card.querySelector('.collection-snippet__badge'), label = badge.querySelector('span'), icon = badge.querySelector('svg'), media = card.querySelector('.collection-snippet__media'), handle = card.querySelector('[data-card-drag-handle]');
          const box = el => { const r = el.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
          const range = document.createRange(); range.selectNodeContents(label);
          return { status:card.dataset.snippetBadgeCase, badge:box(badge), media:box(media), icon:box(icon), glyphs:[...range.getClientRects()].map(r => ({left:r.left,right:r.right,top:r.top,bottom:r.bottom})), handle:handle && getComputedStyle(handle).display !== 'none' ? box(handle) : null };
        }));
        assert.equal(badges.length, 6, 'All owner/read-only workout statuses must be rendered');
        for (const {status,badge,media,icon,glyphs,handle} of badges) {
          assert(badge.left >= media.left && badge.right <= media.right && badge.top >= media.top && badge.bottom <= media.bottom, `${width} ${input} ${status}: badge leaves the media`);
          assert.equal(icon.width,12, 'Status icon must not shrink beside a long label');
          assert(glyphs.length && glyphs.every(r => r.left >= badge.left - .5 && r.right <= badge.right + .5 && r.top >= badge.top - .5 && r.bottom <= badge.bottom + .5), `${width} ${input} ${status}: status text is clipped`);
          if (handle) assert(badge.right <= handle.left || badge.left >= handle.right || badge.bottom <= handle.top || badge.top >= handle.bottom, `${width} ${input} ${status}: drag handle overlaps the status ${JSON.stringify({badge,handle,media})}`);
        }
        assert(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Status labels must not widen the document');
      }
      await target.evaluate(() => document.documentElement.classList.add('dark'));
      if ([390,1440].includes(width)) await target.screenshot({path:`/tmp/rollapp-drag-drop/status-tags-${input}-${width}.png`});
    }
    console.log(`PASS ${width}: real workout status labels remain complete and disjoint from mouse/touch handles in both themes and read-only cards`);
    for (const mode of ['wishes', 'collection']) {
      await load(page, `?mode=${mode}`);
      const original = await order(page, mode);
      await start(page, mode);
      await page.screenshot({ path: `/tmp/rollapp-drag-drop/${width}-${mode}-mouse-preview.png` });
      await page.keyboard.press('Escape');
      await page.mouse.up();
      assert.equal(await page.locator('.wish-card--drag-preview,.education-card--drag-preview').count(), 0, `${width} ${mode}: Escape removes preview`);
      assert.deepEqual(await order(page, mode), original);
      assert.deepEqual(await calls(page), [], 'Escape must not save');
      console.log(`PASS ${width} ${mode}: Escape`);
      // Reorder at an edge, then cancel after the DOM has actually moved.
      for (const cancellation of ['Escape', 'outside', 'capture', ...(mode === 'collection' ? ['disabled'] : [])]) {
        await load(page, `?mode=${mode}`);
        await start(page, mode);
        const targetNode = page.locator(mode === 'collection' ? '[data-sortable-card-id="w1"]' : '.wishes-page > .wish-grid [data-group-wish-id="w1"]');
        await targetNode.scrollIntoViewIfNeeded();
        const box = await targetNode.boundingBox();
        await page.mouse.move(box.x + box.width - 3, box.y + 4);
        await page.waitForTimeout(80);
        assert.notDeepEqual(await order(page, mode), original, `${width} ${mode}: live edge reorder`);
        if (cancellation === 'Escape') await page.keyboard.press('Escape');
        if (cancellation === 'outside') await page.mouse.move(1, 1);
        if (cancellation === 'capture') await page.evaluate(() => {
          const grid = document.querySelector('.wish-grid');
          // Real pointer capture, not a synthetic cancellation event.
          for (let id = 1; id < 10; id++) if (grid.hasPointerCapture(id)) grid.releasePointerCapture(id);
        });
        if (cancellation === 'disabled') { await page.evaluate(() => window.dragTest.disable()); await page.locator('[data-card-drag-handle]:disabled').first().waitFor({ state: 'attached' }); }
        await page.mouse.up();
        await page.waitForTimeout(30);
        assert.deepEqual(await calls(page), [], `${mode}: ${cancellation} must not save`);
        assert.deepEqual(await order(page, mode), original, `${mode}: ${cancellation} restores exact order`);
        assert.equal(await page.locator('.wish-card--drag-preview,.education-card--drag-preview').count(), 0);
      }
      for (const fail of [false, true]) {
        await load(page, `?mode=${mode}${fail ? '&fail' : ''}`);
        await start(page, mode);
        const targetNode = page.locator(mode === 'collection' ? '[data-sortable-card-id="w1"]' : '.wishes-page > .wish-grid [data-group-wish-id="w1"]');
        await targetNode.scrollIntoViewIfNeeded();
        const box = await targetNode.boundingBox();
        await page.mouse.move(box.x + box.width - 3, box.y + 4);
        await page.waitForTimeout(380);
        const moved = await page.locator(mode === 'collection' ? '[data-sortable-card-id="w0"]' : '.wishes-page > .wish-grid [data-group-wish-id="w0"]').boundingBox();
        await page.mouse.move(moved.x + moved.width / 2, moved.y + 20);
        await page.mouse.up();
        await page.waitForTimeout(100);
        assert.equal((await calls(page)).length, 1, `${mode}: save once`);
        if (fail) assert.deepEqual(await order(page, mode), original, `${mode}: failed save restores order`);
        else assert.notDeepEqual(await order(page, mode), original);
      }
      console.log(`PASS ${width} ${mode}: dirty Escape/outside/capture${mode === 'collection' ? '/access' : ''} cancellation, reorder, failed save`);
    }
    await load(page, '?mode=collection&hold');
    await start(page, 'collection');
    const pendingTarget = await page.locator('[data-sortable-card-id="w1"]').boundingBox();
    await page.mouse.move(pendingTarget.x + pendingTarget.width - 3, pendingTarget.y + 4);
    await page.waitForTimeout(380);
    const pendingSource = await page.locator('[data-sortable-card-id="w0"]').boundingBox();
    await page.mouse.move(pendingSource.x + pendingSource.width / 2, pendingSource.y + 20);
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('[data-order-busy]')?.textContent === 'true');
    await page.evaluate(() => window.dragTest.switchScope());
    await page.waitForFunction(() => document.querySelector('[data-sortable-card-id]')?.dataset.sortableCardId === 'w6');
    await page.evaluate(() => window.dragTest.rejectPendingOrder());
    await page.waitForFunction(() => document.querySelector('[data-order-busy]')?.textContent === 'false');
    assert.deepEqual(await order(page, 'collection'), ['w6','w7','w8','w9','w10','w11'], 'Late save failure must not restore old list data into a new scope');
    console.log(`PASS ${width}: pending save failure preserves newly selected collection`);
    await load(page);
    await start(page);
    const target = await page.locator('.wishes-page > .wish-grid [data-group-wish-id="w1"] .wish-card__image').boundingBox();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
    await page.mouse.up();
    assert(!(await calls(page)).some(call => call.path.includes('/groups')), `${width}: unconfirmed hover must not create a group`);
    console.log(`PASS ${width}: no unconfirmed grouping`);
    await load(page);
    await start(page);
    const groupTarget = page.locator('.wishes-page > .wish-grid [data-group-wish-id="w1"]');
    await groupTarget.scrollIntoViewIfNeeded();
    const groupBox = await groupTarget.locator('.wish-card__image').boundingBox();
    await page.mouse.move(groupBox.x + groupBox.width / 2, groupBox.y + groupBox.height / 2);
    await groupTarget.locator('xpath=self::*[contains(@class,"is-group-target")]').waitFor();
    await page.mouse.up();
    assert.equal((await calls(page)).filter(call => call.path.includes('/groups')).length, 1, 'Confirmed grouping saves once');
    for (const cancel of [true, false]) {
      await load(page, '?groups');
      const before = await order(page, 'wishes');
      const group = page.locator('.wishes-page > .wish-grid [data-group-id="g0"]');
      await group.scrollIntoViewIfNeeded();
      const groupBox = await group.boundingBox();
      await page.mouse.move(groupBox.x + groupBox.width / 2, groupBox.y + 20);
      await page.mouse.down(); await page.waitForTimeout(280);
      await page.locator('.wish-card--drag-preview').waitFor();
      const target = page.locator('.wishes-page > .wish-grid [data-group-wish-id="w0"]');
      await target.scrollIntoViewIfNeeded();
      const box = await target.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + 20);
      await page.waitForTimeout(380);
      assert.notDeepEqual(await order(page, 'wishes'), before, 'Group moves as one block');
      if (cancel) await page.mouse.move(1, 1);
      else { const moved = await group.boundingBox(); await page.mouse.move(moved.x + moved.width / 2, moved.y + 20); }
      await page.mouse.up(); await page.waitForTimeout(50);
      assert.equal((await calls(page)).length, cancel ? 0 : 1, 'Group outside drop cancels; inside saves once');
      if (cancel) assert.deepEqual(await order(page, 'wishes'), before);
    }
    console.log(`PASS ${width}: group reorder/outside cancellation`);
    await load(page, '?mode=calendar');
    await page.locator('.schedule-event').scrollIntoViewIfNeeded();
    // A foreign drag with a valid task id must not reschedule existing data.
    await page.locator('.schedule-time-column').evaluate(column => {
      const dataTransfer = new DataTransfer(); dataTransfer.setData('application/x-rollapp-calendar', 't0');
      column.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, clientY: column.getBoundingClientRect().top + 1100 }));
    });
    assert.deepEqual(await calls(page), [], 'Foreign calendar drag rejected');
    const resize = page.getByRole('button', { name: 'Изменить длительность: Событие' });
    await resize.scrollIntoViewIfNeeded();
    const resizeBox = await resize.boundingBox();
    await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
    await page.mouse.down(); await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + 45);
    await page.keyboard.press('Escape'); await page.mouse.up();
    assert.deepEqual(await calls(page), [], 'Calendar resize Escape must not save');
    console.log(`PASS ${width}: confirmed grouping, calendar foreign drop/resize Escape`);
    // The public owner collection uses native mouse DnD and a captured touch handle.
    await load(page, '?mode=public');
    const first = page.locator('[data-group-wish-id="w0"] .wish-card__open');
    const second = page.locator('[data-group-wish-id="w1"] .wish-card__open');
    await first.dragTo(second);
    await page.waitForTimeout(50);
    assert.equal((await calls(page)).length, 1, 'Public native reorder saves once');
    await load(page, '?mode=calendar');
    await page.locator('.schedule-event').scrollIntoViewIfNeeded();
    const eventBox = await page.locator('.schedule-event').boundingBox();
    await page.mouse.move(eventBox.x + eventBox.width / 2, eventBox.y + 10);
    await page.mouse.down();
    await page.mouse.move(eventBox.x + eventBox.width / 2, eventBox.y + 150, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(50);
    assert.equal((await calls(page)).length, 1, 'Native calendar drag saves once');
    console.log(`PASS ${width}: public native reorder, calendar native move`);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `/tmp/rollapp-drag-drop/${width}.png`, fullPage: true });
    await touch.setViewportSize({ width, height: 900 });
    for (const mode of ['wishes', 'collection', 'public']) {
      await load(touch, `?mode=${mode}`);
      const handle = touch.locator(mode === 'collection' ? '[data-sortable-card-id="w0"] [data-card-drag-handle]' : '[data-group-wish-id="w0"] [data-wish-drag-handle]');
      await handle.scrollIntoViewIfNeeded();
      const box = await handle.boundingBox();
      const target = await touch.locator(mode === 'collection' ? '[data-sortable-card-id="w1"]' : '[data-group-wish-id="w1"]').boundingBox();
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 20, y: box.y + 20 }] });
      await touch.locator('.wish-card--drag-preview,.education-card--drag-preview').waitFor();
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: target.x + target.width - 4, y: target.y + 20 }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      assert.deepEqual(await calls(touch), [], `${mode}: native touch cancellation must not save`);
      assert.equal(await touch.locator('.wish-card--drag-preview,.education-card--drag-preview').count(), 0);
      await load(touch, `?mode=${mode}`);
      await handle.scrollIntoViewIfNeeded();
      const beginBox = await handle.boundingBox();
      const targetNode = touch.locator(mode === 'collection' ? '[data-sortable-card-id="w1"]' : '[data-group-wish-id="w1"]');
      const endBox = await targetNode.boundingBox();
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: beginBox.x + 20, y: beginBox.y + 20 }] });
      await touch.locator('.wish-card--drag-preview,.education-card--drag-preview').waitFor();
      await touch.screenshot({ path: `/tmp/rollapp-drag-drop/${width}-${mode}-touch-preview.png` });
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: endBox.x + endBox.width - 4, y: endBox.y + 20 }] });
      await touch.waitForTimeout(380);
      if (mode !== 'public') {
        const moved = await touch.locator(mode === 'collection' ? '[data-sortable-card-id="w0"]' : '[data-group-wish-id="w0"]').boundingBox();
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: moved.x + moved.width / 2, y: moved.y + 20 }] });
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await touch.waitForTimeout(50);
      assert.equal((await calls(touch)).length, 1, `${mode}: native touch drop saves once`);
    }
    console.log(`PASS ${width}: native touch handles/cancellation in Wishlist, collections and public lists`);
    assert.deepEqual(errors, []);
  }
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) {
    console.error('FAIL STATE', page.url(), await page.locator('body').innerText({ timeout: 3000 }).catch(() => 'unavailable'));
    await page.screenshot({ path: '/tmp/rollapp-drag-drop/failure.png', timeout: 5000 }).catch(() => {});
  }
  throw error;
} finally { await browser.close(); await server.close(); }
