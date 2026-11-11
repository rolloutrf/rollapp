import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin } from "./smoke-server.mjs";
import { APP_ORDERS_PATH, APP_STORE_PATH } from "../src/lib/app-routing.js";

const server = await createServer({
  cacheDir: "node_modules/.vite-orders-drawer-smoke",
  server: { host: "127.0.0.1", port: 0, strictPort: true, hmr: false, watch: null },
  plugins: [{
    name: "orders-drawer-fixture",
    enforce: "pre",
    transform(code, id) {
      if (id.endsWith("/src/api.js")) return code + "\nObject.assign(api, window.ordersDrawerFixture.api);";
    },
  }],
});

await listenSmokeServer(server);
const origin = smokeOrigin(server);
const screenshots = await mkdtemp(join(tmpdir(), "rollapp-orders-drawer-"));
let browser;
try {
  browser = await chromium.launch(browserLaunchOptions());
  for (const [width, height] of [[320, 568], [390, 844], [390, 400], [768, 900], [820, 900], [1024, 768], [1440, 900], [1920, 1080]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: width < 768, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => route.request().url().startsWith(origin + "/") ? route.continue() : route.abort());
    await page.route("**/api/**", (route) => {
      errors.push("The fixture must never call the API");
      return route.abort();
    });
    await page.addInitScript(() => {
      const fixture = window.ordersDrawerFixture = { mode: "loading", reads: 0, unexpected: [] };
      const pendingOrders = new Promise((resolve) => { fixture.resolveOrders = resolve; });
      fixture.api = {
        async get(path) {
          if (path === "/me") return { user: { id: "orders-smoke", username: "orders-smoke", name: "Покупатель" } };
          if (path === "/sphere-shares/incoming") return { shares: [] };
          if (path !== "/rolls/orders") {
            fixture.unexpected.push(path);
            throw new Error("Unexpected API fixture path");
          }
          fixture.reads++;
          if (fixture.mode === "loading") await pendingOrders;
          if (fixture.mode === "error") throw new Error("Не удалось загрузить список заказов");
          if (fixture.mode === "empty") return { orders: [] };
          return { orders: Array.from({ length: 8 }, (_, i) => ({
            id: `abcdef12-${i}`,
            status: i === 7 ? "refunded" : "active",
            productId: "cat:blue",
            productTitle: `Синий кот — Уставший (${i + 1})`,
            createdAt: "2026-09-24T12:00:00Z",
            amount: 1000,
            delivery: { point: { city: "1-е Туркменево", address: "улица Салавата Юлаева, 17", code: "YET1", workTime: "Вт–Пт 09:00–17:00" } },
          })) };
        },
        post(path) {
          fixture.unexpected.push(path);
          throw new Error("This scenario must never submit a return");
        },
      };
    });

    try {
      const store = `${origin}${APP_STORE_PATH}?from=smoke#store`;
      await page.goto(store);
      const trigger = page.getByRole("button", { name: "Заказы", exact: true });
      await trigger.scrollIntoViewIfNeeded();
      assert.deepEqual(await trigger.evaluate((el) => {
        const style = getComputedStyle(el);
        return [el.offsetHeight, style.paddingLeft, style.paddingRight];
      }), [48, "24px", "24px"]);
      assert.equal(await page.evaluate(() => window.ordersDrawerFixture.reads), 0);
      await page.locator(".cat-store-page").evaluate((element) => { element.dataset.smokeMounted = "true"; });
      const storeScroll = await page.evaluate(() => scrollY);

      await trigger.click();
      await page.waitForURL(origin + APP_ORDERS_PATH);
      const drawer = page.getByRole("dialog", { name: "Заказы", exact: true });
      const close = drawer.getByRole("button", { name: "Закрыть заказы" });
      await drawer.getByRole("status", { name: "Загрузка заказов" }).waitFor();
      await page.evaluate(() => {
        window.ordersDrawerFixture.mode = "populated";
        window.ordersDrawerFixture.resolveOrders();
      });
      const lastOrder = drawer.getByRole("heading", { name: "Синий кот — Уставший (8)" });
      await lastOrder.waitFor();
      assert.equal(await drawer.getAttribute("data-swipe-direction"), width < 768 ? "down" : "right");
      await page.waitForFunction(() => getComputedStyle(document.querySelector(".orders-drawer")).transform === "matrix(1, 0, 0, 1, 0, 0)");
      const box = await drawer.boundingBox();
      assert(box.x >= -1 && box.y >= -1 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1);
      assert.equal(Math.round(box.x + box.width), width);
      assert.equal(Math.round(box.y + box.height), height);
      assert.deepEqual(await close.evaluate((el) => {
        const style = getComputedStyle(el);
        const icon = el.querySelector("svg");
        return [el.offsetWidth, el.offsetHeight, icon.clientWidth, icon.clientHeight,
          style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius];
      }), [48, 48, 20, 20, "24px", "24px", "24px", "24px"]);
      assert.deepEqual(await drawer.evaluate((element) => {
        const body = element.querySelector(".orders-drawer__body");
        // The primitive deliberately draws a bleed area beyond the popup edge.
        const content = element.querySelector('[data-slot="drawer-content"]');
        return [document.documentElement, content, body, ...body.querySelectorAll("article, .orders-card__content, .orders-card__delivery, .orders-card__number")]
          .filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.dataset.slot || el.className);
      }), []);
      if ([320, 1440].includes(width) || height === 400) await page.screenshot({ path: join(screenshots, `${width}x${height}.png`) });

      const closeBefore = await close.boundingBox();
      await lastOrder.scrollIntoViewIfNeeded();
      assert.deepEqual(await close.boundingBox(), closeBefore);
      assert.equal(await page.evaluate(() => scrollY), storeScroll);
      const refund = drawer.getByRole("button", { name: "Вернуть товар", exact: true }).last();
      await refund.click();
      const confirmation = page.getByRole("alertdialog");
      await confirmation.getByRole("button", { name: "Оставить заказ" }).waitFor();
      await page.keyboard.press("Escape");
      await confirmation.waitFor({ state: "hidden" });
      assert(await drawer.isVisible());
      await page.waitForFunction(() => document.activeElement?.textContent.trim() === "Вернуть товар");

      await close.click();
      await page.waitForURL(store);
      await drawer.waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.activeElement?.textContent.trim() === "Заказы");
      assert.equal(await page.locator(".cat-store-page").getAttribute("data-smoke-mounted"), "true");
      assert.equal(await page.evaluate(() => scrollY), storeScroll);
      await page.goForward();
      await drawer.waitFor();
      await page.goBack();
      await drawer.waitFor({ state: "hidden" });
      assert.equal(page.url(), store);

      await page.goto(origin + APP_ORDERS_PATH);
      await drawer.getByRole("status", { name: "Загрузка заказов" }).waitFor();
      await page.evaluate(() => {
        window.ordersDrawerFixture.mode = "error";
        window.ordersDrawerFixture.resolveOrders();
      });
      const retry = drawer.getByRole("button", { name: "Попробовать снова" });
      await retry.waitFor();
      await page.evaluate(() => { window.ordersDrawerFixture.mode = "empty"; });
      await retry.click();
      await drawer.getByText("Заказов пока нет").waitFor();
      await drawer.getByRole("button", { name: "В магазин" }).click();
      await page.waitForURL(origin + APP_STORE_PATH);
      await drawer.waitFor({ state: "hidden" });

      assert.deepEqual(await page.evaluate(() => window.ordersDrawerFixture.unexpected), []);
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}×${height}`);
    } catch (error) {
      await page.screenshot({ path: join(screenshots, `failure-${width}x${height}.png`) });
      throw error;
    } finally {
      await page.close();
    }
  }
} finally {
  console.log(`Order drawer screenshots: ${screenshots}`);
  await browser?.close();
  await server.close();
}
