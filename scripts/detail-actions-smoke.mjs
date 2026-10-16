import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "playwright-core";

let executablePath;
for (const candidate of [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean)) {
  try { await access(candidate); executablePath = candidate; break; } catch {}
}
assert(executablePath, "Install Chrome or set CHROME_PATH");
const server = await createServer({ cacheDir: "node_modules/.vite-detail-actions", server: { host: "127.0.0.1", port: 5193, strictPort: true, hmr: false, watch: null }, plugins: [{
  name: "detail-actions-fixture", enforce: "pre",
  transform(source, id) { if (id.endsWith("/src/App.jsx?detail-actions-smoke")) return `${source}\nexport { CatalogWishDetailsContent, WishDetailsModal, SessionContext, ToastContext };`; },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (!req.url.startsWith("/__detail-actions")) return next();
    res.setHeader("Content-Type", "text/html");
    res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/detail-actions.jsx"></script></body></html>'));
  }); },
}] });
await server.listen();
const browser = await chromium.launch({ executablePath, headless: true, args: process.env.CI ? ["--no-sandbox"] : [] });
const variants = ["kind=product", "kind=owner", "kind=owner&fulfilled=1", "kind=guest", "kind=guest&reserved=1", "kind=guest&reserved=1&mine=1", "kind=catalog", "kind=catalog&added=1", "kind=catalog&pending=1"];
async function mobileGeometry(page, count) {
  const nav = page.getByRole("navigation", { name: "Навигация страницы" });
  const row = await nav.locator('button[class~="group/button"]').evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect(), style = getComputedStyle(element);
    return { name: element.ariaLabel || element.textContent.trim(), x: box.x, y: box.y, width: box.width, height: box.height, clipped: element.scrollWidth > element.clientWidth + 1, disabled: element.disabled, font: style.fontSize, background: style.backgroundColor, hit: element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) };
  }));
  assert.equal(row.length, count, `Expected Back, primary${count === 3 ? ", overflow" : ""}; got ${JSON.stringify(row)}`);
  for (const [index, control] of row.entries()) {
    assert.equal(control.height, 48, `${control.name}: height`);
    assert.equal(control.font, "18px");
    assert(!control.clipped, `${control.name}: clipped text`);
    assert(control.hit || control.disabled, `${control.name}: covered`);
    assert(Math.abs(control.y - row[0].y) < 0.1, "Controls must share one line");
    if (index > 0) assert(Math.abs(control.x - row[index - 1].x - row[index - 1].width - 8) < 0.1, "Controls must have 8px gaps");
    if (index === 0 || index === 2) assert.equal(control.width, 48, "Icon control must be a 48px circle");
  }
  assert.notEqual(row[1].background, row[0].background, "Primary action lost its accent");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Document overflow");
  assert(await page.evaluate(() => getComputedStyle(document.documentElement).overflow !== "hidden"), "Document scroll locked");
  return row;
}
try {
  for (const width of (process.env.DETAIL_WIDTHS || "320,390,768,820,1024,1440,1920").split(",").map(Number)) {
    for (const height of width === 390 ? [844, 400] : [844]) {
      const page = await browser.newPage({ viewport: { width, height } }), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      // Owner marketplace metadata is a read effect. Abort it, with no replacement
      // response/database; any mutation from this layout check is a test failure.
      await page.route("**/api/**", route => { if (route.request().method() !== "GET") errors.push("Unexpected API mutation"); return route.abort(); });
      for (const variant of variants) {
        await page.goto(`http://127.0.0.1:5193/__detail-actions?${variant}`);
        await page.getByRole("link", { name: "Открыть карточку" }).click();
        await page.locator('[data-slot="wish-actions"]').waitFor();
        await page.evaluate(() => document.fonts.ready);
        const catalog = variant.includes("catalog");
        if (width < 768) {
          const before = await mobileGeometry(page, catalog ? 2 : 3);
          await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
          assert(await page.evaluate(() => scrollY > 0), "The scroll check did not move the document");
          const after = await mobileGeometry(page, catalog ? 2 : 3);
          assert.equal(after[0].y, before[0].y, "Footer moved with document scroll");
          const body = await page.locator('.app-drawer-body').boundingBox();
          assert(body.y + body.height <= after[0].y + 1, "Final content cannot scroll above footer");
          if (!catalog) {
            await page.getByRole("button", { name: /^Опции желания/ }).click();
            await page.getByRole("menuitem", { name: variant.includes("guest") ? /Лайкнуть и добавить к себе/ : variant.includes("fulfilled") ? /Не исполнено/ : /^Исполнено$/ }).waitFor();
            await page.keyboard.press("Escape");
            await page.getByRole("menu").waitFor({ state: "hidden" });
            await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label")?.startsWith("Опции желания"));
            assert(await page.getByRole("button", { name: /^Опции желания/ }).evaluate(element => document.activeElement === element), "Menu did not return focus to overflow");
          }
          if (variant === "kind=product") {
            assert.equal(await page.getByRole("button", { name: /Отметить исполненным/ }).count(), 0, "Duplicate primary action remains outside overflow");
            await page.evaluate(() => { Object.defineProperty(visualViewport, "height", { configurable: true, value: 280 }); visualViewport.dispatchEvent(new Event("resize")); });
            await page.waitForFunction(() => document.documentElement.hasAttribute("data-overlay-keyboard"));
            const keyboard = await mobileGeometry(page, 3);
            assert(keyboard[0].y + 48 <= 280, "Footer is below keyboard");
            await page.evaluate(() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event("resize")); });
          }
        } else {
          assert.equal(await page.locator('.mobile-content-page__nav [data-slot="wish-actions"]').count(), 0, "Desktop actions moved into mobile footer");
          assert.equal(await page.locator('.app-drawer-body [data-slot="wish-actions"]').count(), 1);
        }
        await page.getByRole("button", { name: catalog ? "Назад: Каталог" : "Назад: Желание" }).click();
        await page.getByRole("link", { name: "Открыть карточку" }).waitFor();
        console.log(`PASS ${width}x${height} ${variant}: detail actions, scroll, Back`);
      }
      assert.deepEqual(errors, []); await page.close();
    }
  }
} finally { await browser.close(); await server.close(); }
