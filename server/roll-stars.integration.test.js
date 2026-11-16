import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import express from "express";
import { mkdir } from "node:fs/promises";
import { createStarOrder, approveStarCheckout, settleStarPayment, createStarsUpdateHandler, getStarsConfig } from "./modules/payments/roll-stars.js";
import { readRollWallet } from "./modules/history/wallet-history.js";
import { ROLL_STAR_TERMS_VERSION } from "../shared/modules/payments/roll-stars.js";
import { registerRollsRoutes } from "./modules/payments/rolls-routes.js";
import { registerStarInvoiceWorkerRoutes } from "./modules/payments/star-invoice-worker-routes.js";

test("Stars orders on production PostgreSQL; existing schema, all fixtures rolled back", { skip: process.env.ROLLAPP_TEST_STARS !== "1" }, async (t) => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  const client = await db.pool.connect();
  let server;
  try {
    await t.test("request lookup runs inside a real production READ ONLY transaction", async () => {
      const actor = randomUUID();
      const app = express();
      let readOnly;
      registerRollsRoutes(app, {
        requireAuth: (req, _res, next) => { req.user = { id: actor }; next(); },
        query: () => { throw new Error("Order lookup must use the read-only transaction"); },
        starsConfig: () => ({ enabled: false }),
        createInvoice: () => { throw new Error("Order lookup must not use Telegram"); },
        transaction: async (callback) => {
          await client.query("BEGIN");
          try {
            const result = await callback(client);
            readOnly = (await client.query("SHOW transaction_read_only")).rows[0].transaction_read_only;
            return result;
          } finally { await client.query("ROLLBACK"); }
        },
      });
      const listener = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
      try {
        const response = await fetch(`http://127.0.0.1:${listener.address().port}/api/rolls/stars/orders/by-request/${randomUUID()}`);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("cache-control"), "private, no-store");
        assert.deepEqual(await response.json(), { order: null });
        assert.equal(readOnly, "on");
      } finally {
        await new Promise((resolve) => listener.close(resolve));
      }
    });

    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='10s'");
    await client.query("SELECT package_id,terms_version,idempotency_key,invoice_url FROM roll_star_orders LIMIT 0");
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
    let invoiceDelivery = "direct";
    let salesEnabled = true;
    const config = () => ({ ...getStarsConfig({}), enabled: salesEnabled, invoiceDelivery });

    await t.test("server prices, identity binding and idempotent order creation", async () => {
      const request = input();
      const order = await transaction((c) => createStarOrder(c, users[0], request));
      assert.equal(order.stars, 10);
      assert.equal(Number(order.rolls), 100);
      assert.equal(order.telegram_user_id, telegramId);
      assert.equal((await transaction((c) => createStarOrder(c, users[0], request))).id, order.id);
      await reject((c) => createStarOrder(c, users[0], { ...request, packageId: "rolls-500" }), "IDEMPOTENCY_CONFLICT");
      await reject((c) => createStarOrder(c, users[0], { ...request, termsVersion: "previous" }), "IDEMPOTENCY_CONFLICT");
      await reject((c) => createStarOrder(c, users[0], { ...input(), termsVersion: "previous" }), "INVALID_STAR_ORDER");
      await client.query("UPDATE roll_star_orders SET terms_version=$2 WHERE id=$1", [order.id, "previous"]);
      assert.equal((await transaction((c) => createStarOrder(c, users[0], { ...request, termsVersion: "previous" }))).id, order.id);
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

    await t.test("authenticated worker delivers once without crediting the wallet", async () => {
      const app = express();
      app.use(express.json());
      registerStarInvoiceWorkerRoutes(app, {
        query: (...args) => client.query(...args),
        starsConfig: () => ({ enabled: true, invoiceDelivery: "worker" }),
        botConfig: () => ({ webhookEnabled: true, webhookSecret: "test-worker-secret" }),
      });
      const listener = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
      try {
        const base = `http://127.0.0.1:${listener.address().port}/api/telegram/star-invoices`;
        const headers = { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "test-worker-secret" };
        assert.equal((await fetch(base)).status, 401);
        const queue = await (await fetch(base, { headers })).json();
        assert(queue.orders.every((entry) => Object.keys(entry).sort().join() === "id,rolls,stars"));
        const order = await makeOrder();
        const before = await balance();
        const post = (invoiceUrl, auth = headers) => fetch(`${base}/${order.id}`, { method: "POST", headers: auth, body: JSON.stringify({ invoiceUrl }) });
        assert.equal((await post("https://t.me/$test", { "Content-Type": "application/json" })).status, 401);
        assert.equal((await post("https://attacker.example")).status, 400);
        assert.equal((await post("https://t.me/$first")).status, 200);
        assert.equal((await post("https://t.me/$second")).status, 200);
        const stored = (await client.query("SELECT invoice_url,paid_at,checkout_query_id FROM roll_star_orders WHERE id=$1", [order.id])).rows[0];
        assert.deepEqual(stored, { invoice_url: "https://t.me/$first", paid_at: null, checkout_query_id: null });
        assert.equal(await balance(), before);
        await client.query("UPDATE roll_star_orders SET expires_at='2000-01-01' WHERE id=$1", [order.id]);
        assert.equal((await post("https://t.me/$third")).status, 409);
      } finally { await new Promise((resolve) => listener.close(resolve)); }
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
      let readOnlyRequests = 0;
      registerRollsRoutes(app, {
        requireAuth: (req, res, next) => { if (!req.headers["x-test-user"]) return res.sendStatus(401); req.user = { id: req.headers["x-test-user"] }; next(); },
        query: (...args) => client.query(...args), starsConfig: config,
        transaction: (callback) => transaction((connection) => callback({ query: (sql, params) => {
          // Test actors are uncommitted at this outer transaction. A separate
          // test below exercises the same route in a real READ ONLY transaction.
          if (sql === "SET TRANSACTION READ ONLY") { readOnlyRequests += 1; return; }
          return connection.query(sql, params);
        } })),
        createInvoice: async () => { if (++providerCalls === 1) throw new Error("timeout"); return "https://t.me/$test-invoice"; },
      });
      server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
      const origin = `http://127.0.0.1:${server.address().port}`;
      const request = input();
      const post = (payload) => fetch(`${origin}/api/rolls/stars/orders`, { method: "POST", headers: { "Content-Type": "application/json", "X-Test-User": users[0] }, body: JSON.stringify(payload) });
      const auth = { "X-Test-User": users[0] };
      const lookup = `${origin}/api/rolls/stars/orders/by-request/${request.idempotencyKey}`;
      assert.equal((await fetch(lookup)).status, 401);
      assert.deepEqual(await (await fetch(lookup, { headers: auth })).json(), { order: null });
      assert.equal((await post({ ...request, stars: 1 })).status, 400);
      assert.equal((await post(request)).status, 502);
      const found = await fetch(lookup, { headers: auth });
      assert.equal(found.headers.get("cache-control"), "private, no-store");
      const { order: waiting } = await found.json();
      assert.equal(waiting.status, "pending");
      assert.equal(waiting.packageId, request.packageId);
      assert.equal(waiting.termsVersion, request.termsVersion);
      assert.equal(waiting.invoiceUrl, null);
      assert.equal(providerCalls, 1, "checking the order must not try to create an invoice");
      assert.equal((await client.query("SELECT COUNT(*)::int AS count FROM roll_star_orders WHERE user_id=$1 AND idempotency_key=$2", [users[0], request.idempotencyKey])).rows[0].count, 1);
      const outsider = await fetch(lookup, { headers: { "X-Test-User": users[2] } });
      assert.deepEqual(await outsider.json(), { order: null });
      assert.equal((await client.query("SELECT 1 FROM roll_wallets WHERE user_id=$1", [users[2]])).rowCount, 0);
      assert.equal(readOnlyRequests, 3);
      const retry = await post(request);
      assert.equal(retry.status, 200);
      const { order } = await retry.json();
      assert.equal(order.invoiceUrl, "https://t.me/$test-invoice");
      assert.equal(order.id, waiting.id);
      assert.equal((await (await post(request)).json()).order.id, order.id);
      assert.equal(providerCalls, 2);
      const path = `${origin}/api/rolls/stars/orders/${order.id}`;
      assert.equal((await fetch(path)).status, 401);
      assert.equal((await fetch(path, { headers: { "X-Test-User": users[1] } })).status, 404);
      assert.equal((await fetch(path, { headers: { "X-Test-User": users[0] } })).status, 200);

      const payable = await makeOrder();
      const payableLookup = `${origin}/api/rolls/stars/orders/by-request/${payable.idempotency_key}`;
      await transaction((c) => approveStarCheckout(c, checkout(payable)));
      salesEnabled = false;
      try {
        assert.equal((await post(input())).status, 503);
        assert.equal((await (await fetch(payableLookup, { headers: auth })).json()).order.status, "processing");
        const beforePayment = await balance();
        const received = message(payable);
        const handler = createStarsUpdateHandler({ transaction, config });
        await handler({ message: received });
        await handler({ message: received });
        const paid = (await (await fetch(payableLookup, { headers: auth })).json()).order;
        assert.equal(paid.status, "paid");
        assert.equal(paid.id, payable.id);
        assert.equal(paid.telegram_user_id, undefined);
        assert.equal(paid.telegram_payment_charge_id, undefined);
        assert.equal(await balance(), beforePayment + Number(payable.rolls));
      } finally { salesEnabled = true; }

      invoiceDelivery = "worker";
      try {
        const workerRequest = input();
        const calls = providerCalls;
        const pending = (await (await post(workerRequest)).json()).order;
        assert.equal(pending.status, "pending");
        assert.equal(pending.invoiceUrl, null);
        assert.equal((await (await post(workerRequest)).json()).order.id, pending.id);
        assert.equal(providerCalls, calls, "external mode never calls Telegram from the VM");
      } finally { invoiceDelivery = "direct"; }

      if (process.env.STARS_TEST_UI === "1") {
        app.use("/api", (_req, res) => res.sendStatus(404));
        const dist = fileURLToPath(new URL("../dist/", import.meta.url));
        app.use(express.static(dist));
        app.get("*splat", (_req, res) => res.sendFile("index.html", { root: dist }));
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
            await page.getByRole("button", { name: "Пополнить баланс", exact: true }).click();
            const buy = page.getByRole("button", { name: "Купить за 10 Stars", exact: true });
            await buy.waitFor();
            assert.equal(await buy.isEnabled(), true);
            await page.getByRole("radio", { name: "500 роллов 50 Stars" }).click();
            assert.equal(await page.getByRole("button", { name: "Купить за 50 Stars" }).count(), 1);
            await page.getByRole("radio", { name: "100 роллов 10 Stars" }).click();
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
            await page.getByRole("button", { name: "Открыть счёт Stars", exact: true }).click();
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
            await page.getByText("Зачислено 100 роллов.", { exact: true }).waitFor();
            assert.equal(await balance(), before + 100);
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({ path: `exports/stars/${name}-paid.png`, fullPage: true });
            await page.getByRole("button", { name: "К кошельку", exact: true }).click();
            await page.getByText("Пополнение через Telegram Stars").first().waitFor();
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
