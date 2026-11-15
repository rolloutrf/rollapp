import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import { purchaseBusinessMarketplaceItem, readBusinessPurchaseStatus, registerBusinessMarketplaceRoutes } from "./modules/catalog-marketplace/business-marketplace.js";
import { purchaseWithRolls, readCatPurchaseStatus, refundRollPurchase } from "./modules/checkout/roll-purchases.js";
import { changeGiftCard, issueGiftCard } from "./modules/loyalty/gift-cards.js";
import { grantRolls } from "./modules/loyalty/roll-rewards.js";
import { ensureRollWallet } from "./modules/payments/rolls.js";
import { registerRollsRoutes } from "./modules/payments/rolls-routes.js";

async function checkSources(db) {
  const client = await db.pool.connect();
  const [buyer, seller, other, itemId] = Array.from({ length: 4 }, () => randomUUID());
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    for (const [id, accountType] of [[buyer, "personal"], [seller, "business"], [other, "personal"]]) {
      await client.query(`INSERT INTO users(id,email,username,name,password_hash,account_type)
        VALUES ($1,$2,$3,'Checkout verification','unusable',$4)`, [id, `${id}@checkout-test.invalid`, `checkout-${id}`, accountType]);
      await ensureRollWallet(client, id);
    }
    await grantRolls(client, buyer, { amount: 2000, reason: "Checkout test", idempotencyKey: randomUUID() });
    await client.query(`INSERT INTO business_marketplace_items(id,business_user_id,sphere,kind,title,price_rolls)
      VALUES($1,$2,'career','store','Услуга',40)`, [itemId, seller]);
    const snapshot = async () => (await client.query(`SELECT (SELECT balance::text FROM roll_wallets WHERE user_id=$1) AS balance,
      (SELECT count(*)::int FROM roll_store_purchases WHERE user_id=$1) AS orders,
      (SELECT count(*)::int FROM business_gift_card_events WHERE actor_id=$1 AND kind='spend') AS card_orders`, [buyer])).rows[0];
    const params = { itemId, expectedPrice: 40, idempotencyKey: randomUUID() };
    const check = (key, userId = buyer, sphere = "career") => readBusinessPurchaseStatus(client, userId, sphere, key);
    const before = await snapshot();
    assert.equal(await check(params.idempotencyKey), null);
    assert.deepEqual(await snapshot(), before);
    const walletOrder = await purchaseBusinessMarketplaceItem(client, buyer, "career", params);
    const walletStatus = await check(params.idempotencyKey);
    assert.deepEqual(walletStatus, { id: walletOrder.id, itemId, sphere: "career", amount: 40, giftCardId: null, status: "placed", protected: false });
    assert.equal(await check(params.idempotencyKey, seller), null);
    await assert.rejects(check(params.idempotencyKey, buyer, "health"), { code: "IDEMPOTENCY_CONFLICT" });
    await assert.rejects(purchaseBusinessMarketplaceItem(client, buyer, "career", { ...params, expectedPrice: 41 }), { code: "IDEMPOTENCY_CONFLICT" });
    assert.equal((await snapshot()).orders, 1);

    const card = await issueGiftCard(client, buyer, { businessId: seller, idempotencyKey: randomUUID() });
    await changeGiftCard(client, buyer, card.id, "topup", { amount: 70, idempotencyKey: randomUUID() });
    const giftParams = { ...params, idempotencyKey: randomUUID(), giftCardId: card.id };
    const giftOrder = await purchaseBusinessMarketplaceItem(client, buyer, "career", giftParams);
    const cardSnapshot = await snapshot();
    assert.equal((await check(giftParams.idempotencyKey)).giftCardId, card.id);
    assert.equal((await check(giftParams.idempotencyKey)).id, giftOrder.id);
    await assert.rejects(purchaseBusinessMarketplaceItem(client, buyer, "career", { ...giftParams, giftCardId: undefined }), { code: "IDEMPOTENCY_CONFLICT" });
    await assert.rejects(purchaseBusinessMarketplaceItem(client, buyer, "career", { ...giftParams, expectedPrice: 39 }), { code: "IDEMPOTENCY_CONFLICT" });
    assert.deepEqual(await snapshot(), cardSnapshot);
    await changeGiftCard(client, buyer, card.id, "send", { recipientId: other, idempotencyKey: randomUUID() });
    await refundRollPurchase(client, buyer, giftOrder.id);
    assert.equal((await check(giftParams.idempotencyKey)).status, "refunded");
    assert.equal(await check(giftParams.idempotencyKey, other), null);
    assert.equal((await client.query("SELECT balance::text FROM business_gift_cards WHERE id=$1", [card.id])).rows[0].balance, "70");

    const { rows: [point] } = await client.query(`SELECT point->>'code' AS code FROM cdek_catalog,jsonb_array_elements(points) point
      WHERE id='ru' AND synced_at>=CURRENT_TIMESTAMP-INTERVAL '7 days' ORDER BY code LIMIT 1`);
    assert(point, "An active production CDEK point is required");
    const catParams = { productId: "cat:red", pickupPointCode: point.code, idempotencyKey: randomUUID() };
    assert.equal(await readCatPurchaseStatus(client, buyer, catParams.idempotencyKey), null);
    const catOrder = await purchaseWithRolls(client, buyer, catParams);
    const cat = await readCatPurchaseStatus(client, buyer, catParams.idempotencyKey);
    assert.equal(cat.id, catOrder.id);
    assert.equal(cat.delivery.point.code, point.code);
    assert.equal(cat.amount, 1000);
    assert.equal(cat.status, "placed");
    assert.equal(await readCatPurchaseStatus(client, other, catParams.idempotencyKey), null);
    await assert.rejects(readCatPurchaseStatus(client, buyer, params.idempotencyKey), { code: "IDEMPOTENCY_CONFLICT" });
    await refundRollPurchase(client, buyer, catOrder.id);
    assert.equal((await readCatPurchaseStatus(client, buyer, catParams.idempotencyKey)).status, "refunded");
  } finally { try { await client.query("ROLLBACK"); } finally { client.release(); } }
}

