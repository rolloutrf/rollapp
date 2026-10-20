import { listenSmokeServer, smokePort, smokeOrigin } from "./smoke-server.mjs";
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { browserLaunchOptions } from './browser-runtime.mjs';
const port = smokePort();

const server = await createServer({
  cacheDir: 'node_modules/.vite-wish-group-smoke',
  server: { host: '127.0.0.1', port: smokePort(), strictPort: true, hmr: false, watch: null },
  plugins: [{
    name: 'wish-group-fixture', enforce: 'pre',
    transform(source, id) {
      if (id.includes('/src/App.jsx?wish-group-test-export')) return `${source}\nexport { WishGroupTile };`;
    },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/__wish-group-smoke')) return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/wish-group-names.jsx"></script></body></html>'));
      });
    },
  }],
});
await listenSmokeServer(server);
const origin = smokeOrigin(server);
const browser = await chromium.launch(browserLaunchOptions());
try {
  for (const width of [320, 390, 767, 768, 820, 1024, 1440, 1920]) {
    for (const readonly of [false, true]) {
      const page = await browser.newPage({ viewport: { width, height: width === 820 ? 450 : 844 }, deviceScaleFactor: width < 768 ? 3 : 1 });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/api/**', (route) => { errors.push('Unexpected API request'); return route.abort(); });
      await page.goto(`${origin}/__wish-group-smoke${readonly ? '?readonly' : ''}`);
      await page.locator('.wish-group-tile__title').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      const geometry = await page.locator('.wish-group-tile').evaluateAll((tiles) => tiles.map((tile) => {
        const title = tile.querySelector('.wish-group-tile__title');
        const label = title.firstElementChild;
        const heading = title.parentElement;
        const count = tile.querySelector('.wish-card__top > span');
        const box = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height }; };
        const labelStyle = label && getComputedStyle(label);
        const range = document.createRange(); range.selectNodeContents(count);
        return {
          tile: box(tile), title: box(title), heading: box(heading), count: box(count), countText: box(range),
          text: title.textContent, tooltip: title.title, overflow: labelStyle?.textOverflow,
          nowrap: labelStyle?.whiteSpace, clipped: labelStyle?.overflowX,
          truncated: label && label.scrollWidth > label.clientWidth,
          labelHeight: label?.clientHeight, lineHeight: labelStyle && parseFloat(labelStyle.lineHeight),
        };
      }));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Root overflows');
      for (const item of geometry) {
        assert.equal(item.overflow, 'ellipsis', `Missing ellipsis for ${item.text}`);
        assert.equal(item.nowrap, 'nowrap');
        assert.equal(item.clipped, 'hidden');
        assert.equal(item.tooltip, item.text);
        assert(item.title.left >= item.tile.left - 1 && item.title.right <= item.tile.right + 1, 'Title leaves card');
        assert(item.title.bottom <= item.heading.bottom + 1, 'Heading clips title vertically');
        assert(item.labelHeight >= item.lineHeight - 1, 'Text line is cropped');
        assert(item.count.top >= item.title.bottom - 1, 'Count overlaps title');
        assert(item.count.bottom <= item.tile.bottom + 1, 'Metadata leaves fixed card row');
        assert(item.countText.left >= item.tile.left - 1 && item.countText.right <= item.tile.right + 1, 'Count is clipped horizontally');
        assert(item.countText.top >= item.count.top - 1 && item.countText.bottom <= item.count.bottom + 1, 'Count glyphs are clipped');
      }
      assert.equal(geometry[0].truncated, false, 'Short name is unnecessarily truncated');
      assert.equal(geometry[2].truncated, true, 'Long name must truncate');
      await page.locator('.wish-group-tile__title').nth(2).press('Enter');
      assert.equal(await page.getByLabel('Открытая группа').textContent(), geometry[2].text);
      if (!readonly) {
        await page.getByRole('button', { name: 'Опции группы «Зимние ботинки»' }).click();
        await page.getByRole('menuitem', { name: 'Переименовать' }).click();
        const input = page.getByRole('textbox', { name: 'Название группы' });
        assert.equal(await input.inputValue(), 'Зимние ботинки');
        await input.press('Escape');
        await page.getByRole('button', { name: 'Зимние ботинки', exact: true }).waitFor();
      }
      await page.evaluate(() => scrollTo({top:document.documentElement.scrollHeight,behavior:"instant"}));
      const last = await page.locator('.wish-group-tile').last().boundingBox();
      assert(last.y + last.height <= page.viewportSize().height + 1, 'Last metadata cannot be scrolled into view');
      await page.evaluate(() => scrollTo({top:0,behavior:"instant"}));
      await page.screenshot({ path: `/tmp/rollapp-wish-groups-${width}-${readonly ? 'readonly' : 'owner'}.png`, fullPage: true });
      assert.deepEqual(errors, []);
      console.log(`PASS ${width} ${readonly ? 'readonly' : 'owner'}: ellipsis, text bounds, count, keyboard, scroll${readonly ? '' : ', rename cancellation'}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
