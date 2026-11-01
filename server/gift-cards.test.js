import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { changeGiftCard, giftIssueSchema, giftSendSchema, giftTopupSchema, issueGiftCard } from "./gift-cards.js";
import { purchaseBusinessMarketplaceItem } from "./business-marketplace.js";
import { refundRollPurchase } from "./rolls.js";

const result = (rows = []) => ({ rows, rowCount: rows.length });
// SQL-boundary unit tests; no database, schema initialization or balance writes.
function clientFor(handler) {
  const statements = [];
  return { statements, async query(sql, params) {
    statements.push({ sql, params });
    if (sql.startsWith("INSERT INTO roll_wallets") || sql.startsWith("SELECT user_id FROM roll_wallets") || sql.includes("VALUES ($1,'welcome'")) return result();
    if (sql.includes("to_regclass('business_gift_card_events')")) return result([{ events: "business_gift_card_events" }]);
    return handler(sql, params);
  } };
}

test("gift inputs reject fractional, negative, excessive amounts and client-supplied ownership", () => {
  const idempotencyKey = randomUUID();
  for (const amount of [0, -1, 1.2, NaN, Infinity, 1000000001, "10"]) assert.equal(giftTopupSchema.safeParse({ amount, idempotencyKey }).success, false);
  assert.equal(giftTopupSchema.safeParse({ amount: 1, idempotencyKey }).success, true);
  assert.equal(giftIssueSchema.safeParse({ businessId: "business", ownerId: "victim", idempotencyKey }).success, false);
  assert.equal(giftSendSchema.safeParse({ recipientId: "friend", amount: 1, idempotencyKey }).success, false);
});

test("only an existing business can issue a card", async () => {
  const client = clientFor(() => result());
  await assert.rejects(issueGiftCard(client, "owner", { businessId: "personal", idempotencyKey: randomUUID() }), { code: "BUSINESS_NOT_FOUND" });
  assert.equal(client.statements.length, 1);
});

test("replaying a send succeeds after ownership has moved without another mutation", async () => {
  const idempotencyKey = randomUUID();
  const client = clientFor((sql) => {
    assert(sql.includes("FROM business_gift_card_events"));
    return result([{ card_id: "card", kind: "send", amount: 0, recipient_id: "friend" }]);
  });
  assert.equal((await changeGiftCard(client, "owner", "card", "send", { recipientId: "friend", idempotencyKey })).replayed, true);
  assert(!client.statements.some(({ sql }) => sql.startsWith("UPDATE")));
});

test("a retry cannot change its card, amount, kind or recipient", async () => {
  const client = clientFor(() => result([{ card_id: "card", kind: "topup", amount: 20, recipient_id: null }]));
  await assert.rejects(changeGiftCard(client, "owner", "other", "topup", { amount: 20, idempotencyKey: randomUUID() }), { code: "IDEMPOTENCY_CONFLICT" });
});

test("a former owner cannot top up a sent card", async () => {
  const client = clientFor((sql) => sql.includes("FROM business_gift_card_events") ? result() : result([{ owner_id: "friend", balance: 10 }]));
  await assert.rejects(changeGiftCard(client, "owner", "card", "topup", { amount: 10, idempotencyKey: randomUUID() }), { code: "GIFT_CARD_NOT_FOUND" });
  assert(!client.statements.some(({ sql }) => sql.startsWith("UPDATE")));
});

test("insufficient wallet funds never credit a gift card", async () => {
  const client = clientFor((sql) => {
    if (sql.includes("FROM business_gift_card_events")) return result();
    if (sql.includes("FROM business_gift_cards")) return result([{ owner_id: "owner", balance: 0 }]);
    if (sql.startsWith("UPDATE roll_wallets")) return result();
    assert.fail(`Unexpected query: ${sql}`);
  });
  await assert.rejects(changeGiftCard(client, "owner", "card", "topup", { amount: 10, idempotencyKey: randomUUID() }), { code: "INSUFFICIENT_ROLLS" });
  assert(!client.statements.some(({ sql }) => sql.startsWith("UPDATE business_gift_cards")));
});

test("empty cards and self-sends cannot move ownership", async () => {
  for (const [recipientId, balance, code] of [["owner", 10, "SELF_TRANSFER"], ["friend", 0, "EMPTY_GIFT_CARD"]]) {
    const client = clientFor((sql) => sql.includes("FROM business_gift_card_events") ? result() : result([{ owner_id: "owner", balance }]));
    await assert.rejects(changeGiftCard(client, "owner", "card", "send", { recipientId, idempotencyKey: randomUUID() }), { code });
    assert(!client.statements.some(({ sql }) => sql.startsWith("UPDATE")));
  }
});

