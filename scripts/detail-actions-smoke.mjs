import { listenSmokeServer, smokePort, smokeOrigin } from "./smoke-server.mjs";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "playwright-core";

let executablePath;
for (const candidate of [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean)) {
  try { await access(candidate); executablePath = candidate; break; } catch {}
}
assert(executablePath, "Install Chrome or set CHROME_PATH");
const server = await createServer({ cacheDir: "node_modules/.vite-detail-actions", server: { host: "127.0.0.1", port: smokePort(process.env.DETAIL_ACTION_PORT), strictPort: true, hmr: false, watch: null }, plugins: [{
  name: "detail-actions-fixture", enforce: "pre",
  transform(source, id) { if (id.endsWith("/src/App.jsx?detail-actions-smoke")) return `${source}\nexport { CatalogWishDetailsContent, CatalogWishDetailsDrawer, SharedWishes, WishDetailsModal, SessionContext, ToastContext };`; },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (!req.url.startsWith("/__detail-actions")) return next();
    res.setHeader("Content-Type", "text/html");
    res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/detail-actions.jsx"></script></body></html>'));
  }); },
}] });
await listenSmokeServer(server);
const origin = smokeOrigin(server);
const browser = await chromium.launch({ ...browserLaunchOptions(), executablePath });
const variants = ["kind=product", "kind=owner", "kind=owner&fulfilled=1", "kind=guest", "kind=guest&reserved=1", "kind=guest&reserved=1&mine=1", "kind=shared", "kind=catalog", "kind=catalog&added=1", "kind=catalog&pending=1"];
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
  assert.notEqual(row[1].background, row[0].background, "Main action must be visually distinct from Back");
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
        const shared = variant === "kind=shared";
        await page.goto(`${origin}/__detail-actions?${variant}${shared ? "&board" : ""}`);
        const opener = shared
          ? page.getByRole("region", { name: "Совместные со мной" }).getByRole("button", { name: /^Открыть желание/ })
          : page.getByRole("link", { name: "Открыть карточку" });
        if (shared) {
          await page.getByText("Автор желания", { exact: true }).waitFor();
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Shared wish board overflow");
          await page.screenshot({ path: `/tmp/rollapp-shared-wish-board-${width}-${height}.png` });
        }
        await opener.click();
        await page.locator('[data-slot="wish-actions"]').waitFor();
        await page.evaluate(() => document.fonts.ready);
        const catalog = variant.includes("catalog");
        const marketplaceSearch = variant === "kind=product";
        if (marketplaceSearch) {
          const search = page.getByRole("button", { name: "Найти лучшие", exact: true });
          const colors = await search.evaluate(button => {
            const sample = document.createElement("span");
            sample.style.backgroundColor = "var(--secondary)";
            button.parentElement.append(sample);
            const colors = [getComputedStyle(button).backgroundColor, getComputedStyle(sample).backgroundColor];
            sample.remove();
            return colors;
          });
          assert.equal(colors[0], colors[1], "Marketplace search must use the secondary surface");
        }
        if (shared) {
          await page.getByText("Совместное желание · Автор желания").waitFor();
          const leave = page.getByRole("button", { name: "Убрать с доски" });
          assert.equal((await leave.boundingBox()).height, 48);
          assert.equal(await page.getByRole("button", { name: /Забронировать|Опции желания|Исполнить/ }).count(), 0);
          await page.screenshot({ path: `/tmp/rollapp-shared-wish-${width}-${height}.png` });
        } else if (!catalog) {
          const radii = await page.locator('[data-slot="wish-actions"] button[class~="group/button"]').evaluateAll(buttons => buttons.map(button => {
            const style = getComputedStyle(button);
            return [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].map(parseFloat);
          }));
          assert(radii.length >= 2, "Wish primary and overflow actions missing");
          assert(radii.every(corners => corners.every(radius => radius === 24)), "Wish actions must retain the shared pill/circle corners on desktop and mobile");
        }
        if (width < 768) {
          const before = await mobileGeometry(page, catalog || shared ? 2 : 3);
          await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
          assert(await page.evaluate(() => scrollY > 0), "The scroll check did not move the document");
          const after = await mobileGeometry(page, catalog || shared ? 2 : 3);
          assert.equal(after[0].y, before[0].y, "Footer moved with document scroll");
          const body = await page.locator('.app-drawer-body').boundingBox();
          assert(body.y + body.height <= after[0].y + 1, "Final content cannot scroll above footer");
          if (!catalog && !shared) {
            await page.getByRole("button", { name: /^Опции желания/ }).click();
            await page.getByRole("menuitem", { name: variant.includes("guest") ? /Лайкнуть и добавить к себе/ : variant.includes("fulfilled") ? /Не исполнено/ : /^Исполнено$/ }).waitFor();
            await page.keyboard.press("Escape");
            await page.getByRole("menu").waitFor({ state: "hidden" });
            await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label")?.startsWith("Опции желания"));
            assert(await page.getByRole("button", { name: /^Опции желания/ }).evaluate(element => document.activeElement === element), "Menu did not return focus to overflow");
          }
          if (marketplaceSearch) {
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
        await opener.waitFor();
        console.log(`PASS ${width}x${height} ${variant}: detail actions, scroll, Back`);
      }
      if (width >= 768) {
        for (const kind of ["catalog", "owner", "guest"]) {
          await page.goto(`${origin}/__detail-actions?kind=${kind}&drawer=1`);
          await page.getByRole("link", { name: "Открыть карточку" }).click();
          const drawer = page.locator('[data-slot="drawer-popup"]');
          const footer = drawer.locator('.app-form-actions[data-slot="wish-actions"]');
          const body = drawer.locator(".app-drawer-body");
          await footer.waitFor();
          await page.waitForFunction(() => document.querySelector('[data-slot="drawer-popup"]')?.getAnimations().every(animation => animation.playState !== "running"));
          const before = await footer.boundingBox();
          assert(await body.evaluate(element => { element.scrollTop = element.scrollHeight; return element.scrollTop > 0; }));
          assert.deepEqual(await footer.boundingBox(), before, "Drawer actions moved with the content");
          const bodyBox = await body.boundingBox();
          assert(bodyBox.y + bodyBox.height <= before.y + 1, "Drawer footer overlaps the content");
          assert(before.y + before.height <= height + 1, "Drawer footer is outside the visible viewport");
          if (kind === "owner") {
            const primary = await footer.getByRole("button", { name: "Отметить исполненным" }).boundingBox();
            const trash = footer.getByRole("button", { name: "Удалить желание" });
            const deleteBox = await trash.boundingBox();
            assert.equal(deleteBox.width, 48);
            assert.equal(deleteBox.height, 48);
            assert.equal(deleteBox.y, primary.y);
            assert.equal(deleteBox.x - primary.x - primary.width, 8);
            await trash.click();
            await page.getByRole("alertdialog").getByRole("button", { name: "Отмена" }).click();
          }
        }
        console.log(`PASS ${width}x${height}: desktop drawer footers, independent scroll and compact delete`);
      }
      await page.goto(`${origin}/__detail-actions?kind=product&marketplaceSearch=1${width >= 768 ? "&drawer=1" : ""}`);
      await page.getByRole("link", { name: "Открыть карточку" }).click();
      const section = page.getByRole("region", { name: "Предложения" });
      const savedOffer = section.getByRole("listitem", { name: "Открыть предложение на Ozon" });
      await savedOffer.waitFor();
      assert.equal(await savedOffer.getAttribute("href"), "https://ozon.ru/product/123/");
      assert.equal(await savedOffer.getByText("Сохранённая карточка", { exact: true }).count(), 0);
      await page.getByRole("button", { name: "Найти лучшие", exact: true }).click();
      const offer = section.getByRole("listitem", { name: "Открыть предложение на Яндекс Маркет" });
      await offer.waitFor();
      assert.equal(await offer.getAttribute("href"), "https://market.yandex.ru/card/ulanzi-l024/123");
      assert(await section.getByText("Осветитель Ulanzi L024 40W RGB", { exact: true }).isVisible());
      const geometry = await offer.evaluate(element => {
        const box = element.getBoundingClientRect();
        const boundary = element.closest(".app-drawer-body")?.getBoundingClientRect();
        const footer = document.querySelector(".mobile-content-page__nav")?.getBoundingClientRect();
        return {
          offerTop: box.top, offerBottom: box.bottom, bodyTop: boundary?.top, bodyBottom: boundary?.bottom, footerTop: footer?.top, scrollY,
          visible: box.y >= Math.max(0, boundary?.top || 0) && box.bottom <= Math.min(innerHeight, boundary?.bottom || innerHeight, footer?.top || innerHeight),
          overflow: document.documentElement.scrollWidth > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1,
        };
      });
      assert(geometry.visible && !geometry.overflow, `The search result is visible after the click: ${JSON.stringify(geometry)}`);
      if (width === 390 || width === 1440) await page.screenshot({ path: `/tmp/rollapp-marketplace-results-${width}x${height}.png` });
      await page.evaluate(() => window.finishMarketplaceSearch());
      await section.getByText("Предложения обновлены", { exact: true }).waitFor();
      assert.equal(await savedOffer.count(), 1);
      assert.equal(await section.getByText("Исходная ссылка", { exact: true }).count(), 0);
      assert(await offer.getByText("Лучшее", { exact: true }).isVisible());
      await page.evaluate(() => window.finishMarketplaceRead());
      await page.getByRole("button", { name: "Обновить", exact: true }).click();
      await section.getByText("Показываем найденные предложения. Поиск продолжается…").waitFor();
      await page.evaluate(() => window.finishMarketplaceSearch(true));
      await section.getByText("Новые карточки товара не найдены", { exact: true }).waitFor();
      assert.equal(await offer.count(), 1, "An unsuccessful retry preserves the last usable result");
      console.log(`PASS ${width}x${height}: marketplace streaming, visible result, delayed read and retry`);
      assert.deepEqual(errors, []); await page.close();
    }
  }
} finally { await browser.close(); await server.close(); }
