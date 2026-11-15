import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { MARKETPLACE_REVIEW_DAYS, marketplaceOrderActions } from "../../../shared/modules/checkout/marketplace-settlements.js";
import { marketplaceOrderActionSchema, resolveMarketplaceDispute, settleMarketplaceOrder } from "./marketplace-settlements.js";
import { purchaseBusinessMarketplaceItem, readBusinessPurchaseStatus } from "../catalog-marketplace/business-marketplace.js";

const now = new Date("2026-11-16T09:00:00.000Z");
const future = new Date(now.getTime() + 60_000);
const fixture = { id: randomUUID(), buyer_id: "buyer", seller_id: "seller", status: "fulfilled", amount: "70", review_until: future };

function scripted(steps) {
  return {
    async query(sql, args = []) {
      const step = steps.shift();
      assert.ok(step, `Unexpected query ${sql}`);
      const [pattern, rows, inspect] = step;
      assert.match(sql, pattern);
      inspect?.(args);
      return { rows, rowCount: rows.length };
    },
    done() { assert.equal(steps.length, 0); },
  };
}

const installed = [/to_regclass/, [{ orders: true, events: true }]];
const card = { id: "card", owner_id: "buyer", business_id: "seller", balance: "150" };
const keys = () => ({ itemId: "item", expectedPrice: 70, idempotencyKey: randomUUID() });
const walletLock = [
  [/INSERT INTO roll_wallets/, []], [/FROM roll_wallets.+FOR UPDATE/, []], [/INSERT INTO roll_transactions/, []],
];

test("roles, exact review deadline and terminal states define order actions", () => {
  assert.deepEqual(marketplaceOrderActions({ status: "reserved" }, "buyer", now), ["cancel"]);
  assert.deepEqual(marketplaceOrderActions({ status: "reserved" }, "seller", now), ["fulfill", "refund"]);
  assert.deepEqual(marketplaceOrderActions(fixture, "buyer", now), ["accept", "dispute"]);
  assert.deepEqual(marketplaceOrderActions(fixture, "seller", now), ["refund"]);
  assert.deepEqual(marketplaceOrderActions(fixture, "buyer", future), ["accept"]);
  assert.deepEqual(marketplaceOrderActions(fixture, "seller", future), ["claim", "refund"]);
  const disputed = { ...fixture, status: "disputed" };
  assert.deepEqual(marketplaceOrderActions(disputed, "seller", future), ["refund"]);
  assert.deepEqual(marketplaceOrderActions(disputed, "operator", future), ["resolve_release", "resolve_refund"]);
  assert.deepEqual(marketplaceOrderActions({ ...fixture, status: "released" }, "buyer", now), []);
  assert.equal(marketplaceOrderActionSchema.safeParse({ action: "dispute", note: "  " }).success, false);
  assert.equal(marketplaceOrderActionSchema.safeParse({ action: "resolve_refund", expectedAmount: 70, note: "x" }).success, false);
});

test("missing schema fails before any wallet write, and detached checkout replays existing orders", async () => {
  const missing = scripted([[/to_regclass/, [{ orders: false, events: false }]]]);
  await assert.rejects(purchaseBusinessMarketplaceItem(missing, "buyer", "career", keys(), { protectedCheckout: true }), { code: "MARKETPLACE_SETTLEMENT_UNAVAILABLE" });
  missing.done();
  const order = { id: fixture.id, item_id: "item", sphere: "career", amount: "70", gift_card_id: null, status: "reserved" };
  const replay = scripted([installed, ...walletLock,
    [/FROM roll_marketplace_orders WHERE buyer_id/, [order]], [/SELECT balance/, [{ balance: "80" }]],
  ]);
  assert.deepEqual(await purchaseBusinessMarketplaceItem(replay, "buyer", "career", keys(), { verifySchema: true }),
    { id: fixture.id, balance: 80, replayed: true, protected: true, status: "reserved", amount: 70 });
  replay.done();
});

test("protected purchase recovery checks the original buyer and key without wallet writes", async () => {
  const requestKey = randomUUID();
  const order = { id: fixture.id, item_id: "item", sphere: "career", amount: "70", gift_card_id: card.id, status: "disputed" };
  const client = scripted([installed, [/FROM roll_marketplace_orders WHERE buyer_id/, [order], (args) => {
    assert.deepEqual(args, ["buyer", requestKey]);
  }]]);
  const purchase = await readBusinessPurchaseStatus(client, "buyer", "career", requestKey);
  assert.deepEqual(purchase, { id: order.id, itemId: "item", sphere: "career", amount: 70,
    giftCardId: card.id, status: "disputed", protected: true });
  client.done();
});

