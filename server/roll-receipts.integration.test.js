import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import { refundRollPurchase } from "./modules/checkout/roll-purchases.js";
import { readRollReceipt } from "./modules/history/roll-receipts.js";
import { issueGiftCard, changeGiftCard, recordGiftEvent } from "./modules/loyalty/gift-cards.js";
import { registerRollsRoutes } from "./modules/payments/rolls-routes.js";
import { ensureRollWallet, transferRolls } from "./modules/payments/rolls.js";

async function checkReceipts(db) {
  const client = await db.pool.connect();
  const [buyer, seller, other] = Array.from({ length: 3 }, () => randomUUID());
  const receipt = (userId, kind, id) => readRollReceipt(client, userId, { kind, id });
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    for (const [id, name, type] of [[buyer, "Buyer", "personal"], [seller, "Seller", "business"], [other, "Other", "personal"]]) {
      await client.query(`INSERT INTO users(id,email,username,name,password_hash,account_type)
        VALUES ($1,$2,$3,$4,'unusable',$5)`, [id, `${id}@rolls-test.invalid`, name + id, name, type]);
      await ensureRollWallet(client, id);
    }
    const { id } = await transferRolls(client, buyer, { recipientId: seller, amount: 28, note: "private memo", idempotencyKey: randomUUID() });
    const outgoing = await receipt(buyer, "transfer", id);
    const incoming = await receipt(seller, "transfer", id);
    assert.equal(outgoing.id, incoming.id);
    assert.equal(outgoing.amount, "28");
    assert.equal(incoming.amount, outgoing.amount);
    assert.deepEqual([outgoing.direction, incoming.direction], ["outgoing", "incoming"]);
    assert.deepEqual([outgoing.participant.name, incoming.participant.name], ["Seller", "Buyer"]);
    assert.equal(await receipt(other, "transfer", id), null);
    assert.equal(await receipt(buyer, "purchase", id), null);
    assert(!JSON.stringify(outgoing).includes("private memo"));

    const ordinary = randomUUID();
    const delivery = { point: { city: "Address not for export", phone: "+79999999999" } };
    await client.query(`INSERT INTO roll_store_purchases(id,user_id,product_id,product_title,amount,idempotency_key,delivery)
      VALUES($1,$2,'cat:blue','Stored item',20,$1,$3)`, [ordinary, buyer, delivery]);
    await client.query("UPDATE roll_wallets SET balance=balance-20 WHERE user_id=$1", [buyer]);
    const order = await receipt(buyer, "order", ordinary);
    assert.equal(order.status, "placed");
    assert.equal(order.source, "wallet");
    assert.equal(order.subject, "Stored item");
    assert(!JSON.stringify(order).includes("Address not for export"));
    assert.equal((await receipt(buyer, "purchase", `purchase:${ordinary}`)).orderId, ordinary);
    assert.equal(await receipt(other, "order", ordinary), null);
    await refundRollPurchase(client, buyer, ordinary);
    const fundedBack = await receipt(buyer, "order", ordinary);
    assert(fundedBack.closedAt);
    assert.equal(fundedBack.status, "refunded");
    const returned = await receipt(buyer, "refund", `refund:${ordinary}`);
    assert.equal(returned.direction, "incoming");
    assert.equal(returned.amount, "20");
    assert.equal(returned.orderId, ordinary);

    const card = await issueGiftCard(client, buyer, { businessId: seller, idempotencyKey: randomUUID() });
    await changeGiftCard(client, buyer, card.id, "topup", { amount: 20, idempotencyKey: randomUUID() });
    const giftOrder = randomUUID();
    await client.query("UPDATE business_gift_cards SET balance=balance-12 WHERE id=$1", [card.id]);
    await recordGiftEvent(client, { id: giftOrder, cardId: card.id, userId: buyer, kind: "spend", amount: 12,
      requestKey: randomUUID(), purchase: { productId: "business:stored", productTitle: "Card item", delivery: { giftCardId: card.id } } });
    assert.equal((await receipt(buyer, "order", giftOrder)).source, "gift");
    await changeGiftCard(client, buyer, card.id, "send", { recipientId: other, idempotencyKey: randomUUID() });
    await refundRollPurchase(client, buyer, giftOrder);
    const cardReturn = await receipt(buyer, "order", giftOrder);
    assert.equal(cardReturn.status, "refunded");
    assert.equal(cardReturn.source, "gift");
    assert.equal(cardReturn.amount, "12");
    assert(!JSON.stringify(cardReturn).includes(card.id));
    assert.equal(await receipt(other, "order", giftOrder), null);

    const starsId = randomUUID();
    const tonId = randomUUID();
    await client.query(`INSERT INTO roll_star_orders(id,user_id,telegram_user_id,package_id,rolls,stars,idempotency_key,terms_version,paid_at,telegram_payment_charge_id)
      VALUES ($1,$2,'123456','fixture',30,10,$1,'fixture',transaction_timestamp(),$1)`, [starsId, buyer]);
    await client.query(`INSERT INTO roll_ton_orders(id,user_id,sender,recipient,chain,rolls,nanotons,rate,idempotency_key,paid_at,transaction_hash)
      VALUES ($1::text,$2,'fixture-sender','fixture-recipient','-239',40,1250000000,10,$1::text::uuid,transaction_timestamp(),$1)`, [tonId, buyer]);
    await client.query("UPDATE roll_wallets SET balance=balance+70 WHERE user_id=$1", [buyer]);
    assert.equal((await receipt(buyer, "stars_topup", starsId)).paidWith, "10 Telegram Stars");
    assert.equal((await receipt(buyer, "ton_topup", tonId)).paidWith, "1,25 TON");
    assert.equal(await receipt(other, "ton_topup", tonId), null);
  } finally {
    try { await client.query("ROLLBACK"); } finally { client.release(); }
  }
}

