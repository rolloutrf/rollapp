import { listenSmokeServer, smokePort, smokeOrigin } from "./smoke-server.mjs";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import assert from "node:assert/strict";
import { access, mkdir } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import sharp from "sharp";

const candidates = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);
let executablePath;
for (const candidate of candidates) { try { await access(candidate); executablePath = candidate; break; } catch {} }
assert(executablePath, "Install Chrome or set CHROME_PATH to run the required control geometry checks");
await mkdir("/tmp/rollapp-control-sizes", { recursive: true });
const server = await createServer({ cacheDir: "node_modules/.vite-control-sizes", server: { host: "127.0.0.1", port: smokePort(process.env.CONTROL_SIZE_PORT), strictPort: true, hmr: false, watch: null }, plugins: [{
  name: "control-size-fixture", enforce: "pre",
  transform(source, id) {
    if (id.endsWith("/src/App.jsx?controls-smoke")) return `${source}\nexport { GlobalAppChrome, PlanningFab, SessionContext, ToastContext, CollectionNavigationContext, WishGroupDialog };`;
    if (id.endsWith("/src/components/planning-space.jsx?controls-smoke")) return `${source}\nexport { TaskEditor };`;
    // Supply presentation state at the hook boundary. API requests are rejected
    // below; no database or API-response fixtures are substituted.
    if (id.endsWith("/src/hooks/use-planning-spaces.js")) return `export function usePlanningSpaces(kind) { return {spaces:[{id:'main',kind,title:kind==='calendar'?'Основной календарь с длинным названием':kind==='todo'?'Основной To Do-лист с длинным названием':'Рабочая доска с длинным названием'}],setSpaces(){},loading:false,error:'',reload(){}}; }`;
  },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (!req.url.startsWith("/app/")) return next();
    res.setHeader("Content-Type", "text/html");
    res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/control-sizes.jsx"></script></body></html>'));
  }); },
}] });
await listenSmokeServer(server);
const origin = smokeOrigin(server);
const browser = await chromium.launch({ ...browserLaunchOptions(), executablePath });
const routes = [
  "/app/wishes?tab=products", "/app/spheres/career?tab=about", "/app/spheres/identity?tab=principles",
  "/app/spheres/education?tab=courses", "/app/spheres/health?tab=medications", "/app/wishes?guest=1",
  ...["day", "week", "month", "year", "list"].map(view => `/app/planning?tab=calendar&view=${view}&date=2026-10-15`),
  "/app/planning?tab=todo&date=2026-10-15", "/app/planning?tab=kanban&space=work",
];
async function geometry(page, label) {
  const result = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('[data-control-bar] :is([class~="group/button"], [data-slot="select-trigger"], [data-slot="tabs-trigger"])')]
      .filter(element => element.getBoundingClientRect().width > 0).map(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { name: element.getAttribute("aria-label") || element.textContent.trim(), height: rect.height, width: rect.width, fontSize: style.fontSize, lineHeight: style.lineHeight, icon: element.hasAttribute("data-control-icon"), button: element.classList.contains("group/button"), radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius].map(parseFloat), glyphs: [...element.querySelectorAll("svg")].map(svg => { const glyph = svg.getBoundingClientRect(); return { width: glyph.width, height: glyph.height, offsetX: (glyph.left + glyph.right - rect.left - rect.right) / 2, offsetY: (glyph.top + glyph.bottom - rect.top - rect.bottom) / 2 }; }).filter(glyph => glyph.width > 0) };
      });
    return { controls, overflow: document.documentElement.scrollWidth > innerWidth + 1, tabs: [...document.querySelectorAll('[data-control-bar] [data-slot="tabs-list"]')].map(element => element.getBoundingClientRect().height) };
  });
  assert(!result.overflow, `${label}: document overflow`);
  assert(result.controls.length >= 3, `${label}: controls were not rendered`);
  for (const control of result.controls) {
    assert(Math.abs(control.height - 48) < 0.1, `${label}: ${control.name} is ${control.height}px high; expected 48px`);
    if (control.button) assert(control.radii.every(radius => radius >= control.height / 2), `${label}: ${control.name} must have pill/circular corners`);
    assert.equal(control.fontSize, "18px", `${label}: ${control.name} text must match other controls`);
    assert.equal(control.lineHeight, "28px", `${label}: ${control.name} text leading must match other controls`);
    if (control.icon) assert(Math.abs(control.width - 48) < 0.1, `${label}: ${control.name} is not a 48px circle`);
    for (const glyph of control.glyphs) {
      assert(Math.abs(glyph.width - 20) < 0.1 && Math.abs(glyph.height - 20) < 0.1, `${label}: ${control.name} icon differs from 20px: ${JSON.stringify(glyph)}`);
      if (control.icon) assert(Math.abs(glyph.offsetX) < 0.1 && Math.abs(glyph.offsetY) < 0.1, `${label}: ${control.name} icon is not centered`);
    }
  }
  assert(result.tabs.every(height => Math.abs(height - 48) < 0.1), `${label}: calendar tab rail differs from the controls`);
}
async function paintedHeight(button, label) {
  const box = await button.boundingBox();
  assert.equal(box.height, 48, `${label}: accent control box differs from 48px`);
  // Fixed navigation is already visible. Locator screenshots scroll it first,
  // which can fight a nested calendar scroller or smooth document scrolling.
  // Capture the visible box directly and still prove both stable DOM bounds
  // and painted outer pixels (including the DPR 3 mobile matrix).
  const viewport = button.page().viewportSize();
  assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 0.1 && box.y + box.height <= viewport.height + 0.1, `${label}: accent control leaves the viewport`);
  const pixels = await button.page().screenshot({ clip: box, animations: "disabled" });
  const after = await button.boundingBox();
  for (const key of ["x", "y", "width", "height"]) assert(Math.abs(after[key] - box[key]) < 0.1, `${label}: control moved during pixel capture`);
  const { data, info } = await sharp(pixels).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const x = Math.floor(info.width / 2);
  // Dark-theme accent buttons must paint all the way to both outer edges.
  // A transparent border with padding-box clipping gives a 48px DOM box but
  // only a 46px visible button (138 rather than 144 physical pixels at DPR 3).
  for (const y of [0, info.height - 1]) {
    const offset = (y * info.width + x) * info.channels;
    assert(data[offset] > 180 && data[offset + 1] > 180 && data[offset + 2] > 180,
      `${label}: accent paint stops inside its ${box.height}px box at pixel row ${y}/${info.height}; transparent border shrinks the visible control`);
  }
}
try {
  for (const width of (process.env.CONTROL_WIDTHS || "320,390,640,767,768,820,1024,1440,1920").split(",").map(Number)) {
    for (const height of width === 390 || width === 820 ? [844, 400] : [844]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: width === 390 ? 3 : 1 }), errors = [];
      // Cold Vite compilation may exceed 30s while other full matrices run.
      page.setDefaultNavigationTimeout(90_000);
      page.setDefaultTimeout(90_000);
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/**", route => { errors.push("Unexpected API request in control fixture"); return route.abort(); });
      for (const route of routes) {
        await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded" });
        await page.locator("[data-control-bar]").first().waitFor();
        await page.evaluate(() => document.fonts.ready);
        const label = `${width}x${height} ${route}`;
        await geometry(page, label);
        if (!route.includes("/planning")) {
          const pair = page.locator('[aria-label="Единый стиль кнопок"] button');
          const styles = await pair.evaluateAll(buttons => buttons.map(button => {
            const style = getComputedStyle(button);
            return { background: style.backgroundColor, border: style.borderTopColor, width: style.borderTopWidth, line: style.borderTopStyle };
          }));
          assert.equal(styles.length, 2, `${label}: menu/close pair missing`);
          assert.deepEqual(styles[0], styles[1], `${label}: menu and close must share filled outlined surfaces`);
          assert.equal(styles[0].width, "1px");
          assert.equal(styles[0].line, "solid");
          assert(![styles[0].border, styles[0].background].includes("rgba(0, 0, 0, 0)"), `${label}: neutral controls must have visible fill and border`);
        }
        if (route.includes("/planning")) {
          const selector = await page.locator(".planning-fab-space").boundingBox();
          assert(selector, `${label}: planning selector is missing`);
          assert(width < 768 ? selector.y > height / 2 : selector.y < 100,
            `${label}: planning selector must be at the top on desktop and at the bottom on mobile`);
          assert.equal(await page.locator(width < 768 ? ".planning-fab-controls .planning-fab-space" : ".global-app-chrome .planning-fab-space").count(), 1,
            `${label}: planning selector must belong to the desktop header or mobile navigation`);
        }
        if (route.includes("view=list")) {
          const event = page.locator('.schedule-agenda__task').first();
          assert((await event.innerText()).includes('Книга'), `${label}: calendar agenda hides the related item`);
          await event.click();
          await page.getByText('Вишлист · Книга', { exact: true }).waitFor();
          await page.keyboard.press('Escape');
        }
        if (!route.includes("/planning")) await paintedHeight(page.getByRole("button", { name: "Добавить", exact: true }), label);
        if (!route.includes("guest=1")) await paintedHeight(page.getByRole("button", { name: "Открыть планирование", exact: true }), `${label} lower circular control`);
        const scrolled = await page.evaluate(() => {
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
          const owners = [...document.querySelectorAll('.app-main,.daily-todo,.daily-todo__scroll,.planning-board,.schedule-month-panel,[data-slot="scroll-area-viewport"]')];
          for (const element of owners) element.scrollTo({ top: element.scrollHeight, behavior: "instant" });
          return window.scrollY > 0 || owners.some(element => element.scrollTop > 0);
        });
        if (!["view=month", "view=year", "view=list"].some((view) => route.includes(view))) assert(scrolled, `${label}: scrolling check did not move a scroll owner`);
        await geometry(page, `${label} scrolled`);
        if (route.includes("view=day") || route.includes("/career") || route.includes("tab=todo")) await page.screenshot({ path: `/tmp/rollapp-control-sizes/${width}x${height}-${route.includes("view=day") ? "calendar" : route.includes("tab=todo") ? "todo" : "application"}.png` });
        if (width < 768 && route.includes("view=day")) {
          await page.getByRole("button", { name: "Новая задача в календаре", exact: true }).click();
          const screen = page.locator("[data-mobile-form-page]:visible"); await screen.waitFor();
          const back = screen.getByRole("button", { name: "Назад", exact: true });
          assert.equal((await back.boundingBox()).height, 48, "Native form Back differs from navigation");
          await page.evaluate(() => { Object.defineProperty(visualViewport, "height", { configurable: true, value: 280 }); visualViewport.dispatchEvent(new Event("resize")); });
          await page.waitForFunction(() => document.documentElement.hasAttribute("data-overlay-keyboard"));
          const keyboardBack = await back.boundingBox();
          assert.equal(keyboardBack.height, 48); assert(keyboardBack.y + keyboardBack.height <= 280, "Back is below the keyboard");
          await page.evaluate(() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event("resize")); });
          await back.click(); await screen.waitFor({ state: "hidden" });
          await geometry(page, `${label} returned`);
        }
        console.log(`PASS ${label}: 48px controls and visible paint, 20px icons, 18/28px text, scrolling`);
      }
      for (const busy of [false, true]) {
        await page.goto(`${origin}/app/wishes?group-dialog${busy ? '&busy-group' : ''}`);
        const header = page.locator('.app-group-dialog__header'); await header.waitFor();
        const buttons = header.locator('[data-control-bar] button');
        const appearance = async () => buttons.evaluateAll(nodes => nodes.map(node => {
          const style = getComputedStyle(node);
          return { background: style.backgroundColor, border: style.borderTopColor, width: style.borderTopWidth, line: style.borderTopStyle, opacity: style.opacity };
        }));
        const settle = () => buttons.evaluateAll(async nodes => {
          await Promise.all(nodes.flatMap(node => node.getAnimations()).map(animation => animation.finished.catch(() => {})));
        });
        for (const dark of [true, false]) {
          await page.evaluate(value => document.documentElement.classList.toggle('dark', value), dark);
          await page.mouse.move(0, 0); await settle();
          await geometry(page, `${width}x${height} real wish group ${busy ? 'busy' : 'ready'} ${dark ? 'dark' : 'light'}`);
          const normal = await appearance(); assert.equal(normal.length, 2);
          assert.deepEqual(normal[0], normal[1], 'Real wish-group menu must match Close');
          assert.equal(normal[0].width, '1px'); assert.equal(normal[0].line, 'solid'); assert.equal(normal[0].opacity, '1');
          assert(![normal[0].background, normal[0].border].includes('rgba(0, 0, 0, 0)'), 'Real header controls need a visible surface and border');
          if (busy) { for (const button of await buttons.all()) assert(await button.isDisabled()); }
          else {
            await buttons.nth(0).hover(); await settle(); const menuHover = (await appearance())[0];
            await buttons.nth(1).hover(); await settle(); const closeHover = (await appearance())[1];
            assert.deepEqual(menuHover, closeHover, 'Real wish-group hover surfaces must match');
          }
          if ([390, 1440].includes(width) && !busy) {
            await page.mouse.move(0, 0); await settle();
            await page.screenshot({ path: `/tmp/rollapp-control-sizes/wish-group-${width}x${height}-${dark ? 'dark' : 'light'}.png` });
          }
        }
        if (!busy) {
          await buttons.nth(0).click(); await page.getByRole('menuitem', { name: 'Переименовать', exact: true }).waitFor();
          await page.keyboard.press('Escape'); await buttons.nth(1).click(); await header.waitFor({ state: 'hidden' });
        }
      }
      console.log(`PASS ${width}x${height}: real WishGroupDialog menu/Close share normal, hover and disabled surfaces in both themes; native menu and close`);
      assert.deepEqual(errors, []); await page.close();
    }
  }
} finally { await browser.close(); await server.close(); }
