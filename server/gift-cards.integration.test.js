import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { changeGiftCard, issueGiftCard, listGiftCards } from "./gift-cards.js";
import { purchaseBusinessMarketplaceItem } from "./business-marketplace.js";
import { readRollOrders, readRollWallet, refundRollPurchase } from "./rolls.js";

test("production gift-card lifecycle is atomic, scoped, replayable and rollback-only", { skip: process.env.ROLLAPP_TEST_GIFT_CARDS !== "1" }, async () => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='3s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    const schema = await client.query("SELECT to_regclass('business_gift_cards')::text AS cards,to_regclass('business_gift_card_events')::text AS events");
    assert(schema.rows[0].cards && schema.rows[0].events, "Apply the separately authorized migration before running this test");
    const [sender, recipient, onward, business, otherBusiness] = Array.from({ length: 5 }, () => randomUUID());
    for (const id of [sender, recipient, onward, business, otherBusiness]) {
      await client.query("INSERT INTO users(id,email,username,name,password_hash,account_type) VALUES($1,$2,$3,'Rollback-only gift test','unused',$4)", [id, `${id}@invalid.test`, `gift_${id.replaceAll("-", "")}`, [business, otherBusiness].includes(id) ? "business" : "personal"]);
    }
    const issue = { businessId: business, idempotencyKey: randomUUID() };
    const card = await issueGiftCard(client, sender, issue);
    const assertConserved = async () => {
      const { rows: [totals] } = await client.query(`SELECT
        (SELECT coalesce(sum(balance),0) FROM roll_wallets WHERE user_id=ANY($1::text[])) AS ordinary,
        (SELECT balance FROM business_gift_cards WHERE id=$2) AS card,
        (SELECT coalesce(sum(amount),0) FROM roll_transactions WHERE kind='welcome' AND recipient_id=ANY($1::text[])) AS issued,
        ((SELECT coalesce(sum(amount),0) FROM roll_store_purchases WHERE user_id=ANY($1::text[]) AND refunded_at IS NULL AND delivery->>'giftCardId' IS NULL)
         + (SELECT coalesce(sum(CASE kind WHEN 'spend' THEN amount WHEN 'refund' THEN -amount ELSE 0 END),0) FROM business_gift_card_events WHERE card_id=$2)) AS spent,
        (SELECT coalesce(sum(CASE kind WHEN 'topup' THEN amount WHEN 'refund' THEN amount WHEN 'spend' THEN -amount ELSE 0 END),0) FROM business_gift_card_events WHERE card_id=$2) AS card_ledger`,
      [[sender, recipient, onward, business, otherBusiness], card.id]);
      assert.equal(BigInt(totals.ordinary) + BigInt(totals.card), BigInt(totals.issued) - BigInt(totals.spent));
      assert.equal(BigInt(totals.card), BigInt(totals.card_ledger));
    };
    assert.equal((await issueGiftCard(client, sender, issue)).id, card.id);
    const topup = { amount: 50, idempotencyKey: randomUUID() };
    await changeGiftCard(client, sender, card.id, "topup", topup);
    assert.equal((await changeGiftCard(client, sender, card.id, "topup", topup)).replayed, true);
    assert.equal(Number((await client.query("SELECT balance FROM roll_wallets WHERE user_id=$1", [sender])).rows[0].balance), 50);
    const sourceWallet = await readRollWallet(client, sender);
    assert.equal(sourceWallet.balance, 50);
    const topups = sourceWallet.transactions.filter((entry) => entry.kind === "gift_topup");
    assert.equal(topups.length, 1);
    assert.equal(topups[0].direction, "outgoing");
    assert.equal(topups[0].amount, 50);
    assert.equal(topups[0].note, "Rollback-only gift test");
    const send = { recipientId: recipient, idempotencyKey: randomUUID() };
    await changeGiftCard(client, sender, card.id, "send", send);
    assert.equal((await changeGiftCard(client, sender, card.id, "send", send)).replayed, true);
    assert.equal((await listGiftCards(client.query.bind(client), sender)).length, 0);
    assert.equal((await listGiftCards(client.query.bind(client), recipient))[0].balance, 50);
    await assert.rejects(changeGiftCard(client, sender, card.id, "topup", { amount: 1, idempotencyKey: randomUUID() }), { code: "GIFT_CARD_NOT_FOUND" });
    const [offer, wrongOffer] = [randomUUID(), randomUUID()];
    for (const [id, merchant] of [[offer, business], [wrongOffer, otherBusiness]]) await client.query("INSERT INTO business_marketplace_items(id,business_user_id,sphere,kind,title,price_rolls) VALUES($1,$2,'career','store','Rollback offer',20)", [id, merchant]);
    await assert.rejects(purchaseBusinessMarketplaceItem(client, recipient, "career", { itemId: wrongOffer, giftCardId: card.id, idempotencyKey: randomUUID() }), { code: "GIFT_CARD_BUSINESS_MISMATCH" });
    const pay = { itemId: offer, giftCardId: card.id, idempotencyKey: randomUUID() };
    const purchase = await purchaseBusinessMarketplaceItem(client, recipient, "career", pay);
    assert.equal(purchase.balance, 100);
    await assertConserved();
    // The deployed legacy refund handler reads only this ledger. Keeping gift
    // payments out of it prevents conversion to ordinary rolls via an old API.
    assert.equal((await client.query("SELECT id FROM roll_store_purchases WHERE id=$1 AND user_id=$2", [purchase.id, recipient])).rowCount, 0);
    const placed = (await readRollOrders(client, recipient)).orders.find((order) => order.id === purchase.id);
    assert.equal(placed.delivery.giftCardId, card.id);
    assert.equal(placed.status, "placed");
    const ordinary = await purchaseBusinessMarketplaceItem(client, recipient, "career", { itemId: wrongOffer, idempotencyKey: randomUUID() });
    assert.equal(ordinary.balance, 80);
    await assertConserved();
    assert.equal((await client.query("SELECT id FROM roll_store_purchases WHERE id=$1 AND user_id=$2", [ordinary.id, recipient])).rowCount, 1);
    assert.equal((await refundRollPurchase(client, recipient, ordinary.id)).balance, 100);
    assert.equal((await refundRollPurchase(client, recipient, ordinary.id)).replayed, true);
    await assertConserved();
    // Lost responses remain replayable after the offer changes or is withdrawn.
    await client.query("UPDATE business_marketplace_items SET active=FALSE,price_rolls=30 WHERE id=$1", [offer]);
    assert.equal((await purchaseBusinessMarketplaceItem(client, recipient, "career", pay)).replayed, true);
    assert.equal((await listGiftCards(client.query.bind(client), recipient))[0].balance, 30);
    await changeGiftCard(client, recipient, card.id, "send", { recipientId: onward, idempotencyKey: randomUUID() });
    const refund = await refundRollPurchase(client, recipient, purchase.id);
    assert.equal(refund.balance, 100);
    assert.equal((await listGiftCards(client.query.bind(client), onward))[0].balance, 50);
    assert.equal((await refundRollPurchase(client, recipient, purchase.id)).replayed, true);
    await assertConserved();
    assert.equal((await readRollOrders(client, recipient)).orders.find((order) => order.id === purchase.id).status, "refunded");
    assert.equal((await readRollOrders(client, onward)).orders.length, 0);
    assert.equal(Number((await client.query("SELECT count(*) AS count FROM business_gift_card_events WHERE card_id=$1", [card.id])).rows[0].count), 5);
  } finally {
    await client.query("ROLLBACK"); client.release(); await db.pool.end();
  }
});