test("stale quote fails before debit; a card reserve writes a protected order without legacy purchase metadata", async () => {
  const item = { id: "item", sphere: "career", price_rolls: "70", business_user_id: "seller", title: "Услуга", business_name: "Студия" };
  const lookup = [installed, ...walletLock,
    [/FROM roll_marketplace_orders WHERE buyer_id/, []], [/FROM roll_store_purchases/, []],
    [/to_regclass\('business_gift_card_events'\)/, [{ events: "business_gift_card_events" }]],
    [/FROM business_gift_card_events e[\s\S]+WHERE e.actor_id/, []], [/FROM business_marketplace_items/, [item]],
  ];
  const stale = scripted([...lookup]);
  await assert.rejects(purchaseBusinessMarketplaceItem(stale, "buyer", "career", { ...keys(), expectedPrice: 69 }, { protectedCheckout: true }), { code: "PRICE_CHANGED" });
  stale.done();

  let eventId;
  const checkout = scripted([...lookup,
    [/FROM business_gift_cards.+FOR UPDATE/, [card]],
    [/UPDATE business_gift_cards SET balance=balance-/, [{ id: card.id }]],
    [/INSERT INTO business_gift_card_events/, [], ([id, cardId, buyer, kind, amount, , , snapshot]) => {
      eventId = id;
      assert.deepEqual([cardId, buyer, kind, amount, snapshot], [card.id, "buyer", "spend", 70, null]);
    }],
    [/SELECT balance FROM roll_wallets/, [{ balance: "100" }]],
    [/INSERT INTO roll_marketplace_orders/, [], ([id, buyer, seller, , , , , amount, , cardId, debit]) =>
      assert.deepEqual([id, buyer, seller, amount, cardId, debit], [eventId, "buyer", "seller", 70, card.id, eventId])],
  ]);
  const result = await purchaseBusinessMarketplaceItem(checkout, "buyer", "career", { ...keys(), giftCardId: card.id }, { protectedCheckout: true });
  assert.deepEqual(result, { id: eventId, balance: 100, protected: true, replayed: false });
  checkout.done();
});

test("lock precedes server deadline; accepting a deal credits exactly the seller and saves one terminal event", async () => {
  const accept = scripted([installed,
    [/roll_marketplace_orders[\s\S]+FOR UPDATE/, [fixture], (args) => assert.deepEqual(args, [fixture.id, "buyer", false])],
    [/clock_timestamp/, [{ now }]], [/FROM roll_marketplace_order_events/, []], ...walletLock,
    [/UPDATE roll_wallets SET balance=balance\+/, [{ user_id: "seller" }], ([amount, receiver]) => assert.deepEqual([amount, receiver], [70, "seller"])],
    [/INSERT INTO roll_marketplace_order_events/, [], (args) => assert.deepEqual(args, [fixture.id, "accept", "buyer", null, "", now])],
    [/UPDATE roll_marketplace_orders/, [], (args) => assert.deepEqual(args, [fixture.id, "released", future, now])],
  ]);
  assert.deepEqual(await settleMarketplaceOrder(accept, "buyer", fixture.id, { action: "accept" }),
    { id: fixture.id, status: "released", replayed: false });
  accept.done();
  const replay = scripted([installed, [/FOR UPDATE/, [{ ...fixture, status: "released" }]],
    [/clock_timestamp/, [{ now }]], [/FROM roll_marketplace_order_events/, [{ actor_id: "buyer", operator_label: null, note: "" }]],
  ]);
  assert.equal((await settleMarketplaceOrder(replay, "buyer", fixture.id, { action: "accept" })).replayed, true);
  replay.done();
  const early = scripted([installed, [/FOR UPDATE/, [fixture]], [/clock_timestamp/, [{ now }]], [/FROM roll_marketplace_order_events/, []]]);
  await assert.rejects(settleMarketplaceOrder(early, "seller", fixture.id, { action: "claim" }), { code: "ORDER_ACTION_UNAVAILABLE" });
  early.done();
});

test("fulfillment sets seven days; dispute decision requires an exact amount and refunds the original card", async () => {
  const fulfillment = scripted([installed, [/FOR UPDATE/, [{ ...fixture, status: "reserved", review_until: null }]],
    [/clock_timestamp/, [{ now }]], [/FROM roll_marketplace_order_events/, []],
    [/INSERT INTO roll_marketplace_order_events/, []],
    [/UPDATE roll_marketplace_orders/, [], ([, status, reviewUntil, closedAt]) => {
      assert.equal(status, "fulfilled"); assert.equal(reviewUntil - now, MARKETPLACE_REVIEW_DAYS * 86_400_000); assert.equal(closedAt, null);
    }],
  ]);
  assert.equal((await settleMarketplaceOrder(fulfillment, "seller", fixture.id, { action: "fulfill" })).status, "fulfilled");
  fulfillment.done();

  const dispute = { ...fixture, status: "disputed", gift_card_id: card.id, gift_payment_id: "payment-event" };
  const decision = { action: "resolve_refund", operator: "reviewer", expectedAmount: 70, note: "Причина решения" };
  const wrong = scripted([installed, [/FOR UPDATE/, [dispute]]]);
  await assert.rejects(resolveMarketplaceDispute(wrong, fixture.id, { ...decision, expectedAmount: 71 }), { code: "ORDER_AMOUNT_MISMATCH" });
  wrong.done();
  const refund = scripted([installed, [/FOR UPDATE/, [dispute]], [/clock_timestamp/, [{ now }]], [/FROM roll_marketplace_order_events/, []],
    installed, [/FROM business_gift_cards WHERE id=\$1 FOR UPDATE/, [{ id: "card" }]],
    [/SUM\(amount\)/, [{ held: "30" }], (args) => assert.deepEqual(args, ["card", fixture.id])],
    [/UPDATE business_gift_cards SET balance=balance\+/, [{ id: card.id }], (args) => assert.deepEqual(args, [70, "card", 999999900])],
    [/INSERT INTO business_gift_card_events/, [], ([, cardId, actor, amount, , payment]) => assert.deepEqual([cardId, actor, amount, payment], ["card", "buyer", 70, "payment-event"])],
    [/INSERT INTO roll_marketplace_order_events/, [], (args) => assert.deepEqual(args, [fixture.id, "resolve_refund", null, "reviewer", "Причина решения", now])],
    [/UPDATE roll_marketplace_orders/, [], (args) => assert.deepEqual(args, [fixture.id, "refunded", future, now])],
  ]);
  assert.equal((await resolveMarketplaceDispute(refund, fixture.id, decision)).status, "refunded");
  refund.done();
});
