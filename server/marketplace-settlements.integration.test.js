import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { purchaseBusinessMarketplaceItem } from "./modules/catalog-marketplace/business-marketplace.js";
import { refundRollPurchase } from "./modules/checkout/roll-purchases.js";
import { settleMarketplaceOrder, resolveMarketplaceDispute } from "./modules/checkout/marketplace-settlements.js";
import { hasMarketplaceSettlementSchema, verifyMarketplaceSettlementSchema } from "./modules/checkout/marketplace-settlements-schema.js";
import { readRollOrders } from "./modules/history/order-history.js";
import { readRollWallet } from "./modules/history/wallet-history.js";
import { issueGiftCard, changeGiftCard, listGiftCards } from "./modules/loyalty/gift-cards.js";
import { reconcileRollAccounting } from "./modules/payments/roll-accounting.js";
import { ensureRollWallet } from "./modules/payments/rolls.js";

test("protected marketplace orders on the existing production schema", { skip: process.env.ROLLAPP_TEST_MARKETPLACE_SETTLEMENTS !== "1" }, async (t) => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  try {
    const installed = await db.transaction(async (client) => {
      await client.query("SET TRANSACTION READ ONLY");
      if (!await hasMarketplaceSettlementSchema(client)) return false;
      await verifyMarketplaceSettlementSchema(client);
      return true;
    });
    if (!installed) {
      t.skip("Requires the separately authorized production settlement schema. No migration was run.");
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
        assert.equal((await wallet(seller)).balance, 100);
        assert(await wallet(buyer).then(({transactions}) => transactions.some((entry) => entry.kind === "market_reserve")));
        await client.query("UPDATE business_marketplace_items SET active=FALSE WHERE id=$1", [itemId]);
        assert.equal((await buy(quote)).id, purchase.id);
        assert.equal((await purchaseBusinessMarketplaceItem(client, buyer, "career", quote, { verifySchema: true })).replayed, true);
        await client.query("UPDATE business_marketplace_items SET active=TRUE WHERE id=$1", [itemId]);
        await assert.rejects(act(purchase.id, other, "accept"), { code: "ORDER_NOT_FOUND" });
        await assert.rejects(refundRollPurchase(client, buyer, purchase.id), { code: "ORDER_NOT_FOUND" });
        assert.deepEqual((await readRollOrders(client, other)).orders, []);
        assert.equal((await readRollOrders(client, seller)).orders[0].settlement.role, "seller");
        assert.equal((await totals()).unaccountedRolls, "0");

        assert.equal((await act(purchase.id, seller, "fulfill", "Услуга оказана")).status, "fulfilled");
        await assert.rejects(act(purchase.id, seller, "claim"), { code: "ORDER_ACTION_UNAVAILABLE" });
        assert.equal((await act(purchase.id, buyer, "dispute", "Проверьте исполнение")).status, "disputed");
        await assert.rejects(act(purchase.id, seller, "claim"), { code: "ORDER_ACTION_UNAVAILABLE" });
        const resolution = { action: "resolve_release", expectedAmount: 50, operator: "fixture", note: "Исполнение проверено" };
        assert.equal((await resolveMarketplaceDispute(client, purchase.id, resolution)).status, "released");
        assert.equal((await resolveMarketplaceDispute(client, purchase.id, resolution)).replayed, true);
        await assert.rejects(act(purchase.id, seller, "refund"), { code: "ORDER_ACTION_UNAVAILABLE" });
        assert.equal((await wallet(seller)).balance, 150);
        assert.equal((await wallet(buyer)).balances.reservedOrders, "0");
        assert.equal((await wallet(seller)).transactions.filter(({kind}) => kind === "market_sale").length, 1);
        assert((await readRollOrders(client, seller)).orders[0].settlement.events.every((event) => !("operator_label" in event)));
        assert.equal((await totals()).unaccountedRolls, "0");
      });

      await t.test("a purchase funded by a card refunds the same card after a change of owner", async () => {
        const card = await issueGiftCard(client, seller, { businessId: seller, idempotencyKey: randomUUID() });
        await changeGiftCard(client, seller, card.id, "topup", { amount: 80, idempotencyKey: randomUUID() });
        await changeGiftCard(client, seller, card.id, "send", { recipientId: buyer, idempotencyKey: randomUUID() });
        const purchase = await buy({ ...terms(), giftCardId: card.id });
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
        assert.equal(await cardBalance(other), 80);
        assert.equal((await wallet(buyer)).balance, 50);
        assert.deepEqual((await readRollOrders(client, other)).orders, []);
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
