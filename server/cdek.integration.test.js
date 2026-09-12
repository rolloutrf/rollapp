import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import express from "express";
import { registerCdekRoutes } from "./cdek-routes.js";
import { registerRollsRoutes } from "./rolls-routes.js";
import { ensureRollWallet, rollsSchema } from "./rolls.js";

test("CDEK checkout against production PostgreSQL; fixture operations roll back", { skip: process.env.ROLLAPP_TEST_CDEK !== "1" }, async (t) => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  const client = await db.pool.connect();
  let server;
  let browser;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='3min'");
    await client.query(rollsSchema);
    const id = randomUUID();
    await client.query("INSERT INTO users(id,email,username,name,password_hash) VALUES($1,$2,$3,'Проверка CDEK','unusable')", [id, `${id}@cdek-test.invalid`, `cdek-${id}`]);
    await ensureRollWallet(client, id);
    await client.query("UPDATE roll_wallets SET balance=5000 WHERE user_id=$1", [id]);
    const app = express();
    app.use(express.json());
    let queue = Promise.resolve();
    app.use("/api", (req, res, next) => {
      const previous = queue;
      queue = new Promise((resolve) => { res.once("finish", resolve); res.once("close", resolve); });
      previous.then(next);
    });
    const requireAuth = (req, res, next) => {
      if (req.headers["x-test-unauthenticated"]) return res.sendStatus(401);
      req.user = { id }; next();
    };
    const query = (...args) => client.query(...args);
    const transaction = async (callback) => {
      await client.query("SAVEPOINT request");
      try { return await callback(client); }
      catch (error) { await client.query("ROLLBACK TO SAVEPOINT request"); throw error; }
      finally { await client.query("RELEASE SAVEPOINT request"); }
    };
    app.get("/api/me", (_req, res) => res.json({ user: { id, name: "Проверка CDEK", username: `cdek-${id}`, accountType: "person" } }));
    registerCdekRoutes(app, { requireAuth, query });
    registerRollsRoutes(app, { requireAuth, query, transaction });
    app.use("/api", (_req, res) => res.sendStatus(404));
    app.use(express.static(path.resolve("dist")));
    app.get("*splat", (_req, res) => res.sendFile(path.resolve("dist/index.html")));
    server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const get = (search) => fetch(`${origin}/api/delivery/cdek/points?q=${encodeURIComponent(search)}`);
    const post = (payload) => fetch(`${origin}/api/rolls/purchases`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const balance = async () => Number((await query("SELECT balance FROM roll_wallets WHERE user_id=$1", [id])).rows[0].balance);
    const purchases = async () => Number((await query("SELECT count(*) FROM roll_store_purchases WHERE user_id=$1", [id])).rows[0].count);
    let point;
    let cities;

    await t.test("real catalog search, auth, empty and invalid requests", async () => {
      assert.equal((await fetch(`${origin}/api/delivery/cdek/points?q=Москва`, { headers: { "x-test-unauthenticated": "1" } })).status, 401);
      assert.equal((await get("М")).status, 400);
      const response = await get("Москва");
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.ok(data.total > 30);
      assert.equal(data.points.length, 30);
      assert.equal(data.nextOffset, 30);
      point = data.points[0];
      assert.equal((await (await get(point.code)).json()).points.some((item) => item.code === point.code), true);
      assert.equal((await (await get("несуществующий-пункт-123456789")).json()).total, 0);
      assert.equal(await balance(), 5000);
      assert.equal(await purchases(), 0);
      const citiesResponse = await fetch(`${origin}/api/delivery/cdek/cities`);
      assert.equal(citiesResponse.status, 200);
      cities = (await citiesResponse.json()).cities;
      assert.equal(new Set(cities.map((city) => city.code)).size, cities.length);
      const cityResponse = await fetch(`${origin}/api/delivery/cdek/points?cityCode=${point.cityCode}`);
      assert.equal(cityResponse.status, 200);
      assert.ok((await cityResponse.json()).points.every((item) => item.cityCode === point.cityCode));
      const scoped = await fetch(`${origin}/api/delivery/cdek/points?cityCode=unknown&q=${point.code}`);
      assert.equal((await scoped.json()).total, 0);
    });

    await t.test("required authoritative pickup point, atomic purchase and idempotent replay", async () => {
      const payload = { productId: "cat:red", idempotencyKey: randomUUID(), pickupPointCode: point.code };
      assert.equal((await post({ ...payload, pickupPointCode: undefined })).status, 400);
      assert.equal((await post({ ...payload, amount: 1 })).status, 400);
      assert.equal((await post({ ...payload, pickupPointCode: "NONEXISTENT" })).status, 409);
      assert.equal(await balance(), 5000);
      const response = await post(payload);
      assert.equal(response.status, 201);
      const first = (await response.json()).purchase;
      assert.equal(first.delivery.point.code, point.code);
      assert.equal(first.delivery.point.address, point.address);
      assert.equal(await balance(), 4000);
      const replay = await post(payload);
      assert.equal(replay.status, 200);
      assert.equal((await replay.json()).purchase.id, first.id);
      assert.equal(await purchases(), 1);
      assert.equal((await post({ ...payload, pickupPointCode: "ANOTHER" })).status, 409);
      assert.equal(await balance(), 4000);
      await client.query("SAVEPOINT insufficient");
      await query("UPDATE roll_wallets SET balance=1 WHERE user_id=$1", [id]);
      assert.equal((await post({ ...payload, idempotencyKey: randomUUID() })).status, 409);
      assert.equal(await balance(), 1);
      assert.equal(await purchases(), 1);
      await client.query("ROLLBACK TO SAVEPOINT insufficient");
    });

    await t.test("private order list and idempotent refund restore the exact purchase amount", async () => {
      await client.query("SAVEPOINT refund_check");
      try {
        assert.equal((await fetch(`${origin}/api/rolls/orders`, { headers: { "x-test-unauthenticated": "1" } })).status, 401);
        const listResponse = await fetch(`${origin}/api/rolls/orders`);
        assert.equal(listResponse.status, 200);
        const listed = (await listResponse.json()).orders;
        assert.equal(listed.length, 1);
        assert.equal(listed[0].productId, "cat:red");
        assert.equal(listed[0].status, "placed");
        assert.equal(listed[0].delivery.point.code, point.code);
        assert.equal((await fetch(`${origin}/api/rolls/orders/${randomUUID()}/refund`, { method: "POST" })).status, 404);

        const refundUrl = `${origin}/api/rolls/orders/${listed[0].id}/refund`;
        const first = await fetch(refundUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        assert.equal(first.status, 200);
        const refunded = await first.json();
        assert.equal(refunded.replayed, false);
        assert.equal(refunded.balance, 5000);
        assert.equal(refunded.order.status, "refunded");
        assert.ok(refunded.order.refundedAt);
        const replay = await fetch(refundUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        assert.equal(replay.status, 200);
        assert.equal((await replay.json()).replayed, true);
        assert.equal(await balance(), 5000);
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT refund_check");
      }
      assert.equal(await balance(), 4000);
    });

    if (process.env.CDEK_TEST_UI === "1") {
      await t.test("desktop/mobile selection, cancellation, purchase and lost-response recovery", async () => {
        const { chromium } = await import("playwright-core");
        browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await mkdir("/tmp/rollapp-cdek-checks", { recursive: true });
        for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
          await page.setViewportSize(viewport);
          await page.goto(`${origin}/app/store`);
          await page.getByRole("button", { name: /Купить «Красный кот»/ }).click();
          const dialog = page.getByRole("dialog");
          await dialog.getByRole("heading", { name: "Выберите пункт CDEK" }).waitFor();
          assert.equal(await dialog.getByRole("button", { name: "Продолжить" }).isDisabled(), true);
          assert.equal(await dialog.getByLabel("Адрес пункта выдачи").isDisabled(), true);
          await dialog.getByRole("combobox", { name: "Город", exact: true }).fill("Моск");
          await page.getByRole("option", { name: "Москва", exact: true }).click();
          await dialog.getByLabel("Адрес пункта выдачи").fill("Тверская");
          await dialog.getByRole("radio").first().waitFor();
          await dialog.getByRole("radio").first().click();
          assert.equal(await dialog.getByRole("radio").count(), 0);
          const map = dialog.getByTitle(/Карта пункта CDEK:/);
          await map.waitFor();
          assert.match(await map.getAttribute("src"), /^https:\/\/yandex\.ru\/map-widget\/v1\/\?/);
          await map.contentFrame().locator("body").waitFor();
          await page.waitForTimeout(1_000);
          const overflow = await dialog.locator("[data-cdek-checkout-body]").evaluate((element) => ({
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
            scrollbarWidth: getComputedStyle(element).scrollbarWidth,
            offenders: [...element.querySelectorAll("*")].map((child) => ({
              tag: child.tagName,
              slot: child.getAttribute("data-slot"),
              className: typeof child.className === "string" ? child.className : "",
              left: child.getBoundingClientRect().left,
              right: child.getBoundingClientRect().right,
            })).filter((child) => child.left < element.getBoundingClientRect().left - 0.5 || child.right > element.getBoundingClientRect().right + 0.5).slice(0, 10),
          }));
          assert.ok(overflow.scrollWidth <= overflow.clientWidth, JSON.stringify(overflow));
          assert.ok(overflow.scrollHeight <= overflow.clientHeight, JSON.stringify(overflow));
          assert.equal(overflow.scrollbarWidth, "none");
          await page.screenshot({ path: `/tmp/rollapp-cdek-checks/pickup-${viewport.width}.png` });
          const box = await dialog.boundingBox();
          assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1);
          assert.ok(box.y >= 0 && box.y + box.height <= viewport.height + 1);
          await dialog.getByRole("button", { name: "Выбрать другой пункт" }).click();
          await dialog.getByRole("combobox", { name: "Город", exact: true }).fill("Санкт-Пет");
          await page.getByRole("option", { name: "Санкт-Петербург", exact: true }).click();
          assert.equal(await dialog.getByLabel("Адрес пункта выдачи").inputValue(), "");
          assert.equal(await dialog.getByRole("button", { name: "Продолжить" }).isDisabled(), true);
          await dialog.getByRole("radio").first().click();
          await dialog.getByRole("button", { name: "Продолжить" }).click();
          await dialog.getByRole("heading", { name: "Подтвердите покупку" }).waitFor();
          await dialog.getByTitle(/Карта пункта CDEK:/).contentFrame().locator("body").waitFor();
          await page.waitForTimeout(1_000);
          const reviewOverflow = await dialog.locator("[data-cdek-checkout-body]").evaluate((element) => ({
            clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
          }));
          assert.ok(reviewOverflow.scrollHeight <= reviewOverflow.clientHeight, JSON.stringify(reviewOverflow));
          await page.screenshot({ path: `/tmp/rollapp-cdek-checks/review-${viewport.width}.png` });
          await page.keyboard.press("Escape");
          await dialog.waitFor({ state: "hidden" });
          assert.equal(await purchases(), 1);
        }
        await page.getByRole("button", { name: /Купить «Белый кот»/ }).click();
        await page.getByRole("combobox", { name: "Город", exact: true }).fill(cities.find((city) => city.code === point.cityCode).name.slice(0, 4));
        await page.getByRole("option", { name: cities.find((city) => city.code === point.cityCode).label, exact: true }).click();
        await page.getByLabel("Адрес пункта выдачи").fill(point.code);
        await page.getByRole("radio").first().click();
        await page.getByRole("button", { name: "Продолжить" }).click();
        await page.route("**/api/rolls/purchases", async (route) => {
          await route.fetch(); // Commit inside the test transaction, then lose the response.
          await route.abort("failed");
        }, { times: 1 });
        await page.getByRole("button", { name: "Купить за 1 000 роллов" }).click();
        await page.getByRole("button", { name: "Проверить покупку" }).waitFor();
        assert.equal(await purchases(), 2);
        await page.reload();
        await page.getByRole("button", { name: "Проверить покупку" }).click();
        await page.getByRole("heading", { name: "Кот куплен", exact: true }).waitFor();
        assert.equal(await purchases(), 2);
        assert.equal(await balance(), 3000);
        await page.screenshot({ path: "/tmp/rollapp-cdek-checks/success-mobile.png" });
        assert.deepEqual(errors, []);
      });
    }
  } finally {
    await browser?.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    await client.query("ROLLBACK");
    client.release();
    await db.pool.end();
  }
});