async function checkHttp(db) {
  const id = randomUUID();
  const app = express();
  const deps = {
    requireAuth(req, res, next) {
      if (req.get("x-test-user") !== id) return res.sendStatus(401);
      req.user = { id };
      next();
    },
    query: db.query, transaction: db.transaction,
  };
  registerRollsRoutes(app, deps);
  registerBusinessMarketplaceRoutes(app, deps);
  const server = await new Promise(resolve => { const handle = app.listen(0, "127.0.0.1", () => resolve(handle)); });
  try {
    const origin = `http://127.0.0.1:${server.address().port}/api`;
    const headers = { "x-test-user": id };
    for (const path of ["/rolls/purchases", "/business-marketplace/career/purchases"]) {
      const key = randomUUID();
      assert.equal((await fetch(`${origin}${path}/${key}`)).status, 401);
      assert.equal((await fetch(`${origin}${path}/bad-key`, { headers })).status, 400);
      const response = await fetch(`${origin}${path}/${key}?buyerId=other`, { headers });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.deepEqual(await response.json(), { purchase: null });
    }
    assert.equal((await db.query("SELECT 1 FROM roll_wallets WHERE user_id=$1", [id])).rowCount, 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test("purchase recovery using existing PostgreSQL, with every test write rolled back", { skip: process.env.ROLLAPP_TEST_CHECKOUT_RECOVERY !== "1" }, async (t) => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  try {
    await t.test("lookup of wallet, gift card and CDEK purchases and their refunds", () => checkSources(db));
    await t.test("HTTP validation and authenticated reads never create a wallet", () => checkHttp(db));
  } finally { await db.pool.end(); }
});