async function checkHttpReceipts(db) {
  const { rows: [welcome] } = await db.query("SELECT id,recipient_id FROM roll_transactions WHERE kind='welcome' ORDER BY id LIMIT 1");
  assert(welcome, "At least one existing welcome posting is required to verify the read-only HTTP path");
  const outsider = randomUUID();
  const app = express();
  registerRollsRoutes(app, {
    requireAuth(req, res, next) {
      const owner = req.get("x-test-principal");
      if (owner !== welcome.recipient_id && owner !== outsider) return res.sendStatus(401);
      req.user = { id: owner };
      next();
    },
    query: db.query, transaction: db.transaction,
  });
  const server = await new Promise(resolve => { const handle = app.listen(0, "127.0.0.1", () => resolve(handle)); });
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/rolls/receipts`;
    const headers = { "x-test-principal": welcome.recipient_id };
    const allowed = await fetch(`${url}/welcome/${encodeURIComponent(welcome.id)}`, { headers });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("cache-control"), "private, no-store");
    const { receipt } = await allowed.json();
    assert.equal(receipt.amount, "100");
    assert.equal(receipt.id, welcome.id);
    assert.equal(receipt.currency, "rolls");
    assert.deepEqual(Object.keys(receipt).sort(), [
      "amount", "createdAt", "currency", "direction", "id", "kind", "orderId", "participant", "purpose", "status", "subject", "version",
    ]);
    assert.equal((await fetch(`${url}/welcome/${encodeURIComponent(welcome.id)}`)).status, 401);
    assert.equal((await fetch(`${url}/welcome/${encodeURIComponent(welcome.id)}?owner=${headers["x-test-principal"]}`, {
      headers: { "x-test-principal": outsider },
    })).status, 404);
    assert.equal((await fetch(`${url}/welcome/%00`, { headers })).status, 400);
    assert.equal((await fetch(`${url}/balance/foo`, { headers })).status, 400);
    assert.equal((await db.query("SELECT 1 FROM roll_wallets WHERE user_id=$1", [outsider])).rowCount, 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test("private roll receipts with rollback-only fixtures on the configured PostgreSQL", { skip: process.env.ROLLAPP_TEST_ROLL_RECEIPTS !== "1" }, async (t) => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  try {
    await t.test("both transfer directions, durable order status and gift-card return", () => checkReceipts(db));
    await t.test("HTTP identity, cache, validation and no wallet creation", () => checkHttpReceipts(db));
  } finally { await db.pool.end(); }
});
