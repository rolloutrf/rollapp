import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium, webkit } from 'playwright-core';
import { browserLaunchOptions } from './browser-runtime.mjs';
import { listenSmokeServer, smokeOrigin } from './smoke-server.mjs';

const server = await createServer({
  cacheDir: 'node_modules/.vite-native-time-smoke',
  server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false, watch: null },
  plugins: [{ name: 'native-time-fixture', configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith('/__native-time')) return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/native-time-inputs.jsx"></script></body></html>'));
    });
  } }],
});
await listenSmokeServer(server);
try {
  for (const [name, engine] of [['webkit', webkit], ['chromium', chromium]]) {
    const browser = await engine.launch(name === 'chromium' ? browserLaunchOptions() : { headless: true });
    try {
      for (const [width, height] of [[320,844],[390,844],[768,844],[820,844],[1024,844],[1440,844],[1920,1080],[390,400]]) {
        const page = await browser.newPage({ viewport: { width, height }, isMobile: width < 768, hasTouch: width < 768, deviceScaleFactor: width < 768 ? 3 : 1 });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/api/**', route => { errors.push('Unexpected API request'); return route.abort(); });
        await page.goto(`${smokeOrigin(server)}/__native-time`);
        const inputs = page.locator('input[type=time]');
        await inputs.last().waitFor();
        await page.evaluate(() => document.fonts.ready);
        const geometry = await inputs.evaluateAll(elements => elements.map(input => {
          const box = input.getBoundingClientRect(), field = input.closest('[data-slot=field]').getBoundingClientRect();
          const style = getComputedStyle(input);
          return { id: input.id, x: box.x, right: box.right, width: box.width, fieldRight: field.right, fieldX: field.x, height: box.height, value: input.value, appearance: style.appearance, boxSizing: style.boxSizing };
        }));
        await page.screenshot({ path: `/tmp/rollapp-native-time-${name}-${width}x${height}.png`, fullPage: true });
        for (const box of geometry) {
          // macOS WebKit cannot run iOS RenderTheme. Enforce the opt-out from
          // its forced content-box/min-width adjustment as well as real bounds.
          assert.equal(box.appearance, 'none', `${name}: iOS RenderTheme can override time field sizing`);
          assert.equal(box.boxSizing, 'border-box');
          assert(box.x >= 16 && box.right <= width - 16 + 1, `${name} ${width} ${box.id}: field outside page rail ${JSON.stringify(box)}`);
          assert(Math.abs(box.x-box.fieldX) < 1 && Math.abs(box.right-box.fieldRight) < 1, `${name} ${width}: input differs from its Field`);
          assert.equal(box.height,48);
        }
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} ${width}: document overflow`);
        await inputs.first().fill('22:15');
        assert.equal(await inputs.first().inputValue(), '22:15');
        assert.equal(await inputs.nth(1).inputValue(), '07:00');
        assert.deepEqual(errors, []);
        console.log(`PASS ${name} ${width}x${height}`);
        await page.close();
      }
    } finally { await browser.close(); }
  }
} finally { await server.close(); }
