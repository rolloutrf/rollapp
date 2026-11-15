import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin } from "./smoke-server.mjs";
import { APP_ORDERS_PATH, APP_STORE_PATH } from "../src/modules/shell/app-routing.js";
import { localizedPageUrl } from "../shared/modules/shell/page-urls.js";

const server = await createServer({
  cacheDir: "node_modules/.vite-orders-drawer-smoke",
  server: { host: "127.0.0.1", port: 0, strictPort: true, hmr: false, watch: null },
  plugins: [{
    name: "orders-drawer-fixture",
    enforce: "pre",
    transform(code, id) {
      if (id.endsWith("/src/modules/runtime/api.js")) return code + "\nObject.assign(api, window.ordersDrawerFixture.api);";
    },
  }],
});

await listenSmokeServer(server);
const origin = smokeOrigin(server);
const ordersUrl = origin + localizedPageUrl(APP_ORDERS_PATH);
const storeUrl = origin + localizedPageUrl(APP_STORE_PATH);
const marketplaceUrl = origin + localizedPageUrl("/app/spheres/career/business/store");
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
      const fixture = window.ordersDrawerFixture = { mode: "loading", reads: 0, unexpected: [], submittedActions: [] };
      const user = { id: "orders-smoke", username: "orders-smoke", name: "Покупатель", accountType: "personal", canDiscoverSpheres: true };
      const fulfilled = {
        id: "650bc77a-2829-449f-86af-51d4439bd080", productTitle: "Получение консультации", amount: 50,
        createdAt: "2026-11-12T10:00:00Z", status: "fulfilled",
        settlement: { role: "buyer", participant: "Студия", source: "gift", reviewUntil: "2026-11-19T10:00:00Z",
          actions: ["accept", "dispute"], events: [{ action: "fulfill", note: "Встреча состоялась", createdAt: "2026-11-12T10:00:00Z" }] },
      };
      const reserved = {
        id: "793550f5-1e76-4d40-b272-772f39c96717", productTitle: "Встреча с заказчиком", amount: 70,
        createdAt: "2026-11-12T09:00:00Z", status: "reserved",
        settlement: { role: "seller", participant: "Мария", source: "wallet", reviewUntil: null, actions: ["fulfill", "refund"], events: [] },
      };
      const item = { id: "protected-offer", sphere: "career", title: "Консультация студии", priceRolls: 50, itemType: "service",
        business: { id: "seller", name: "Студия", username: "studio" } };
      const pendingOrders = new Promise((resolve) => { fixture.resolveOrders = resolve; });
      fixture.api = {
        async get(path) {
          if (path === "/me") return { user };
          if (path === "/sphere-shares/incoming") return { shares: [] };
          if (path.startsWith("/sphere-shares/context?")) return { isOwner: true, owner: user, people: [], requests: [] };
          if (path === "/business-marketplace/career/store") return { items: [item], protectedCheckout: true };
          if (path === "/rolls/gift-cards") return { cards: [{ id: "test-card", balance: 80, business: { id: "seller" } }] };
          if (path.startsWith("/rolls/receipts/order/")) {
            const id = path.split("/").at(-1);
            const order = [fulfilled, reserved].find(item => item.id === id);
            if (order) return { receipt: { id, kind: "order", role: order.settlement.role, amount: String(order.amount),
              createdAt: order.createdAt, status: order.status, source: order.settlement.role === "buyer" ? order.settlement.source : null,
              subject: order.productTitle, participant: { name: order.settlement.participant } } };
            if (id === "abcdef12-7") return { receipt: { id, kind: "order", role: "buyer", amount: "1000",
              createdAt: "2026-09-24T12:00:00Z", closedAt: "2026-09-25T12:00:00Z", status: "refunded", source: "gift",
              subject: "Синий кот — Уставший (8)" } };
          }
          if (path !== "/rolls/orders") {
            fixture.unexpected.push(path);
            throw new Error("Unexpected API fixture path");
          }
          fixture.reads++;
          if (fixture.mode === "loading") await pendingOrders;
          if (fixture.mode === "error") throw new Error("Не удалось загрузить список заказов");
          if (fixture.mode === "empty") return { orders: [] };
          if (fixture.mode === "protected") return { orders: structuredClone([fulfilled, reserved]) };
          return { orders: Array.from({ length: 8 }, (_, i) => ({
            id: `abcdef12-${i}`,
            status: i === 7 ? "refunded" : "active",
            productId: "cat:blue",
            productTitle: `Синий кот — Уставший (${i + 1})`,
            createdAt: "2026-09-24T12:00:00Z",
            amount: 1000,
            delivery: { ...(i === 7 && { giftCardId: "private-card-fixture" }), point: { city: "1-е Туркменево", address: "улица Салавата Юлаева, 17", code: "YET1", workTime: "Вт–Пт 09:00–17:00" } },
          })) };
        },
        post(path, input) {
          if (path === "/business-marketplace/career/purchases") {
            const attempts = JSON.parse(sessionStorage.getItem("marketplace-browser-attempts") || "[]");
            attempts.push(input);
            sessionStorage.setItem("marketplace-browser-attempts", JSON.stringify(attempts));
            if (attempts.length === 1) throw new Error("Lost response");
            return { purchase: { id: fulfilled.id, protected: true, replayed: true } };
          }
          if (path === `/rolls/orders/${fulfilled.id}/actions` && input.action === "dispute") {
            fixture.submittedActions.push(input);
            fulfilled.status = "disputed";
            fulfilled.settlement.actions = ["accept"];
            if (!fulfilled.settlement.events.some((event) => event.action === "dispute")) {
              fulfilled.settlement.events.push({ action: input.action, note: input.note, createdAt: "2026-11-13T10:00:00Z" });
              throw new Error("Ответ не получен");
            }
            return { order: { id: fulfilled.id, status: fulfilled.status, replayed: true } };
          }
          if (path === `/rolls/orders/${reserved.id}/actions` && input.action === "fulfill") {
            fixture.submittedActions.push(input);
            reserved.status = "fulfilled";
            reserved.settlement.reviewUntil = "2026-11-19T10:00:00Z";
            reserved.settlement.actions = ["refund"];
            reserved.settlement.events = [{ action: input.action, note: input.note, createdAt: "2026-11-12T10:00:00Z" }];
            return { order: { id: reserved.id, status: reserved.status } };
          }
          fixture.unexpected.push(path);
          throw new Error("Unexpected action in orders fixture");
        },
      };
    });

    try {
      const store = `${storeUrl}?from=smoke#store`;
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
      await page.waitForURL(ordersUrl);
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
      const heading = drawer.getByRole("heading", { name: "Заказы", exact: true });
      assert.deepEqual(await heading.evaluate((node) => {
        const title = getComputedStyle(node);
        const header = getComputedStyle(node.parentElement);
        return [title.fontSize, title.fontWeight, header.paddingInlineStart, header.borderBottomWidth, header.backgroundColor];
      }), ["24px", "600", "16px", "1px", "rgba(0, 0, 0, 0)"]);
      assert((await heading.boundingBox()).x < (await close.boundingBox()).x);
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
      const returnedOrder = drawer.locator('[data-order-status="refunded"]');
      await returnedOrder.getByText("возвращены на подарочную карту").waitFor();
      await returnedOrder.getByRole("button", { name: "Квитанция", exact: true }).click();
      const returnReceipt = returnedOrder.getByRole("region", { name: "Квитанция Rollapp" });
      await returnReceipt.getByText("Роллы возвращены").waitFor();
      await returnReceipt.getByText("Дата расчёта · Москва").waitFor();
      await returnReceipt.getByText("Подарочная карта", { exact: true }).waitFor();
      assert(!(await returnReceipt.innerText()).includes("Салавата Юлаева"));
      assert(!(await returnReceipt.innerText()).includes("private-card-fixture"));
      await returnedOrder.getByRole("button", { name: "Скрыть квитанцию" }).click();
      await returnReceipt.waitFor({ state: "hidden" });
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

      await page.goto(ordersUrl);
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
      await page.waitForURL(storeUrl);
      await drawer.waitFor({ state: "hidden" });

      await page.evaluate(() => { window.ordersDrawerFixture.mode = "protected"; });
      await trigger.click();
      await page.waitForURL(ordersUrl);
      const buyerOrder = drawer.locator('[data-order-role="buyer"]');
      const sellerOrder = drawer.locator('[data-order-role="seller"]');
      await buyerOrder.getByText("На проверке", { exact: true }).waitFor();
      await buyerOrder.getByText("Подарочная карта", { exact: false }).waitFor();
      await buyerOrder.getByRole("button", { name: "История заказа" }).click();
      await buyerOrder.getByText("Встреча состоялась").waitFor();
      await buyerOrder.getByRole("button", { name: "Квитанция", exact: true }).click();
      const buyerReceipt = buyerOrder.getByRole("region", { name: "Квитанция Rollapp" });
      await buyerReceipt.getByText("На проверке").waitFor();
      assert.equal((await buyerReceipt.getByRole("button", { name: "Скачать квитанцию" }).boundingBox()).height, 48);
      assert(!(await buyerReceipt.innerText()).includes("Встреча состоялась"));
      await sellerOrder.getByRole("button", { name: "Квитанция", exact: true }).click();
      const sellerReceipt = sellerOrder.getByRole("region", { name: "Квитанция Rollapp" });
      await sellerReceipt.getByText("Покупатель", { exact: true }).waitFor();
      assert(!(await sellerReceipt.innerText()).includes("Источник оплаты"));
      await sellerOrder.getByRole("button", { name: "Скрыть квитанцию" }).click();
      await buyerOrder.getByRole("button", { name: "Открыть спор" }).click();
      await confirmation.getByLabel("Причина спора").fill("Черновик");
      await page.keyboard.press("Escape");
      await confirmation.waitFor({ state: "hidden" });
      assert.equal(await page.evaluate(() => window.ordersDrawerFixture.submittedActions.length), 0);
      await buyerOrder.getByRole("button", { name: "Открыть спор" }).click();
      const dispute = confirmation.getByRole("button", { name: "Открыть спор", exact: true });
      assert(await dispute.isDisabled());
      await confirmation.getByLabel("Причина спора").fill("Уточните результат");
      await dispute.click();
      await confirmation.getByText("Ответ не получен").waitFor();
      const popup = await confirmation.boundingBox();
      for (const button of [dispute, confirmation.getByRole("button", { name: "Назад" }), confirmation.getByRole("alert")]) {
        const control = await button.boundingBox();
        assert(control.y >= popup.y && control.y + control.height <= popup.y + popup.height + 1, "Order actions and errors must remain visible on a short screen");
      }
      if ([320, 1440].includes(width) || height === 400) await page.screenshot({ path: join(screenshots, `dispute-${width}x${height}.png`) });
      await dispute.click();
      await confirmation.waitFor({ state: "hidden" });
      await buyerReceipt.getByText("Открыт спор", { exact: true }).waitFor();
      await buyerOrder.getByRole("button", { name: "Скрыть квитанцию" }).click();
      await buyerOrder.getByText("Уточните результат", { exact: true }).waitFor();
      await sellerOrder.getByRole("button", { name: "Отметить исполнение" }).click();
      await confirmation.getByLabel("Комментарий для покупателя").fill("Доставка завершена");
      await confirmation.getByRole("button", { name: "Отметить исполнение" }).click();
      await sellerOrder.getByText("На проверке", { exact: true }).waitFor();
      assert.deepEqual(await page.evaluate(() => window.ordersDrawerFixture.submittedActions), [
        { action: "dispute", note: "Уточните результат" },
        { action: "dispute", note: "Уточните результат" },
        { action: "fulfill", note: "Доставка завершена" },
      ]);
      assert.deepEqual(await drawer.locator("[data-order-role]").evaluateAll((cards) => cards.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.dataset.orderRole)), []);
      assert.deepEqual(await page.evaluate(() => window.ordersDrawerFixture.unexpected), []);

      await page.goto(marketplaceUrl);
      await page.getByRole("button", { name: "Купить", exact: true }).click();
      await confirmation.getByText("Комиссия составляет 0 роллов.", { exact: false }).waitFor();
      await confirmation.getByRole("combobox", { name: "Оплатить покупку" }).click();
      await page.getByRole("option", { name: "Карта · 80 роллов" }).click();
      await confirmation.getByRole("button", { name: "Подтвердить", exact: true }).click();
      await confirmation.getByText("Результат оплаты пока неизвестен.", { exact: false }).waitFor();
      await page.reload();
      await confirmation.getByRole("button", { name: "Проверить оплату" }).click();
      await confirmation.waitFor({ state: "hidden" });
      const attempts = await page.evaluate(() => JSON.parse(sessionStorage.getItem("marketplace-browser-attempts")));
      assert.equal(attempts.length, 2);
      assert.deepEqual(attempts[0], attempts[1]);
      assert.deepEqual({ ...attempts[0], idempotencyKey: undefined }, {
        itemId: "protected-offer", expectedPrice: 50, giftCardId: "test-card", idempotencyKey: undefined,
      });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
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
