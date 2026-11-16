import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { browserLaunchOptions } from "./browser-runtime.mjs";
import { listenSmokeServer, smokeOrigin } from "./smoke-server.mjs";
import { APP_ORDERS_PATH, APP_STORE_PATH } from "../src/modules/shell/app-routing.js";
import { spherePageUrl } from "../shared/modules/shell/sphere-page-urls.js";

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
const ordersUrl = origin + spherePageUrl(APP_ORDERS_PATH);
const storeUrl = origin + spherePageUrl(APP_STORE_PATH);
const marketplaceUrl = origin + spherePageUrl("/app/spheres/career/business/store");
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
    const marketplaceMiss = height < 500 || width === 1440;
    const actionRecovery = height < 500 ? "unavailable" : [768, 1440].includes(width) ? "missing" : "recorded";
    await page.addInitScript(({ marketplaceMiss, actionRecovery, sellerLost }) => {
      const savedAction = JSON.parse(sessionStorage.getItem("orders-fixture-action") || "null");
      const fixture = window.ordersDrawerFixture = { mode: savedAction ? "protected" : "loading", reads: 0,
        unexpected: [], submittedActions: savedAction?.attempts ?? [], actionChecks: [] };
      const user = { id: "orders-smoke", username: "orders-smoke", name: "Покупатель", accountType: "personal", canDiscoverSpheres: true };
      const point = { code: "PICKUP-TEST", city: "Москва", cityCode: "44", region: "Москва", address: "Улица проверки, 1" };
      const pickupPoints = Array.from({ length: 3 }, (_, index) => ({
        ...point, code: `PICKUP-${index + 1}`, address: `Улица проверки, ${index + 1}`, workTime: "Пн–вс 10:00–20:00",
      }));
      const catKey = "23ecb1bb-45d7-4ebe-beff-ad3344d1f11c";
      const catReceipt = { id: "cat-recovered", amount: 1000, productId: "cat:white",
        status: "placed", delivery: { provider: "cdek", point } };
      fixture.catIntent = { cat: { id: "white" }, pickupPoint: point, idempotencyKey: catKey, submitted: true };
      fixture.catChecks = [];
      fixture.catSends = [];
      const fulfilled = {
        id: "650bc77a-2829-449f-86af-51d4439bd080", productTitle: "Получение консультации", amount: 50,
        createdAt: "2026-11-12T10:00:00Z", status: "fulfilled",
        settlement: { role: "buyer", participant: "Студия", source: "gift", attention: "review", reviewUntil: "2026-11-19T10:00:00Z",
          actions: ["accept", "dispute"], events: [{ action: "fulfill", note: "Встреча состоялась", createdAt: "2026-11-12T10:00:00Z" }] },
      };
      if (savedAction) Object.assign(fulfilled, savedAction.order);
      const reserved = {
        id: "793550f5-1e76-4d40-b272-772f39c96717", productTitle: "Встреча с заказчиком", amount: 70,
        createdAt: "2026-11-12T09:00:00Z", status: "reserved",
        settlement: { role: "seller", participant: "Мария", source: "wallet", attention: "fulfill", reviewUntil: null, actions: ["fulfill", "refund"], events: [] },
      };
      const item = { id: "protected-offer", sphere: "career", title: "Консультация студии", priceRolls: 50, itemType: "service",
        business: { id: "seller", name: "Студия", username: "studio" } };
      const pendingOrders = new Promise((resolve) => { fixture.resolveOrders = resolve; });
      fixture.api = {
        async get(path) {
          if (path === "/me") return { user };
          if (path === "/auth/yandex/config") return { enabled: false };
          if (path === "/sphere-shares/incoming") return { shares: [] };
          if (path.startsWith("/sphere-shares/context?")) return { isOwner: true, owner: user, people: [], requests: [] };
          if (path === "/business-marketplace/career/store") return { items: [item], protectedCheckout: true };
          if (path === "/rolls/gift-cards") return { cards: [{ id: "test-card", balance: 80, business: { id: "seller" } }] };
          if (path === "/delivery/cdek/cities") return { cities: [{ code: "44", label: "Москва" }] };
          if (path.startsWith("/delivery/cdek/points?cityCode=44&")) return { points: pickupPoints, total: 3, nextOffset: null };
          if (path.startsWith("/rolls/purchases/")) {
            fixture.catChecks.push(path.split("/").at(-1));
            return { purchase: marketplaceMiss ? null : catReceipt };
          }
          if (path === `/rolls/orders/${fulfilled.id}/actions/dispute`) {
            fixture.actionChecks.push(path);
            const event = fulfilled.settlement.events.find(({ action }) => action === "dispute");
            return { order: { id: fulfilled.id, amount: fulfilled.amount, action: "dispute", role: "buyer",
              status: fulfilled.status, available: fulfilled.settlement.actions.includes("dispute"),
              recorded: event ? { note: event.note, at: event.createdAt } : null } };
          }
          if (path === `/rolls/orders/${reserved.id}/actions/fulfill`) {
            fixture.actionChecks.push(path);
            const event = reserved.settlement.events[0];
            return { order: { id: reserved.id, amount: reserved.amount, action: "fulfill", role: "seller",
              status: reserved.status, available: false, recorded: event ? { note: event.note, at: event.createdAt } : null } };
          }
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
          if (path.startsWith("/business-marketplace/career/purchases/")) {
            const key = path.split("/").at(-1);
            const attempts = JSON.parse(sessionStorage.getItem("marketplace-browser-attempts") || "[]");
            const checks = JSON.parse(sessionStorage.getItem("marketplace-browser-checks") || "[]");
            sessionStorage.setItem("marketplace-browser-checks", JSON.stringify([...checks, key]));
            const original = attempts[0];
            return { purchase: original?.idempotencyKey === key && (!marketplaceMiss || attempts.length > 1)
              ? { id: fulfilled.id, itemId: original.itemId, sphere: "career", amount: 50, giftCardId: original.giftCardId,
                status: "reserved", protected: true }
              : null };
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
          if (path === "/rolls/purchases") {
            fixture.catSends.push(input);
            return { purchase: catReceipt };
          }
          if (path === "/business-marketplace/career/purchases") {
            const attempts = JSON.parse(sessionStorage.getItem("marketplace-browser-attempts") || "[]");
            attempts.push(input);
            sessionStorage.setItem("marketplace-browser-attempts", JSON.stringify(attempts));
            if (attempts.length === 1) throw new Error("Lost response");
            return { purchase: { id: fulfilled.id, protected: true, replayed: true } };
          }
          if (path === `/rolls/orders/${fulfilled.id}/actions` && input.action === "dispute") {
            fixture.submittedActions.push(input);
            const first = fixture.submittedActions.length === 1;
            if (!first || actionRecovery === "recorded") {
              fulfilled.status = "disputed";
              fulfilled.settlement.attention = "dispute";
              fulfilled.settlement.actions = ["accept"];
              fulfilled.settlement.events.push({ action: input.action, note: input.note, createdAt: "2026-11-13T10:00:00Z" });
            } else if (actionRecovery === "unavailable") {
              fulfilled.settlement.attention = null;
              fulfilled.settlement.actions = ["accept"];
              fulfilled.settlement.reviewUntil = "2026-11-13T10:00:00Z";
            }
            sessionStorage.setItem("orders-fixture-action", JSON.stringify({ order: fulfilled, attempts: fixture.submittedActions }));
            if (first) throw new Error("Ответ не получен");
            return { order: { id: fulfilled.id, status: fulfilled.status, replayed: true } };
          }
          if (path === `/rolls/orders/${reserved.id}/actions` && input.action === "fulfill") {
            fixture.submittedActions.push(input);
            reserved.status = "fulfilled";
            reserved.settlement.attention = null;
            reserved.settlement.reviewUntil = "2026-11-19T10:00:00Z";
            reserved.settlement.actions = ["refund"];
            reserved.settlement.events = [{ action: input.action, note: input.note, createdAt: "2026-11-12T10:00:00Z" }];
            if (sellerLost) throw new Error("Ответ не получен");
            return { order: { id: reserved.id, status: reserved.status } };
          }
          fixture.unexpected.push(path);
          throw new Error("Unexpected action in orders fixture");
        },
      };
    }, { marketplaceMiss, actionRecovery, sellerLost: width === 1920 });

    try {
      const store = `${storeUrl}?from=smoke#store`;
      await page.goto(store);
      const profile = page.getByRole("button", { name: /^Редактировать профиль/ });
      const openOrders = async () => {
        await profile.click();
        await page.getByRole("navigation", { name: "Разделы профиля" })
          .getByRole("button", { name: "Заказы", exact: true }).click();
      };
      await page.getByRole("heading", { name: "Магазин · Товары" }).waitFor();
      await profile.scrollIntoViewIfNeeded();
      assert.equal(await page.getByRole("button", { name: "Заказы", exact: true }).count(), 0);
      assert.equal(await page.evaluate(() => window.ordersDrawerFixture.reads), 0);
      const boxOf = async (element) => element.evaluate(node => {
        const { top, right, bottom } = node.getBoundingClientRect();
        return { top, right, bottom };
      });
      const assertCheckoutDrawer = async (dialog) => {
        await page.waitForFunction(() => getComputedStyle(document.querySelector(".cat-checkout")).transform === "matrix(1, 0, 0, 1, 0, 0)");
        assert.equal(await dialog.getAttribute("data-swipe-direction"), width < 768 ? "down" : "right");
        const footer = dialog.locator('[data-slot="drawer-footer"]');
        const body = dialog.locator("[data-cdek-checkout-body]");
        const [frame, header, scrollport, actions] = await Promise.all([
          boxOf(dialog), boxOf(dialog.locator('[data-slot="drawer-header"]')), boxOf(body), boxOf(footer),
        ]);
        assert(frame.top >= -1 && Math.abs(frame.right - width) <= 1 && Math.abs(frame.bottom - height) <= 1);
        assert(header.bottom <= scrollport.top + 1 && scrollport.bottom <= actions.top + 1);
        assert(await body.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
        const sizes = await dialog.locator('[data-slot="drawer-footer"] button, [data-slot="drawer-header"] button').evaluateAll(nodes =>
          nodes.map(node => [node.offsetHeight, getComputedStyle(node).borderRadius]));
        assert(sizes.length >= 2 && sizes.every(([size, radius]) => size === 48 && radius === "24px"));
        return { footer, body };
      };

      const buyCat = page.getByRole("button", { name: /Купить «Красный кот»/ });
      await buyCat.click();
      const pickupDialog = page.getByRole("dialog", { name: "Выберите пункт CDEK", exact: true });
      const city = pickupDialog.getByRole("combobox", { name: "Город", exact: true });
      const address = pickupDialog.getByLabel("Адрес пункта выдачи");
      const next = pickupDialog.getByRole("button", { name: "Продолжить", exact: true });
      await city.waitFor();
      assert(await address.isDisabled());
      assert(await next.isDisabled());
      await city.fill("Мос");
      await page.getByRole("option", { name: "Москва", exact: true }).click();
      await address.fill("Улица проверки");
      const pointChoice = pickupDialog.getByRole("radio", { name: /PICKUP-3/ });
      await pointChoice.waitFor();
      const { body, footer } = await assertCheckoutDrawer(pickupDialog);
      if (height < 500) {
        const before = await boxOf(footer);
        await pointChoice.scrollIntoViewIfNeeded();
        assert(await body.evaluate(node => node.scrollTop > 0));
        assert.deepEqual(await boxOf(footer), before);
        assert.equal(await next.evaluate(node => getComputedStyle(node).opacity), "1");
      }
      if (width === 1440 || height < 500) await page.screenshot({ path: join(screenshots, `cdek-pickup-${width}x${height}.png`) });
      await pointChoice.click();
      await next.click();
      const catReview = page.getByRole("dialog", { name: "Подтвердите покупку", exact: true });
      await catReview.getByText("Москва, Улица проверки, 3", { exact: true }).waitFor();
      await assertCheckoutDrawer(catReview);
      if (width === 1440 || height < 500) await page.screenshot({ path: join(screenshots, `cdek-review-${width}x${height}.png`) });
      await catReview.getByRole("button", { name: "Изменить пункт", exact: true }).click();
      await pickupDialog.getByText("Москва, Улица проверки, 3", { exact: true }).waitFor();
      await page.keyboard.press("Escape");
      await pickupDialog.waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label")?.startsWith("Купить «Красный кот»"));
      assert.deepEqual(await page.evaluate(() => window.ordersDrawerFixture.catSends), []);
      await profile.scrollIntoViewIfNeeded();
      await page.locator(".cat-store-page").evaluate((element) => { element.dataset.smokeMounted = "true"; });
      const storeScroll = await page.evaluate(() => scrollY);

      await openOrders();
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
      await profile.waitFor();
      assert.equal(await page.getByRole("button", { name: "Заказы", exact: true }).count(), 0);
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
      await drawer.getByRole("link", { name: "В магазин" }).click();
      await page.waitForURL(storeUrl);
      await drawer.waitFor({ state: "hidden" });

      await page.evaluate(() => { window.ordersDrawerFixture.mode = "protected"; });
      await openOrders();
      await page.waitForURL(ordersUrl);
      const buyerOrder = drawer.locator('[data-order-role="buyer"]');
      const sellerOrder = drawer.locator('[data-order-role="seller"]');
      const orderFilters = drawer.getByRole("group", { name: "Фильтр заказов" });
      await orderFilters.getByRole("button", { name: "Исполнить заказы" }).waitFor();
      assert.deepEqual(await orderFilters.getByRole("button").evaluateAll((buttons) => buttons.map((button) => [
        button.offsetHeight, getComputedStyle(button).paddingInlineStart, getComputedStyle(button).paddingInlineEnd,
      ])), [[48, "24px", "24px"], [48, "24px", "24px"], [48, "24px", "24px"]]);
      await orderFilters.getByRole("button", { name: "Исполнить заказы" }).click();
      await page.waitForURL((url) => url.searchParams.get("attention") === "fulfill");
      await sellerOrder.waitFor();
      await buyerOrder.waitFor({ state: "hidden" });
      assert.equal(await orderFilters.getByRole("button", { name: "Исполнить заказы" }).getAttribute("aria-pressed"), "true");
      await orderFilters.getByRole("button", { name: "Все заказы" }).click();
      await page.waitForURL(ordersUrl);
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
      await orderFilters.getByRole("button", { name: "Проверить покупки" }).click();
      await page.waitForURL((url) => url.searchParams.get("attention") === "review");
      await sellerOrder.waitFor({ state: "hidden" });
      await buyerOrder.getByRole("button", { name: "Открыть спор" }).click();
      const dispute = confirmation.getByRole("button", { name: "Открыть спор", exact: true });
      assert(await dispute.isDisabled());
      await confirmation.getByLabel("Причина спора").fill("Уточните результат");
      await dispute.click();
      await confirmation.getByText("Ответ не получен").waitFor();
      const popup = await confirmation.boundingBox();
      const checkResult = confirmation.getByRole("button", { name: "Проверить результат" });
      const later = confirmation.getByRole("button", { name: "Позже" });
      for (const button of [checkResult, later, confirmation.getByRole("alert")]) {
        const control = await button.boundingBox();
        assert(control.y >= popup.y && control.y + control.height <= popup.y + popup.height + 1, "Order actions and errors must remain visible on a short screen");
      }
      if ([320, 1440].includes(width) || height === 400) await page.screenshot({ path: join(screenshots, `dispute-${width}x${height}.png`) });
      await later.click();
      await confirmation.waitFor({ state: "hidden" });
      if (width === 1024) {
        await page.reload();
        await page.waitForURL((url) => url.searchParams.get("attention") === "review");
      }
      await buyerOrder.getByRole("button", { name: "Открыть проверку действия" }).click();
      assert.equal(await confirmation.getByLabel("Причина спора").inputValue(), "Уточните результат");
      assert.equal(await confirmation.getByLabel("Причина спора").evaluate((field) => field.readOnly), true);
      const actionRequests = () => page.evaluate(() => window.ordersDrawerFixture.submittedActions);
      assert.equal((await actionRequests()).length, 1);
      await checkResult.click();
      if (actionRecovery === "missing") {
        await confirmation.getByText("Действие пока не записано.", { exact: true }).waitFor();
        assert.equal((await actionRequests()).length, 1);
        await confirmation.getByRole("button", { name: "Повторить действие" }).click();
      }
      if (actionRecovery === "unavailable") {
        await confirmation.getByText("Действие пока не записано. Сейчас его нельзя отправить повторно.").waitFor();
        assert.equal(await confirmation.getByRole("button", { name: "Повторить действие" }).count(), 0);
        await checkResult.click();
        const unavailable = confirmation.getByText("Действие пока не записано. Сейчас его нельзя отправить повторно.");
        await unavailable.waitFor();
        const closeRequest = confirmation.getByRole("button", { name: "Закрыть запрос" });
        for (const control of [unavailable, closeRequest]) {
          assert(await control.evaluate((element) => {
            const container = element.closest(".overflow-y-auto").getBoundingClientRect();
            const content = element.getBoundingClientRect();
            return content.top >= container.top && content.bottom <= container.bottom + 1;
          }), "Deadline feedback and closing the request must be visible without scrolling");
        }
        await page.screenshot({ path: join(screenshots, `deadline-${width}x${height}.png`) });
        await confirmation.getByRole("button", { name: "Закрыть запрос" }).click();
      }
      await confirmation.waitFor({ state: "hidden" });
      assert.deepEqual(await page.evaluate(() => window.ordersDrawerFixture.actionChecks), Array.from({ length: actionRecovery === "unavailable" ? 2 : 1 },
        () => "/rolls/orders/650bc77a-2829-449f-86af-51d4439bd080/actions/dispute"));
      assert.equal(await page.evaluate(() => sessionStorage.getItem("rollapp:marketplace-action:orders-smoke:650bc77a-2829-449f-86af-51d4439bd080")), null);
      await drawer.getByText("В этой подборке сейчас нет заказов.").waitFor();
      await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Список заказов");
      assert.equal(await orderFilters.getByRole("button", { name: "Проверить покупки" }).getAttribute("aria-pressed"), "true");
      const nextFilter = actionRecovery === "unavailable" ? "Все заказы" : "Открытые споры";
      await orderFilters.getByRole("button", { name: nextFilter }).click();
      if (actionRecovery !== "unavailable") {
        await sellerOrder.waitFor({ state: "hidden" });
        await buyerOrder.getByText("Открыт спор", { exact: true }).first().waitFor();
        if (!await buyerOrder.getByText("Уточните результат", { exact: true }).isVisible()) {
          await buyerOrder.getByRole("button", { name: "История заказа" }).click();
        }
        await buyerOrder.getByText("Уточните результат", { exact: true }).waitFor();
      } else {
        await buyerOrder.getByRole("button", { name: "Открыть спор" }).waitFor({ state: "hidden" });
      }
      await orderFilters.getByRole("button", { name: "Все заказы" }).click();
      await page.waitForURL(ordersUrl);
      await page.evaluate(() => sessionStorage.removeItem("orders-fixture-action"));
      await sellerOrder.getByRole("button", { name: "Отметить исполнение" }).click();
      await confirmation.getByLabel("Комментарий для покупателя").fill("Доставка завершена");
      await confirmation.getByRole("button", { name: "Отметить исполнение" }).click();
      if (width === 1920) {
        await confirmation.getByText("Ответ не получен", { exact: false }).waitFor();
        await checkResult.click();
        await confirmation.waitFor({ state: "hidden" });
        assert.equal((await page.evaluate(() => window.ordersDrawerFixture.actionChecks)).at(-1),
          "/rolls/orders/793550f5-1e76-4d40-b272-772f39c96717/actions/fulfill");
      }
      await sellerOrder.getByText("На проверке", { exact: true }).waitFor();
      assert.deepEqual(await page.evaluate(() => window.ordersDrawerFixture.submittedActions), [
        ...Array.from({ length: actionRecovery === "missing" ? 2 : 1 }, () => ({ action: "dispute", note: "Уточните результат", expectedAmount: 50 })),
        { action: "fulfill", note: "Доставка завершена", expectedAmount: 70 },
      ]);
      assert.deepEqual(await drawer.locator("[data-order-role]").evaluateAll((cards) => cards.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.dataset.orderRole)), []);
      assert.deepEqual(await page.evaluate(() => window.ordersDrawerFixture.unexpected), []);

      await page.goto(marketplaceUrl);
      await page.getByRole("button", { name: "Купить", exact: true }).click();
      await confirmation.getByText("Комиссия составляет 0 роллов.", { exact: false }).waitFor();
      await confirmation.getByRole("combobox", { name: "Оплатить покупку" }).click();
      await page.getByRole("option", { name: "Карта · 80 роллов" }).click();
      await confirmation.getByRole("button", { name: "Подтвердить", exact: true }).click();
      await confirmation.getByText("Ответ об оплате пока не получен.", { exact: false }).waitFor();
      await page.reload();
      await confirmation.getByText("Исходная подарочная карта.", { exact: false }).waitFor();
      await confirmation.getByRole("button", { name: "Проверить оплату" }).click();
      const submitted = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("marketplace-browser-attempts")));
      if (marketplaceMiss) {
        await confirmation.getByText("В журнале пока нет покупки.").waitFor();
        assert.equal((await submitted()).length, 1);
        const sendAgain = confirmation.getByRole("button", { name: "Оплатить снова" });
        assert.equal((await sendAgain.boundingBox()).height, 48);
        if (height < 500 || width === 1440) await page.screenshot({ path: join(screenshots, `checkout-recovery-${width}x${height}.png`) });
        await sendAgain.click();
      }
      await confirmation.waitFor({ state: "hidden" });
      const attempts = await submitted();
      assert.equal(attempts.length, marketplaceMiss ? 2 : 1);
      if (marketplaceMiss) assert.deepEqual(attempts[0], attempts[1]);
      assert.deepEqual(await page.evaluate(() => JSON.parse(sessionStorage.getItem("marketplace-browser-checks"))), [attempts[0].idempotencyKey]);
      await page.evaluate(() => sessionStorage.setItem("rollapp:pending-cat-purchase:orders-smoke", JSON.stringify(window.ordersDrawerFixture.catIntent)));
      await page.goto(storeUrl);
      const catDialog = page.getByRole("dialog", { name: "Подтвердите покупку" });
      await catDialog.getByText("Улица проверки, 1", { exact: false }).waitFor();
      await assertCheckoutDrawer(catDialog);
      await catDialog.getByRole("button", { name: "Позже", exact: true }).click();
      await catDialog.waitFor({ state: "hidden" });
      assert.equal(await page.evaluate(() => window.ordersDrawerFixture.catChecks.length), 0);
      await page.getByRole("button", { name: "Проверить покупку", exact: true }).click();
      await catDialog.getByText("Улица проверки, 1", { exact: false }).waitFor();
      await catDialog.getByRole("button", { name: "Проверить покупку", exact: true }).click();
      if (marketplaceMiss) {
        await catDialog.getByText("В журнале пока нет покупки.").waitFor();
        assert.equal(await page.evaluate(() => window.ordersDrawerFixture.catSends.length), 0);
        const retryCat = catDialog.getByRole("button", { name: "Оплатить снова" });
        assert.equal((await retryCat.boundingBox()).height, 48);
        await retryCat.click();
      }
      const bought = page.getByRole("dialog", { name: "Кот куплен" });
      await bought.getByText("Заказ № cat-recovered").waitFor();
      const catRequest = await page.evaluate(() => window.ordersDrawerFixture.catIntent);
      assert.deepEqual(await page.evaluate(() => window.ordersDrawerFixture.catChecks), [catRequest.idempotencyKey]);
      assert.deepEqual(await page.evaluate(() => window.ordersDrawerFixture.catSends), marketplaceMiss
        ? [{ productId: "cat:white", pickupPointCode: catRequest.pickupPoint.code, expectedPrice: 1000, idempotencyKey: catRequest.idempotencyKey }]
        : []);
      await bought.getByRole("button", { name: "Готово" }).click();
      await bought.waitFor({ state: "hidden" });
      assert.equal(await page.evaluate(() => sessionStorage.getItem("rollapp:pending-cat-purchase:orders-smoke")), null);
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
