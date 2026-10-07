import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

export async function runPlanningResponsiveChecks({ origin, token }) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5172';
  const context = await browser.newContext();
  await context.addCookies([{ name: 'rw_session', value: token, url: baseUrl }]);
  await context.route('**/api/me', async route => route.fulfill({ response: await route.fetch({ url: `${origin}/api/me` }) }));
  await context.route('**/api/planning/**', async route => {
    const url = new URL(route.request().url());
    await route.fulfill({ response: await route.fetch({ url: `${origin}${url.pathname}${url.search}` }) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    for (const [width, height] of [[320,640],[390,844],[560,740],[768,1024],[1024,768],[1280,720],[1440,900],[1920,1080],[844,390],[1280,400],[390,400]]) {
      if (process.env.PLANNING_RESPONSIVE_WIDTHS && !process.env.PLANNING_RESPONSIVE_WIDTHS.split(',').map(Number).includes(width)) continue;
      await page.setViewportSize({ width, height });
      for (const view of ['kanban','day','week','month','year','list']) {
        const label = `${view} ${width}x${height}`;
        await page.goto(`${baseUrl}/app/planning?tab=${view === 'kanban' ? 'kanban' : 'calendar'}&date=2026-10-15&view=${view}`);
        await page.locator(view === 'kanban' ? '.planning-board' : '.schedule').waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const geometry = await page.evaluate(() => {
          const root = document.querySelector('.planning-space');
          const scrollable = [...root.querySelectorAll('*')].filter(el => {
            const css = getComputedStyle(el);
            return el.getClientRects().length && ((/(auto|scroll)/.test(css.overflowY) && el.scrollHeight > el.clientHeight + 2) || (/(auto|scroll)/.test(css.overflowX) && el.scrollWidth > el.clientWidth + 2));
          });
          const describe = el => `${el.tagName}.${el.className}`;
          return {
            document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
            nested: scrollable.filter(el => scrollable.some(parent => parent !== el && parent.contains(el))).map(describe),
            scrollable: scrollable.map(describe),
            controls: [...document.querySelectorAll('.schedule-toolbar button, .schedule-navigation button, .kanban-toolbar button, .planning-space__header button')].filter(el => el.getClientRects().length).map(el => { const b = el.getBoundingClientRect(); return { name: el.getAttribute('aria-label') || el.textContent, x: b.x, y: b.y, right: b.right, bottom: b.bottom }; }),
          };
        });
        console.log(label, JSON.stringify({ document: geometry.document, nested: geometry.nested, scrollable: geometry.scrollable }));
        assert(geometry.document[0] <= width + 1, `${label}: document horizontal overflow`);
        assert(geometry.document[1] <= height + 1, `${label}: document vertical overflow`);
        assert.deepEqual(geometry.nested, [], `${label}: nested scroll containers`);
        for (const b of geometry.controls) assert(b.x >= -1 && b.right <= width + 1 && b.y >= 0 && b.bottom <= height, `${label}: clipped control ${JSON.stringify(b)}`);
        if (view === 'week' || view === 'day') {
          const freeHeight = await page.locator('.schedule-timeline').evaluate(el => el.clientHeight - el.querySelector('.schedule-timegrid__head').clientHeight);
          assert(freeHeight >= 48, `${label}: all-day events cover the time grid (${freeHeight}px)`);
          if (view === 'week') {
            const selectedVisible = await page.locator('.schedule-timeline').evaluate(el => {
              const viewport = el.querySelector('[data-slot="scroll-area-viewport"]').getBoundingClientRect();
              const date = el.querySelectorAll('.schedule-time-column')[3].getBoundingClientRect();
              return date.left >= viewport.left + 75 && date.right <= viewport.right + 1;
            });
            assert(selectedVisible, `${label}: selected day is outside the week viewport`);
          }
          if (width < 1200) assert.equal(await page.locator('.schedule-inspector').count(), 0, `${label}: cramped day inspector`);
        }
        if (view === 'kanban') {
          await page.locator('.planning-board').evaluate(el => { el.scrollTop = el.scrollHeight; el.scrollLeft = el.scrollWidth; });
          await page.getByRole('button', { name: 'Добавить список', exact: true }).scrollIntoViewIfNeeded();
          await page.locator('.planning-board').evaluate(el => { el.scrollTop = 0; el.scrollLeft = 0; });
          await page.getByRole('button', { name: /^Архив/ }).click();
          const archive = await page.locator('.kanban-archive').evaluate(el => ({ bottom: el.getBoundingClientRect().bottom, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
          assert(archive.bottom <= height + 1 && archive.clientHeight > 0, `${label}: archive exceeds viewport`);
          await page.getByRole('button', { name: /^Архив/ }).click();
        }
        if ([390,768,1440,844].includes(width)) await page.screenshot({ path: `/tmp/rollapp-responsive-${view}-${width}.png`, animations: 'disabled' });
      }
    }
    assert.deepEqual(errors, []);
  } catch (error) {
    await page.screenshot({ path: '/tmp/rollapp-responsive-failure.png', animations: 'disabled' });
    throw error;
  } finally {
    await context.unrouteAll({ behavior: 'ignoreErrors' });
    await browser.close();
  }
}
