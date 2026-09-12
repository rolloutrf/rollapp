import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import { mkdir } from "node:fs/promises";
import { createStarOrder, approveStarCheckout, settleStarPayment, createStarsUpdateHandler, getStarsConfig } from "./roll-stars.js";
import { rollsSchema, readRollWallet } from "./rolls.js";
import { ROLL_STAR_TERMS_VERSION } from "../shared/roll-stars.js";
import { registerRollsRoutes } from "./rolls-routes.js";

test("Stars orders on production PostgreSQL; all fixtures and schema changes rolled back", { skip: process.env.ROLLAPP_TEST_STARS !== "1" }, async (t) => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  const client = await db.pool.connect();
  let server;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query(rollsSchema);
    const users = [randomUUID(), randomUUID(), randomUUID()];
    const telegramId = String(8_000_000_000_000 + Math.floor(Math.random() * 1_000_000_000));
    for (const id of users) await client.query("INSERT INTO users (id,email,username,name,password_hash) VALUES ($1,$2,$3,'Stars test','unusable')", [id, `${id}@stars-test.invalid`, `stars-${id}`]);
    await client.query("INSERT INTO telegram_identities (telegram_user_id,user_id) VALUES ($1,$2)", [telegramId, users[0]]);
    await client.query("INSERT INTO telegram_identities (telegram_user_id,user_id) VALUES ($1,$2)", [String(Number(telegramId) + 1), users[1]]);
    const transaction = async (callback) => {
      await client.query("SAVEPOINT stars_request");
      try { const result = await callback(client); await client.query("RELEASE SAVEPOINT stars_request"); return result; }
      catch (error) { await client.query("ROLLBACK TO SAVEPOINT stars_request"); await client.query("RELEASE SAVEPOINT stars_request"); throw error; }
    };
    const input = () => ({ packageId: "rolls-100", idempotencyKey: randomUUID(), termsVersion: ROLL_STAR_TERMS_VERSION });
    const makeOrder = (userId = users[0]) => transaction((c) => createStarOrder(c, userId, input()));
    const checkout = (order, id = randomUUID()) => ({ id, from: { id: Number(order.telegram_user_id) }, invoice_payload: `rolls:${order.id}`, currency: "XTR", total_amount: order.stars });
    const message = (order, charge = randomUUID()) => ({ from: { id: Number(order.telegram_user_id) }, successful_payment: { currency: "XTR", total_amount: order.stars, invoice_payload: `rolls:${order.id}`, telegram_payment_charge_id: charge } });
    const balance = async () => Number((await client.query("SELECT balance FROM roll_wallets WHERE user_id=$1", [users[0]])).rows[0].balance);
    const reject = async (callback, code) => assert.rejects(transaction(callback), (error) => error.code === code);
    const config = () => ({ ...getStarsConfig({}), enabled: true });

    await t.test("server prices, identity binding and idempotent order creation", async () => {
      const request = input();
      const order = await transaction((c) => createStarOrder(c, users[0], request));
      assert.equal(order.stars, 10);
      assert.equal(Number(order.rolls), 100);
      assert.equal(order.telegram_user_id, telegramId);
      assert.equal((await transaction((c) => createStarOrder(c, users[0], request))).id, order.id);
      await reject((c) => createStarOrder(c, users[0], { ...request, packageId: "rolls-500" }), "IDEMPOTENCY_CONFLICT");
      await reject((c) => createStarOrder(c, users[2], input()), "TELEGRAM_LINK_REQUIRED");
      assert.equal(await balance(), 100);
    });

    await t.test("pre-checkout rejects wrong account, currency, amount, expiry and second checkout", async () => {
      const order = await makeOrder();
      const valid = checkout(order);
      await reject((c) => approveStarCheckout(c, { ...valid, from: { id: Number(telegramId) + 1 } }), "STAR_PAYER_MISMATCH");
      await reject((c) => approveStarCheckout(c, { ...valid, currency: "TON" }), "STAR_AMOUNT_MISMATCH");
      await reject((c) => approveStarCheckout(c, { ...valid, total_amount: 1 }), "STAR_AMOUNT_MISMATCH");
      await transaction((c) => approveStarCheckout(c, valid));
      await transaction((c) => approveStarCheckout(c, valid));
      await reject((c) => approveStarCheckout(c, checkout(order)), "STAR_CHECKOUT_USED");
      assert.equal(await balance(), 100, "pre-checkout never credits rolls");
      const expired = await makeOrder();
      await client.query("UPDATE roll_star_orders SET expires_at='2000-01-01' WHERE id=$1", [expired.id]);
      await reject((c) => approveStarCheckout(c, checkout(expired)), "STAR_ORDER_EXPIRED");
    });

    await t.test("successful payment credits exactly once and appears in wallet history", async () => {
      const order = await makeOrder();
      const update = message(order);
      await reject((c) => settleStarPayment(c, update), "STAR_CHECKOUT_REQUIRED");
      await transaction((c) => approveStarCheckout(c, checkout(order)));
      await client.query("UPDATE roll_star_orders SET expires_at='2000-01-01' WHERE id=$1", [order.id]);
      const before = await balance();
      assert.equal((await transaction((c) => settleStarPayment(c, update))).replayed, false);
      assert.equal((await transaction((c) => settleStarPayment(c, update))).replayed, true);
      assert.equal(await balance(), before + 100);
      await reject((c) => settleStarPayment(c, message(order)), "STAR_CHARGE_CONFLICT");
      const wallet = await readRollWallet(client, users[0]);
      assert.equal(wallet.transactions.filter((row) => row.id === order.id).length, 1);
      assert.equal(wallet.transactions.find((row) => row.id === order.id).kind, "stars_topup");
      assert.equal(wallet.transactions.find((row) => row.id === order.id).note, "10 Telegram Stars");
      const other = await makeOrder();
      await transaction((c) => approveStarCheckout(c, checkout(other)));
      await reject((c) => settleStarPayment(c, message(other, update.successful_payment.telegram_payment_charge_id)), "STAR_CHARGE_CONFLICT");
      assert.equal(await balance(), before + 100);
    });

    await t.test("receipt and credit roll back together, then a retry settles normally", async () => {
      const order = await makeOrder();
      await transaction((c) => approveStarCheckout(c, checkout(order)));
      const update = message(order);
      const before = await balance();
      await assert.rejects(transaction(async (c) => { await settleStarPayment(c, update); throw new Error("connection lost before commit"); }), /connection lost/);
      assert.equal(await balance(), before);
      assert.equal((await client.query("SELECT paid_at FROM roll_star_orders WHERE id=$1", [order.id])).rows[0].paid_at, null);
      await transaction((c) => settleStarPayment(c, update));
      assert.equal(await balance(), before + 100);
    });

    await t.test("disabling new sales still settles previously accepted payments", async () => {
      const order = await makeOrder();
      await transaction((c) => approveStarCheckout(c, checkout(order)));
      const handler = createStarsUpdateHandler({ transaction, config: () => ({ enabled: false }) });
      const denied = await handler({ pre_checkout_query: checkout(await makeOrder()) });
      assert.equal(denied.method, "answerPreCheckoutQuery");
      assert.equal(denied.ok, false);
      assert.deepEqual(await handler({ message: message(order) }), { ok: true, paymentProcessed: true });
    });

    await t.test("HTTP invoice retry after provider failure and private order reads", async () => {
      const app = express();
      app.use(express.json());
      let queue = Promise.resolve();
      app.use("/api", (req, res, next) => {
        const previous = queue;
        queue = new Promise((resolve) => { res.once("finish", resolve); res.once("close", resolve); });
        previous.then(next);
      });
      app.get("/api/me", async (_req, res) => {
        const user = (await client.query('SELECT id,name,username,account_type AS "accountType" FROM users WHERE id=$1', [users[0]])).rows[0];
        res.json({ user });
      });
      let providerCalls = 0;
      registerRollsRoutes(app, {
        requireAuth: (req, res, next) => { if (!req.headers["x-test-user"]) return res.sendStatus(401); req.user = { id: req.headers["x-test-user"] }; next(); },
        query: (...args) => client.query(...args), transaction, starsConfig: config,
        createInvoice: async () => { if (++providerCalls === 1) throw new Error("timeout"); return "https://t.me/$test-invoice"; },
      });
      server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
      const origin = `http://127.0.0.1:${server.address().port}`;
      const request = input();
      const post = (payload) => fetch(`${origin}/api/rolls/stars/orders`, { method: "POST", headers: { "Content-Type": "application/json", "X-Test-User": users[0] }, body: JSON.stringify(payload) });
      assert.equal((await post({ ...request, stars: 1 })).status, 400);
      assert.equal((await post(request)).status, 502);
      const retry = await post(request);
      assert.equal(retry.status, 200);
      const { order } = await retry.json();
      assert.equal(order.invoiceUrl, "https://t.me/$test-invoice");
      assert.equal((await (await post(request)).json()).order.id, order.id);
      assert.equal(providerCalls, 2);
      const path = `${origin}/api/rolls/stars/orders/${order.id}`;
      assert.equal((await fetch(path)).status, 401);
      assert.equal((await fetch(path, { headers: { "X-Test-User": users[1] } })).status, 404);
      assert.equal((await fetch(path, { headers: { "X-Test-User": users[0] } })).status, 200);

      if (process.env.STARS_TEST_UI === "1") {
        app.use("/api", (_req, res) => res.sendStatus(404));
        app.use(express.static(process.cwd() + "/dist"));
        app.get("*splat", (_req, res) => res.sendFile(process.cwd() + "/dist/index.html"));
        const { chromium } = await import("playwright-core");
        const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
        try {
          await mkdir("exports/stars", { recursive: true });
          for (const [name, width, height] of [["desktop", 1440, 1100], ["mobile", 390, 844]]) {
            const context = await browser.newContext({ viewport: { width, height }, extraHTTPHeaders: { "X-Test-User": users[0] } });
            const page = await context.newPage();
            const errors = [];
            page.on("pageerror", (error) => errors.push(error.message));
            await page.route("https://telegram.org/js/telegram-web-app.js", (route) => route.fulfill({ contentType: "text/javascript", body: "" }));
            await page.goto(`${origin}/app/rolls`);
            await page.getByRole("button", { name: "Пополнить", exact: true }).click();
            const buy = page.getByRole("button", { name: "Купить за 10 Stars", exact: true });
            await buy.waitFor();
            assert.equal(await buy.isEnabled(), true);
            await page.getByRole("radio", { name: "500 роллов 50 Stars" }).check();
            assert.equal(await page.getByRole("button", { name: "Купить за 50 Stars" }).count(), 1);
            await page.getByRole("radio", { name: "100 роллов 10 Stars" }).check();
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({ path: `exports/stars/${name}-packages.png`, fullPage: true });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            const before = await balance();
            await buy.click();
            await page.getByText("К оплате 10 Stars", { exact: true }).waitFor();
            const saved = await page.evaluate((userId) => JSON.parse(sessionStorage.getItem(`rollapp:stars-order:${userId}`)), users[0]);
            assert(saved.orderId);
            // Reload restores the saved order without issuing another invoice.
            const calls = providerCalls;
            await page.reload();
            await page.getByRole("button", { name: "Пополнить", exact: true }).click();
            await page.getByText("К оплате 10 Stars", { exact: true }).waitFor();
            assert.equal(providerCalls, calls);
            await page.evaluate(() => { window.Telegram = { WebApp: { initData: "ui-test-only", openInvoice: (_url, callback) => callback("paid") } }; });
            // Trigger a render to reveal Mini App payment button.
            await page.getByRole("button", { name: "Проверить оплату" }).click();
            await page.getByRole("button", { name: "Оплатить в Telegram", exact: true }).click();
            assert.equal(await balance(), before, "a forged browser callback must not credit rolls");
            const row = (await client.query("SELECT * FROM roll_star_orders WHERE id=$1", [saved.orderId])).rows[0];
            await transaction((c) => approveStarCheckout(c, checkout(row)));
            const receipt = message(row);
            await transaction((c) => settleStarPayment(c, receipt));
            await transaction((c) => settleStarPayment(c, receipt));
            await page.getByRole("button", { name: "Проверить оплату" }).click();
            await page.getByText("100 роллов зачислено", { exact: true }).waitFor();
            assert.equal(await balance(), before + 100);
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({ path: `exports/stars/${name}-paid.png`, fullPage: true });
            await page.getByRole("button", { name: "Вернуться к кошельку", exact: true }).click();
            await page.locator('[data-rolls-transaction="stars_topup"]').first().waitFor();
            assert.deepEqual(errors, []);
            await context.close();
          }
        } finally { await browser.close(); }
      }
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await client.query("ROLLBACK");
    client.release();
    await db.pool.end();
  }
});
