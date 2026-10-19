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
const server = await createServer({ cacheDir: "node_modules/.vite-control-sizes", server: { host: "127.0.0.1", port: 5192, strictPort: true, hmr: false, watch: null }, plugins: [{
  name: "control-size-fixture", enforce: "pre",
  transform(source, id) {
    if (id.endsWith("/src/App.jsx?controls-smoke")) return `${source}\nexport { GlobalAppChrome, PlanningFab, SessionContext, ToastContext, CollectionNavigationContext };`;
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
await server.listen();
const browser = await chromium.launch({ executablePath, headless: true, args: process.env.CI ? ["--no-sandbox"] : [] });
const routes = [
  "/app/wishes?tab=products", "/app/spheres/career?tab=about", "/app/spheres/identity?tab=principles",
  "/app/spheres/education?tab=courses", "/app/spheres/health?tab=medications", "/app/wishes?guest=1",
  ...["day", "week", "month", "year"].map(view => `/app/planning?tab=calendar&view=${view}&date=2026-10-15`),
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
  const { data, info } = await sharp(await button.screenshot({ animations: "disabled" })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
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
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/**", route => { errors.push("Unexpected API request in control fixture"); return route.abort(); });
      for (const route of routes) {
        await page.goto(`http://127.0.0.1:5192${route}`);
        await page.locator("[data-control-bar]").first().waitFor();
        await page.evaluate(() => document.fonts.ready);
        const label = `${width}x${height} ${route}`;
        await geometry(page, label);
        if (route.includes("/planning")) {
          const selector = await page.locator(".planning-fab-space").boundingBox();
          assert(selector, `${label}: planning selector is missing`);
          assert(width < 768 ? selector.y > height / 2 : selector.y < 100,
            `${label}: planning selector must be at the top on desktop and at the bottom on mobile`);
          assert.equal(await page.locator(width < 768 ? ".planning-fab-controls .planning-fab-space" : ".global-app-chrome .planning-fab-space").count(), 1,
            `${label}: planning selector must belong to the desktop header or mobile navigation`);
        }
        if (!route.includes("/planning")) await paintedHeight(page.getByRole("button", { name: "Добавить", exact: true }), label);
        if (!route.includes("guest=1")) await paintedHeight(page.getByRole("button", { name: "Открыть планирование", exact: true }), `${label} lower circular control`);
        const scrolled = await page.evaluate(() => {
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
          const owners = [...document.querySelectorAll('.app-main,.daily-todo,.daily-todo__scroll,.planning-board,.schedule-month-panel,[data-slot="scroll-area-viewport"]')];
          for (const element of owners) element.scrollTo({ top: element.scrollHeight, behavior: "instant" });
          return window.scrollY > 0 || owners.some(element => element.scrollTop > 0);
        });
        if (!route.includes("view=month") && !route.includes("view=year")) assert(scrolled, `${label}: scrolling check did not move a scroll owner`);
        await geometry(page, `${label} scrolled`);
        if (route.includes("view=day") || route.includes("/career") || route.includes("tab=todo")) await page.screenshot({ path: `/tmp/rollapp-control-sizes/${width}x${height}-${route.includes("view=day") ? "calendar" : route.includes("tab=todo") ? "todo" : "application"}.png` });
        if (width < 768 && route.includes("view=day")) {
          await page.getByRole("button", { name: "Новое событие", exact: true }).click();
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
      assert.deepEqual(errors, []); await page.close();
    }
  }
} finally { await browser.close(); await server.close(); }