test("gift cards cannot pay a different business", async () => {
  const client = clientFor((sql) => {
    if (sql.includes("FROM business_marketplace_items")) return result([{ id: "item", business_user_id: "business-a", price_rolls: 10 }]);
    if (sql.includes("FROM roll_store_purchases")) return result();
    if (sql.includes("FROM business_gift_card_events")) return result();
    if (sql.includes("FROM business_gift_cards")) return result([{ owner_id: "owner", business_id: "business-b", balance: 100 }]);
    assert.fail(sql);
  });
  await assert.rejects(purchaseBusinessMarketplaceItem(client, "owner", "career", { itemId: "item", giftCardId: "card", idempotencyKey: randomUUID() }), { code: "GIFT_CARD_BUSINESS_MISMATCH" });
  assert(!client.statements.some(({ sql }) => sql.startsWith("UPDATE")));
});

test("restricted purchases never enter the legacy ordinary-wallet order ledger", async () => {
  const client = clientFor((sql, params) => {
    if (sql.includes("FROM roll_store_purchases") || sql.includes("FROM business_gift_card_events")) return result();
    if (sql.includes("FROM business_marketplace_items")) return result([{ id: "item", title: "Service", business_user_id: "business", price_rolls: 20 }]);
    if (sql.includes("FROM business_gift_cards")) return result([{ owner_id: "owner", business_id: "business", balance: 50 }]);
    if (sql.startsWith("UPDATE business_gift_cards")) return result([{ balance: 30 }]);
    if (sql.includes("INSERT INTO business_gift_card_events")) {
      const purchase = JSON.parse(params[7]);
      assert.equal(purchase.productId, "business:item");
      assert.equal(purchase.delivery.giftCardId, "card");
      assert.equal(params[4], 20);
      return result();
    }
    if (sql.startsWith("SELECT balance FROM roll_wallets")) return result([{ balance: 100 }]);
    assert.fail(sql);
  });
  const purchase = await purchaseBusinessMarketplaceItem(client, "owner", "career", { itemId: "item", giftCardId: "card", idempotencyKey: randomUUID() });
  assert.equal(purchase.balance, 100);
  assert(!client.statements.some(({ sql }) => sql.includes("INSERT INTO roll_store_purchases")));
  assert(!client.statements.some(({ sql }) => sql.startsWith("UPDATE roll_wallets")));
});

test("event-backed order refunds restore the card and retain ordinary balance", async () => {
  const client = clientFor((sql, params) => {
    if (sql.includes("FROM roll_store_purchases")) return result();
    if (sql.includes("FROM business_gift_card_events e")) {
      assert.deepEqual(params, ["order", "owner"]);
      return result([{ id: "order", card_id: "card", amount: 20, purchase: { productId: "business:item", productTitle: "Service", delivery: { giftCardId: "card" } }, refunded_at: null }]);
    }
    if (sql.startsWith("UPDATE business_gift_cards")) return result([{ balance: 50 }]);
    if (sql.includes("INSERT INTO business_gift_card_events")) {
      assert.equal(params[5], "order");
      return result([{ created_at: "2026-11-01T19:00:00Z" }]);
    }
    if (sql.startsWith("SELECT balance FROM roll_wallets")) return result([{ balance: 100 }]);
    assert.fail(sql);
  });
  const refund = await refundRollPurchase(client, "owner", "order");
  assert.equal(refund.balance, 100);
  assert.equal(refund.order.status, "refunded");
  assert(!client.statements.some(({ sql }) => sql.startsWith("UPDATE roll_wallets") || sql.startsWith("UPDATE roll_store_purchases")));
});

test("refunds restore gift balance rather than converting it to unrestricted rolls", async () => {
  const purchase = { id: "order", amount: 10, delivery: { giftCardId: "card" }, refunded_at: null };
  const client = clientFor((sql, params) => {
    if (sql.includes("FROM roll_store_purchases")) return result([purchase]);
    if (sql.startsWith("UPDATE business_gift_cards")) { assert.deepEqual(params, [10, "card", 999999990]); return result([{ balance: 30 }]); }
    if (sql.includes("INSERT INTO business_gift_card_events")) return result();
    if (sql.startsWith("UPDATE roll_store_purchases")) return result([{ ...purchase, refunded_at: "2026-11-01" }]);
    if (sql.startsWith("SELECT balance FROM roll_wallets")) return result([{ balance: 100 }]);
    assert.fail(sql);
  });
  assert.equal((await refundRollPurchase(client, "owner", "order")).balance, 100);
  assert(!client.statements.some(({ sql }) => sql.startsWith("UPDATE roll_wallets")));
});
