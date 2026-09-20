import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { drawerCases } from './fixtures/drawer-cases.js';

const server = await createServer({
  server: { host: '127.0.0.1', port: 5187, strictPort: true, open: false, hmr: false, watch: null },
  plugins: [{name: 'drawer-smoke-fixture', enforce: 'pre',
    transform(code, id) {
      const name = new URLSearchParams(id.split('?')[1]).get('drawer-smoke-export');
      if (name && /^[A-Z][A-Za-z]+$/.test(name) && id.includes('/src/') && !code.includes(`export function ${name}`)) return code + `\nexport { ${name} };`;
    },
    configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith('/__drawer-smoke')) return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/drawer-smoke.jsx"></script></body></html>'));
    });
  }}],
});
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const errors = [];
async function keyboard(page, height, offsetTop = 0) {
  await page.evaluate(({height, offsetTop}) => {
    Object.defineProperties(window.visualViewport, {
      height: {configurable: true, get: () => height},
      offsetTop: {configurable: true, get: () => offsetTop},
    });
    window.visualViewport.dispatchEvent(new Event('resize'));
    window.visualViewport.dispatchEvent(new Event('scroll'));
  }, {height, offsetTop});
  await page.waitForTimeout(850);
}
async function swipe(page, from, to) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{x:from.x,y:from.y}]});
  for (let step=1; step<=12; step++) {
    await cdp.send('Input.dispatchTouchEvent', {type:'touchMove', touchPoints:[{x:from.x+(to.x-from.x)*step/12,y:from.y+(to.y-from.y)*step/12}]});
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]});
  await cdp.detach();
  await page.waitForTimeout(550);
}
async function boundsVisible(locator, top, bottom, label) {
  const box = await locator.boundingBox();
  if (box && box.y + box.height > bottom + 2) await locator.page().screenshot({path:'/tmp/rollapp-drawer-failure.png'});

  assert(box && box.height > 0 && box.y >= top - 2 && box.y + box.height <= bottom + 2, `${label}: ${JSON.stringify(box)} outside ${top}..${bottom}`);
}
try {
  for (const viewport of [{width:390,height:844}, {width:320,height:568}, {width:414,height:896}, {width:896,height:414}, {width:1440,height:900}].filter(v => !process.env.DRAWER_WIDTHS || process.env.DRAWER_WIDTHS.split(',').includes(String(v.width)))) {
    const context = await browser.newContext({ viewport, hasTouch: viewport.width < 1000, isMobile: viewport.width < 1000, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    await page.route('**/api/**', route => { errors.push('Unexpected API call in component test'); return route.abort(); });
    page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
    for (const mode of (process.env.DRAWER_MODES ?? 'form,scroll-area,wish,fullscreen').split(',').filter(Boolean)) {
      console.log(`CHECK ${viewport.width} ${mode}`);
      await page.goto('http://127.0.0.1:5187/__drawer-smoke');
      const opener = page.getByRole('button', {name:mode,exact:true});
      await opener.waitFor();
      if (mode === 'wish') {
        await page.evaluate(() => scrollTo(0,180));
        await opener.evaluate(el => el.click());
      } else await opener.click();
      const popup = page.locator(mode === 'fullscreen' ? '.app-fullscreen-dialog' : '[data-slot="drawer-popup"]').first();
      await popup.waitFor();
      await page.waitForTimeout(600);
      await boundsVisible(popup, 0, viewport.height, `${viewport.width} ${mode} initial`);
      const initial = await popup.boundingBox();
      const scrollBefore = await page.evaluate(() => scrollY);
      const height = Math.max(260, viewport.height - 340);
      for (const fieldName of ['Поле 1', 'Поле 12', 'Описание', 'Поле 2']) {
        const field = popup.getByRole('textbox', {name: fieldName, exact:true});
        await field.evaluate(el => el.focus({preventScroll:true}));
        await keyboard(page, height);
        await boundsVisible(popup, 0, height, `${viewport.width} ${mode} keyboard`);
        const footer = popup.locator(mode === 'wish' || mode === 'fullscreen' ? '.wish-editor-screen__footer' : '[data-slot="drawer-footer"]');
        const footerBox = await footer.boundingBox();
        await boundsVisible(footer, 0, height, `${viewport.width} ${mode} footer`);
        await boundsVisible(field, 0, footerBox.y, `${viewport.width} ${mode} ${fieldName}`);
        assert.equal(await page.evaluate(() => scrollY), scrollBefore, 'Background scrolled during keyboard focus');
      }
      // iOS can pan the visual viewport while keeping the layout viewport fixed.
      if (viewport.height > 600) {
        await keyboard(page, height, 40);
        await boundsVisible(popup, 40, height + 40, `${viewport.width} ${mode} panned`);
        if (mode === "fullscreen") await boundsVisible(popup.getByRole("button",{name:"Закрыть редактор"}),40,height+40,"Panned editor close button");
      }
      await keyboard(page, viewport.height);
      const restored = await popup.boundingBox();
      assert(Math.abs(restored.height - initial.height) < 3, `${viewport.width} ${mode}: height did not recover ${initial.height} -> ${restored.height}`);
      if (viewport.width === 390) {
        // Android/embedded browsers can resize the layout viewport itself.
        await popup.getByRole('textbox', {name:'Поле 12',exact:true}).evaluate(el => el.focus({preventScroll:true}));
        await page.setViewportSize({width:390,height:471});
        await keyboard(page,471);
        await boundsVisible(popup,0,471,`${mode} resized layout`);
        await boundsVisible(popup.getByRole('textbox',{name:'Поле 12',exact:true}),0,471,`${mode} resized layout focus`);
        await page.setViewportSize(viewport);
        await keyboard(page,viewport.height);
      }
      if (mode !== 'fullscreen' && viewport.width < 1000) {
        const beforeTouch = await page.evaluate(() => scrollY);
        const body = popup.locator('.app-drawer-body, [data-slot="scroll-area-viewport"], .wish-editor-screen__content').first();
        await body.evaluate(el => { el.scrollTop = 0; });
        const box = await body.boundingBox();
        await swipe(page, {x:box.x+box.width/2,y:box.y+box.height-20}, {x:box.x+box.width/2,y:box.y+20});
        assert(await popup.isVisible(), 'Scrolling the body dismissed the drawer');
        assert(await body.evaluate(el => el.scrollTop) > 0, 'Touch did not scroll the drawer body');
        assert.equal(await page.evaluate(() => scrollY),beforeTouch,'Touch moved the background');
      }
      if (mode !== 'fullscreen') {
        // Scrolling the body reaches its last action without moving the page.
        await popup.getByRole('button', {name:'Вложенная форма'}).click();
        await page.getByRole('textbox', {name:'Имя списка'}).waitFor();
        await page.keyboard.press('Escape');
        await page.getByRole('textbox', {name:'Имя списка'}).waitFor({state:'hidden'});
        assert(await popup.isVisible(), 'Escape closed parent along with nested drawer');
      }
      if (mode !== 'fullscreen' && viewport.width < 768) {
        const handle = await popup.locator('[data-slot="drawer-swipe-handle"]').boundingBox();
        await swipe(page, {x:handle.x+handle.width/2,y:handle.y+6}, {x:handle.x+handle.width/2,y:Math.min(viewport.height-10,handle.y+initial.height*.8)});
      } else await page.keyboard.press('Escape');
      await popup.waitFor({state:'hidden'});
      await page.waitForFunction(() => getComputedStyle(document.documentElement).overflow !== 'hidden');
      assert.equal(await page.evaluate(() => scrollY),scrollBefore,`${mode}: page position was not restored`);
      console.log(`PASS ${viewport.width}x${viewport.height} ${mode}: focus, viewport, scroll, footer, restore, dismiss`);
    }
    if (process.env.DRAWER_REAL_FORMS === '1' && [390,320,896].includes(viewport.width)) {
      for (const [name] of drawerCases.filter(([name]) => !process.env.DRAWER_CASES || process.env.DRAWER_CASES.split(",").includes(name))) {
        await page.goto(`http://127.0.0.1:5187/__drawer-smoke?form=${name}`);
        const popup = page.locator('[data-slot="drawer-popup"]');
        await popup.waitFor();
        await page.waitForTimeout(450);
        assert(!await page.evaluate(() => document.activeElement?.matches('input,textarea')), `${name}: mobile form autofocus opens the keyboard`);
        const original = await popup.boundingBox();
        const fields = popup.locator('input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]),textarea').filter({visible:true});
        const count = await fields.count();
        assert(count > 0, `${name}: no editable fields tested`);
        for (const index of [...new Set([0,count-1])]) {
          const field = fields.nth(index);
          await field.evaluate(el => el.focus({preventScroll:true}));
          const height = Math.max(300,viewport.height-340);
          await keyboard(page,height);
          await boundsVisible(popup,0,height,`${viewport.width} ${name} keyboard`);
          const footer = popup.locator('[data-slot="drawer-footer"]');
          const bottom = await footer.count() ? (await footer.boundingBox()).y : height;
          // Large textareas scroll internally; their first editable line must remain visible.
          const box = await field.boundingBox();
          assert(box.y >= -1 && box.y < bottom-20, `${viewport.width} ${name}: focused field is hidden ${JSON.stringify(box)} bottom ${bottom}`);
          if (await footer.count()) await boundsVisible(footer,0,height,`${name} footer`);
        }
        await keyboard(page,viewport.height);
        assert(Math.abs((await popup.boundingBox()).height-original.height)<3, `${name}: height did not recover`);
        await page.keyboard.press('Escape');
        await popup.waitFor({state:'hidden'});
        await page.waitForFunction(() => getComputedStyle(document.documentElement).overflow !== 'hidden');
        console.log(`PASS ${viewport.width} actual ${name}`);
      }
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
