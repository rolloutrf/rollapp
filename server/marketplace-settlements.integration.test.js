import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { purchaseBusinessMarketplaceItem, readBusinessPurchaseStatus } from "./modules/catalog-marketplace/business-marketplace.js";
import { refundRollPurchase } from "./modules/checkout/roll-purchases.js";
import { readMarketplaceOrderAction, settleMarketplaceOrder, resolveMarketplaceDispute } from "./modules/checkout/marketplace-settlements.js";
import {
  hasMarketplaceSettlementSchema, readMarketplaceSettlementIndexes, readMarketplaceSettlementPrerequisites, verifyMarketplaceSettlementSchema,
} from "./modules/checkout/marketplace-settlements-schema.js";
import { readMarketplaceOrderAttention } from "./modules/history/marketplace-order-attention.js";
import { readRollOrders } from "./modules/history/order-history.js";
import { readRollReceipt } from "./modules/history/roll-receipts.js";
import { readRollWallet } from "./modules/history/wallet-history.js";
import { issueGiftCard, changeGiftCard, listGiftCards } from "./modules/loyalty/gift-cards.js";
import { reconcileRollAccounting } from "./modules/payments/roll-reconciliation.js";
import { ensureRollWallet } from "./modules/payments/rolls.js";

test("protected marketplace orders on the existing production schema", { skip: process.env.ROLLAPP_TEST_MARKETPLACE_SETTLEMENTS !== "1" }, async (t) => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  try {
    await t.test("action groups respect participant scope and server time on PostgreSQL", async () => {
      await db.transaction(async (client) => {
        await client.query("SET TRANSACTION READ ONLY");
        const { rows: [{ now }] } = await client.query("SELECT clock_timestamp() AS now");
        const fixture = { query: (sql, args) => client.query(`
          WITH roll_marketplace_orders(buyer_id,seller_id,status,amount,review_until) AS (VALUES
            ('buyer','seller','fulfilled',10::bigint,$2::timestamptz+INTERVAL '2 hours'),
            ('buyer','seller','fulfilled',20::bigint,$2::timestamptz+INTERVAL '1 hour'),
            ('buyer','seller','fulfilled',30::bigint,statement_timestamp()),
            ('buyer','seller','reserved',40::bigint,NULL),
            ('buyer','seller','disputed',50::bigint,statement_timestamp()-INTERVAL '1 day'),
            ('buyer','seller','released',60::bigint,statement_timestamp()-INTERVAL '1 day'),
            ('unrelated-buyer','unrelated-seller','disputed',70::bigint,NULL)
          ) ${sql}`, [...args, now]) };
        const summary = async (actor) => Object.fromEntries((await readMarketplaceOrderAttention(fixture, actor))
          .map(({ kind, ...entry }) => [kind, entry]));
        const buyer = await summary("buyer");
        assert.deepEqual(Object.keys(buyer).sort(), ["dispute", "review"]);
        assert.equal(buyer.review.count, 2);
        assert.equal(buyer.review.amount, "30");
        assert.equal(buyer.review.reviewUntil.getTime() - now.getTime(), 3_600_000);
        assert.deepEqual(buyer.dispute, { count: 1, amount: "50", reviewUntil: null });
        assert.deepEqual(await summary("seller"), {
          claim: { count: 1, amount: "30", reviewUntil: null },
          dispute: { count: 1, amount: "50", reviewUntil: null },
          fulfill: { count: 1, amount: "40", reviewUntil: null },
        });
        assert.deepEqual(await summary("outsider"), {});
      });
    });
    await t.test("read-only preflight checks existing references and queries the settlement index catalog", async () => {
      await db.transaction(async (client) => {
        await client.query("SET TRANSACTION READ ONLY");
        const access = await readMarketplaceSettlementPrerequisites(client);
        assert.equal(typeof access.schema, "string");
        assert.equal(typeof access.canCreate, "boolean");
        assert.equal(typeof access.canUse, "boolean");
        assert.deepEqual(access.references.map(({ relation }) => relation), [
          "business_gift_card_events", "business_gift_cards", "roll_wallets", "users",
        ]);
        assert(access.references.every(({ hasReferenceKey }) => hasReferenceKey));
        assert(Array.isArray(await readMarketplaceSettlementIndexes(client)));
      });
    });
    const installed = await db.transaction(async (client) => {
      await client.query("SET TRANSACTION READ ONLY");
      if (!await hasMarketplaceSettlementSchema(client)) return false;
      await verifyMarketplaceSettlementSchema(client);
      return true;
    });
    if (!installed) {
      await t.test("protected marketplace lifecycle", { skip: "Requires the separately authorized production settlement schema. No migration was run." }, () => {});
      return;
    }
    const client = await db.pool.connect();
    const [buyer, seller, other, itemId] = Array.from({ length: 4 }, () => randomUUID());
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='15s'");
      for (const [id, type] of [[buyer, "personal"], [seller, "business"], [other, "personal"]]) {
        await client.query(`INSERT INTO users (id,email,username,name,password_hash,account_type)
          VALUES ($1,$2,$3,'Settlement check','unusable',$4)`, [id, `${id}@settlements-test.invalid`, `settle-${id}`, type]);
        await ensureRollWallet(client, id);
      }
      await client.query(`INSERT INTO business_marketplace_items (id,business_user_id,sphere,kind,title,price_rolls)
        VALUES($1,$2,'career','store','Услуга',50)`, [itemId, seller]);
      const buy = (input) => purchaseBusinessMarketplaceItem(client, buyer, "career", input, { protectedCheckout: true, verifySchema: true });
      const terms = () => ({ itemId, expectedPrice: 50, idempotencyKey: randomUUID() });
      const act = (id, actor, action, note) => settleMarketplaceOrder(client, actor, id, { action, note });
      const wallet = (id) => readRollWallet(client, id);
      const totals = () => reconcileRollAccounting(client);

      await t.test("wallet reserve, private views, dispute freeze and exactly one seller credit", async () => {
        const quote = terms();
        await assert.rejects(buy({ ...quote, expectedPrice: 49 }), { code: "PRICE_CHANGED" });
        const purchase = await buy(quote);
        assert.equal((await wallet(buyer)).balance, 50);
        assert.equal((await wallet(buyer)).balances.reservedOrders, "50");
        assert.equal((await wallet(seller)).balances.pendingSales, "50");
        assert.deepEqual((await wallet(seller)).orderAttention, [{ kind: "fulfill", count: 1, amount: "50", reviewUntil: null }]);
        assert.deepEqual((await wallet(buyer)).orderAttention, []);
        assert.deepEqual(await readMarketplaceOrderAttention(client, other), []);
        assert.equal((await wallet(seller)).balance, 100);
        assert(await wallet(buyer).then(({transactions}) => transactions.some((entry) => entry.kind === "market_reserve")));
        await client.query("UPDATE business_marketplace_items SET active=FALSE WHERE id=$1", [itemId]);
        assert.equal((await buy(quote)).id, purchase.id);
        const recovered = await readBusinessPurchaseStatus(client, buyer, "career", quote.idempotencyKey);
        assert.equal(recovered.id, purchase.id);
        assert.equal(recovered.status, "reserved");
        assert.equal(recovered.protected, true);
        assert.equal(await readBusinessPurchaseStatus(client, seller, "career", quote.idempotencyKey), null);
        assert.equal((await purchaseBusinessMarketplaceItem(client, buyer, "career", quote, { verifySchema: true })).replayed, true);
        await client.query("UPDATE business_marketplace_items SET active=TRUE WHERE id=$1", [itemId]);
        await assert.rejects(act(purchase.id, other, "accept"), { code: "ORDER_NOT_FOUND" });
        await assert.rejects(refundRollPurchase(client, buyer, purchase.id), { code: "ORDER_NOT_FOUND" });
        assert.deepEqual((await readRollOrders(client, other)).orders, []);
        assert.equal((await readRollOrders(client, seller)).orders[0].settlement.role, "seller");
        assert.equal((await totals()).unaccountedRolls, "0");

        assert.equal((await act(purchase.id, seller, "fulfill", "Услуга оказана")).status, "fulfilled");
        await assert.rejects(act(purchase.id, seller, "claim"), { code: "ORDER_ACTION_UNAVAILABLE" });
        const available = await readMarketplaceOrderAction(client, buyer, purchase.id, "dispute");
        assert.equal(available.available, true);
        const review = (await wallet(buyer)).orderAttention.find(({ kind }) => kind === "review");
        assert.equal(review.count, 1);
        assert.equal(review.amount, "50");
        assert.equal((await readRollOrders(client, buyer)).orders[0].settlement.attention, "review");
        assert.equal(available.recorded, null);
        await client.query("SAVEPOINT review_deadline");
        try {
          await client.query("UPDATE roll_marketplace_orders SET review_until=statement_timestamp() WHERE id=$1", [purchase.id]);
          assert.equal((await readMarketplaceOrderAction(client, buyer, purchase.id, "dispute")).available, false);
          assert.equal((await readMarketplaceOrderAction(client, seller, purchase.id, "claim")).available, true);
          assert.deepEqual((await wallet(seller)).orderAttention, [{ kind: "claim", count: 1, amount: "50", reviewUntil: null }]);
          assert.deepEqual((await wallet(buyer)).orderAttention, []);
        } finally { await client.query("ROLLBACK TO SAVEPOINT review_deadline"); }
        assert.equal((await act(purchase.id, buyer, "dispute", "Проверьте исполнение")).status, "disputed");
        for (const actor of [buyer, seller]) {
          assert.deepEqual((await wallet(actor)).orderAttention, [{ kind: "dispute", count: 1, amount: "50", reviewUntil: null }]);
        }
        assert.equal((await readMarketplaceOrderAction(client, buyer, purchase.id, "dispute")).recorded.note, "Проверьте исполнение");
        assert.equal((await readMarketplaceOrderAction(client, seller, purchase.id, "dispute")).recorded, null);
        await assert.rejects(readMarketplaceOrderAction(client, other, purchase.id, "dispute"), { code: "ORDER_NOT_FOUND" });
        await assert.rejects(act(purchase.id, seller, "claim"), { code: "ORDER_ACTION_UNAVAILABLE" });
        const resolution = { action: "resolve_release", expectedAmount: 50, operator: "fixture", note: "Исполнение проверено" };
        assert.equal((await resolveMarketplaceDispute(client, purchase.id, resolution)).status, "released");
        assert.equal((await resolveMarketplaceDispute(client, purchase.id, resolution)).replayed, true);
        await assert.rejects(act(purchase.id, seller, "refund"), { code: "ORDER_ACTION_UNAVAILABLE" });
        assert.equal((await wallet(seller)).balance, 150);
        assert.equal((await wallet(buyer)).balances.reservedOrders, "0");
        assert.deepEqual((await wallet(seller)).orderAttention, []);
        assert.equal((await wallet(seller)).transactions.filter(({kind}) => kind === "market_sale").length, 1);
        assert((await readRollOrders(client, seller)).orders[0].settlement.events.every((event) => !("operator_label" in event)));
        assert.equal((await totals()).unaccountedRolls, "0");
      });

      await t.test("private reconciliation sees open disputes and distinguishes voluntary closure from audit mismatches", async () => {
        await client.query("SAVEPOINT marketplace_audit");
        try {
          const previous = await totals();
          const purchase = await buy(terms());
          await act(purchase.id, seller, "fulfill");
          await act(purchase.id, buyer, "dispute", "Нужна проверка заказа");
          const open = await reconcileRollAccounting(client, { sampleLimit: 100 });
          assert.equal(open.attention.marketplace_disputed.count, (previous.attention.marketplace_disputed?.count ?? 0) + 1);
          assert(open.attention.marketplace_disputed.sample.some(({ id }) => id === purchase.id));
          assert.equal(open.marketplaceMismatches, previous.marketplaceMismatches);
          await act(purchase.id, seller, "refund");
          const refunded = await totals();
          assert.equal(refunded.marketplaceMismatches, previous.marketplaceMismatches);
          assert.equal(refunded.attention.marketplace_disputed?.count ?? 0, previous.attention.marketplace_disputed?.count ?? 0);

          const accepted = await buy(terms());
          await act(accepted.id, seller, "fulfill");
          await act(accepted.id, buyer, "dispute", "Нужна проверка заказа");
          await act(accepted.id, buyer, "accept");
          assert.equal((await totals()).marketplaceMismatches, previous.marketplaceMismatches);
          await client.query("UPDATE roll_marketplace_order_events SET actor_id=$2 WHERE order_id=$1 AND action='accept'", [accepted.id, other]);
          const damaged = await reconcileRollAccounting(client, { sampleLimit: 100 });
          assert.equal(damaged.marketplaceMismatches, previous.marketplaceMismatches + 1);
          assert.equal(damaged.unaccountedRolls, previous.unaccountedRolls);
          assert.equal(damaged.details.marketplace.find(({ id }) => id === accepted.id).terminalAction, "accept");
        } finally { await client.query("ROLLBACK TO SAVEPOINT marketplace_audit"); }
      });

      await t.test("a purchase funded by a card refunds the same card after a change of owner", async () => {
        const card = await issueGiftCard(client, seller, { businessId: seller, idempotencyKey: randomUUID() });
        await changeGiftCard(client, seller, card.id, "topup", { amount: 80, idempotencyKey: randomUUID() });
        await changeGiftCard(client, seller, card.id, "send", { recipientId: buyer, idempotencyKey: randomUUID() });
        const beforeReservation = await totals();
        const purchase = await buy({ ...terms(), giftCardId: card.id });
        const reserved = await totals();
        assert.equal(BigInt(reserved.reservedMarketplaceRolls) - BigInt(beforeReservation.reservedMarketplaceRolls), 50n);
        assert.deepEqual(reserved.circulation, beforeReservation.circulation);
        const cardBalance = async (user) => (await listGiftCards(client.query.bind(client), user))[0].balance;
        assert.equal(await cardBalance(buyer), 30);
        await assert.rejects(changeGiftCard(client, buyer, card.id, "topup", {
          amount: 999_999_970, idempotencyKey: randomUUID(),
        }), { code: "GIFT_CARD_LIMIT" });
        await assert.rejects(refundRollPurchase(client, buyer, purchase.id), { code: "ORDER_NOT_FOUND" });
        await changeGiftCard(client, buyer, card.id, "send", { recipientId: other, idempotencyKey: randomUUID() });
        assert.equal((await totals()).unaccountedRolls, "0");
        assert.equal((await act(purchase.id, buyer, "cancel")).status, "refunded");
        assert.equal((await act(purchase.id, buyer, "cancel")).replayed, true);
        const refunded = await totals();
        assert.equal(refunded.circulation.heldRolls, beforeReservation.circulation.heldRolls);
        assert.equal(refunded.circulation.redeemedLast30Days, beforeReservation.circulation.redeemedLast30Days);
        assert.equal(await cardBalance(other), 80);
        assert.equal((await wallet(buyer)).balance, 50);
        assert.deepEqual((await readRollOrders(client, other)).orders, []);
        const params = { kind: "order", id: purchase.id };
        const buyerReceipt = await readRollReceipt(client, buyer, params);
        const sellerReceipt = await readRollReceipt(client, seller, params);
        assert.equal(buyerReceipt.source, "gift");
        assert.equal(sellerReceipt.source, null);
        assert.equal(buyerReceipt.status, "refunded");
        assert.equal(sellerReceipt.status, "refunded");
        assert(buyerReceipt.closedAt);
        assert.equal(buyerReceipt.id, sellerReceipt.id);
        assert(!JSON.stringify(buyerReceipt).includes(card.id));
        assert.equal(await readRollReceipt(client, other, params), null);
        const audit = await totals();
        assert.equal(audit.walletMismatches, 0);
        assert.equal(audit.cardMismatches, 0);
        assert.equal(audit.marketplaceMismatches, 0);
        assert.equal(audit.unaccountedRolls, "0");
      });
    } finally {
      try { await client.query("ROLLBACK"); } finally { client.release(); }
    }
  } finally { await db.pool.end(); }
});
