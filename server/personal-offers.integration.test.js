import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createPersonalOffer, payPersonalOffer, createPersonalOfferItem, registerPersonalOfferRoutes } from "./personal-offers.js";
import { registerWishlistBusinessRoutes } from "./modules/wishlist/wishlist-business.js";
import { ensureRollWallet } from "./modules/payments/rolls.js";
import { registerRollsRoutes } from "./modules/payments/rolls-routes.js";
import { readPersonalOfferOperation } from "./modules/checkout/personal-offer-status.js";
import { refundRollPurchase } from "./modules/checkout/roll-purchases.js";
import { readRollWallet } from "./modules/history/wallet-history.js";
import { readRollOrders } from "./modules/history/order-history.js";
import { readRollReceipt } from "./modules/history/roll-receipts.js";
import { reconcileRollAccounting } from "./modules/payments/roll-reconciliation.js";
import { brandOfferScope, readBrandPurchaseNeeds } from "./modules/access/brand-offer-consent.js";
import { savePurchaseNeed } from "./modules/planning/planning.js";
import { ROLLS_MAX_BALANCE } from "../shared/modules/payments/rolls.js";

test("personal offers on existing production schema: every test write is rolled back", { skip: process.env.ROLLAPP_TEST_PERSONAL_OFFERS !== "1" }, async t => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  const client = await db.pool.connect();
  try {
    await t.test("exact lookup runs on the configured PostgreSQL in READ ONLY mode", async () => {
      await client.query("BEGIN READ ONLY");
      try {
        assert.equal((await client.query("SHOW transaction_read_only")).rows[0].transaction_read_only, "on");
        await assert.rejects(readPersonalOfferOperation(client, randomUUID(), { id: randomUUID(), action: "pay" }), { code: "OFFER_NOT_FOUND" });
      } finally { await client.query("ROLLBACK"); }
    });
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    // Never initialize, migrate or backfill the production database for a test.
    await client.query("SELECT id,purchase_id FROM business_personal_offers LIMIT 0");
    const [seller, buyer, other, itemId] = Array.from({ length: 4 }, () => randomUUID());
    for (const [id, type] of [[seller,"business"],[buyer,"personal"],[other,"personal"]]) {
      await client.query("INSERT INTO users (id,email,username,name,password_hash,account_type) VALUES ($1,$2,$3,'Offer test','unusable',$4)", [id, `${id}@offer-test.invalid`, `offer-${id}`, type]);
      await ensureRollWallet(client, id);
    }
    const product = await createPersonalOfferItem(client, seller, { title: "Frozen title", priceRolls: 70, sphere: "education", itemType: "service", idempotencyKey: itemId });
    const data = { itemId: product.id, recipientId: buyer, priceRolls: 40, durationHours: 24, idempotencyKey: randomUUID() };
    await assert.rejects(createPersonalOffer(client, seller, data), error => error.code === "OFFER_CONSENT_REQUIRED");
    await client.query("INSERT INTO follows (follower_id,following_id) VALUES ($1,$2)", [buyer,seller]);
    await assert.rejects(createPersonalOffer(client, seller, data), { code: "OFFER_CONSENT_REQUIRED" });
    await client.query("DELETE FROM follows WHERE follower_id=$1 AND following_id=$2", [buyer,seller]);
    const allowBrand = () => client.query("INSERT INTO sphere_section_shares(owner_user_id,viewer_user_id,sphere,section) VALUES($1,$2,'brand-offers','needs')", [buyer,seller]);
    const blockBrand = () => client.query(`DELETE FROM sphere_section_shares WHERE owner_user_id=$1 AND viewer_user_id=$2 AND ${brandOfferScope}`, [buyer,seller]);
    await allowBrand();
    const offer = await createPersonalOffer(client, seller, data);
    const balances = async () => (await client.query("SELECT user_id,balance::text FROM roll_wallets WHERE user_id=ANY($1::text[]) ORDER BY user_id", [[seller,buyer,other]])).rows;
    const reject = async (operation, code) => {
      const before = await balances(); await client.query("SAVEPOINT rejected_offer");
      await assert.rejects(operation, e => e.code === code);
      await client.query("ROLLBACK TO SAVEPOINT rejected_offer"); assert.deepEqual(await balances(), before);
    };
    await t.test("brand consent exposes only active purchase needs to the chosen brand", async () => {
      const query = (sql, params) => client.query(sql, params);
      const qualifiers = { title: "Open need", criteria: "Warm light", neededBy: "2026-12-01",
        dueOn: "2026-11-29", country: "RU", budgetMinor: 80000, savedMinor: 50000, currency: "RUB", variantIds: [] };
      const needId = `need-${randomUUID()}`;
      const completedId = `need-${randomUUID()}`;
      await savePurchaseNeed(query, buyer, needId, qualifiers);
      await savePurchaseNeed(query, buyer, completedId, { ...qualifiers, title: "Closed need" });
      await client.query("UPDATE planning_tasks SET completed=TRUE WHERE id=$1 AND user_id=$2", [`purchase-plan:${completedId}`, buyer]);
      assert.deepEqual(await readBrandPurchaseNeeds(query, buyer, seller), [
        { id: needId, title: qualifiers.title, criteria: qualifiers.criteria, neededBy: qualifiers.neededBy },
      ]);
      assert.equal(await readBrandPurchaseNeeds(query, buyer, other), null);
      assert.equal(await readBrandPurchaseNeeds(query, other, seller), null);
      await blockBrand();
      assert.equal(await readBrandPurchaseNeeds(query, buyer, seller), null);
      await assert.rejects(createPersonalOffer(client, seller, { ...data, idempotencyKey: randomUUID() }), { code: "OFFER_CONSENT_REQUIRED" });
      await allowBrand();
    });
    await t.test("retry does not extend expiry; altered terms and foreign recipients fail", async () => {
      const before = (await client.query("SELECT expires_at FROM business_personal_offers WHERE id=$1", [offer.id])).rows[0];
      assert.equal((await createPersonalOffer(client, seller, data)).id, offer.id);
      assert.deepEqual((await client.query("SELECT expires_at FROM business_personal_offers WHERE id=$1", [offer.id])).rows[0], before);
      await reject(() => createPersonalOffer(client, seller, { ...data, priceRolls: 1 }), "IDEMPOTENCY_CONFLICT");
      await reject(() => payPersonalOffer(client, other, offer.id), "OFFER_NOT_FOUND");
    });
    await t.test("HTTP invoice lists expose only the authenticated buyer or seller", async () => {
      const { default: express } = await import("express");
      const app = express();
      app.use(express.json());
      let mutationRequests = 0;
      let readOnlyRequests = 0;
      const dependencies = {
        requireAuth(req, _res, next) { req.user = { id: req.headers["x-test-user"], account_type: req.headers["x-test-user"] === seller ? "business" : "personal", business_category: req.headers["x-test-user"] === seller ? "seller" : null, seller_space: "products" }; next(); },
        query: client.query.bind(client), transaction: async callback => {
          mutationRequests += 1;
          await client.query("SAVEPOINT http_offer_request");
          try {
            const result = await callback({ query: (sql, args) => {
              // Test rows are uncommitted. The separate probe above uses true READ ONLY.
              if (sql === "SET TRANSACTION READ ONLY") { readOnlyRequests += 1; return; }
              return client.query(sql, args);
            } });
            await client.query("RELEASE SAVEPOINT http_offer_request");
            return result;
          }
          catch (error) { await client.query("ROLLBACK TO SAVEPOINT http_offer_request"); await client.query("RELEASE SAVEPOINT http_offer_request"); throw error; }
        },
      };
      registerPersonalOfferRoutes(app, dependencies);
      registerRollsRoutes(app, dependencies);
      registerWishlistBusinessRoutes(app, dependencies);
      app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
      const server = app.listen(0, "127.0.0.1");
      await new Promise(resolve => server.once("listening", resolve));
      try {
        for (const userId of [buyer,seller,other]) {
          const response = await fetch(`http://127.0.0.1:${server.address().port}/api/personal-offers`, { headers: { "x-test-user": userId } });
          assert.equal(response.status, 200);
          const body = await response.json();
          assert.equal(body.offers.length, userId === other ? 0 : 1);
          if (body.offers.length) { assert.equal(body.offers[0].id, offer.id); assert.equal(body.offers[0].idempotencyKey, undefined); }
        }
        for (const [sphere, count] of [["education", 1], ["health", 0]]) {
          const response = await fetch(`http://127.0.0.1:${server.address().port}/api/personal-offers?sphere=${sphere}`, { headers: { "x-test-user": buyer } });
          assert.equal(response.status, 200);
          assert.equal((await response.json()).offers.length, count);
        }
        const recipientsUrl = `http://127.0.0.1:${server.address().port}/api/personal-offers/recipients`;
        const listRecipients = await fetch(recipientsUrl, { headers: { "x-test-user": seller } });
        assert.equal(listRecipients.status, 200);
        assert.deepEqual((await listRecipients.json()).people.map(person => person.id), [buyer]);
        assert.equal((await fetch(recipientsUrl, { headers: { "x-test-user": other } })).status, 403);
        await client.query("SAVEPOINT invoice_pagination");
        try {
          const ids = Array.from({ length: 101 }, () => randomUUID());
          await client.query(`INSERT INTO business_personal_offers
            (id,business_user_id,recipient_id,item_id,item_title,price_rolls,created_at,expires_at,idempotency_key)
            SELECT id::uuid,$2,$3,$4,'Pagination invoice',40,CURRENT_TIMESTAMP-INTERVAL '1 hour',CURRENT_TIMESTAMP+INTERVAL '1 day',id::uuid
            FROM unnest($1::text[]) AS id`, [ids,seller,buyer,product.id]);
          const list = async (offset, userId = buyer) => {
            const response = await fetch(`http://127.0.0.1:${server.address().port}/api/personal-offers?offset=${offset}`, { headers: { "x-test-user": userId } });
            assert.equal(response.status, 200); return response.json();
          };
          const first = await list(0);
          assert.equal(first.offers.length, 100); assert.equal(first.nextOffset, 100);
          const second = await list(first.nextOffset);
          assert.equal(second.offers.length, 2); assert.equal(second.nextOffset, null);
          assert.deepEqual([...first.offers,...second.offers].map(row => row.id), [offer.id,...ids.sort().reverse()]);
          assert.equal((await list(100, other)).offers.length, 0);
          const invalid = await fetch(`http://127.0.0.1:${server.address().port}/api/personal-offers?offset=-1`, { headers: { "x-test-user": buyer } });
          assert.equal(invalid.status, 400); assert.equal((await invalid.json()).code, "INVALID_OFFER_PAGE");
        } finally { await client.query("ROLLBACK TO SAVEPOINT invoice_pagination"); }
        assert.equal(mutationRequests, 0, "List reads never invoke a mutation transaction");
        await client.query("SAVEPOINT http_invoice_lifecycle");
        try {
          const post = async (path, userId, body = {}) => {
            const response = await fetch(`http://127.0.0.1:${server.address().port}/api/personal-offers${path}`, { method: "POST", headers: { "x-test-user": userId, "Content-Type": "application/json" }, body: JSON.stringify(body) });
            return { status: response.status, body: await response.json() };
          };
          const terms = { ...data, priceRolls: 1, idempotencyKey: randomUUID() };
          assert.equal((await post("", other, terms)).status, 403);
          const selfOffer = await post("", buyer, terms);
          assert.equal(selfOffer.status, 400); assert.equal(selfOffer.body.code, "SELF_OFFER");
          const created = await post("", seller, terms);
          assert.equal(created.status, 201);
          const repeated = await post("", seller, terms);
          assert.equal(repeated.status, 200); assert.equal(repeated.body.offer.id, created.body.offer.id);
          const path = `/${created.body.offer.id}/pay`;
          const status = async (path, userId) => {
            const response = await fetch(`http://127.0.0.1:${server.address().port}/api/personal-offers${path}/status`, { headers: { "x-test-user": userId } });
            assert.equal(response.headers.get("cache-control"), "private, no-store");
            return { code: response.status, result: await response.json() };
          };
          const refundPath = `/${created.body.offer.id}/refund`;
          const listOffer = async (userId) => {
            const response = await fetch(`http://127.0.0.1:${server.address().port}/api/personal-offers`, { headers: { "x-test-user": userId } });
            assert.equal(response.status, 200);
            const { offers } = await response.json();
            return offers.find(({ id }) => id === created.body.offer.id);
          };
          const beforeStatus = await balances();
          assert.deepEqual(await status(path, buyer), { code: 200, result: { purchase: null } });
          assert.equal((await status(path, seller)).code, 404);
          assert.equal((await status(refundPath, buyer)).code, 404);
          assert.equal((await status(path, other)).code, 404);
          assert.deepEqual(await balances(), beforeStatus);
          assert.equal((await post(path, other)).status, 404);
          assert.equal((await post(path, buyer, { expectedPriceRolls: 2 })).body.code, "OFFER_PRICE_CHANGED");
          assert.deepEqual(await balances(), beforeStatus);
          for (const [sql, params] of [
            [`DELETE FROM sphere_section_shares WHERE owner_user_id=$1 AND viewer_user_id=$2 AND ${brandOfferScope}`, [buyer, seller]],
            ["UPDATE business_marketplace_items SET active=FALSE WHERE id=$1", [product.id]],
            ["UPDATE users SET business_category='doctor' WHERE id=$1", [seller]],
          ]) {
            await client.query("SAVEPOINT payment_access");
            try {
              await client.query(sql, params);
              for (const actorId of [buyer, seller]) assert.equal((await listOffer(actorId)).status, "unavailable");
              const denied = await post(path, buyer, { expectedPriceRolls: 1 });
              assert.equal(denied.status, 403);
              assert.equal(denied.body.code, "OFFER_ACCESS_REVOKED");
              assert.deepEqual(await balances(), beforeStatus);
              assert.equal((await client.query("SELECT purchase_id FROM business_personal_offers WHERE id=$1", [created.body.offer.id])).rows[0].purchase_id, null);
            } finally {
              await client.query("ROLLBACK TO SAVEPOINT payment_access");
              await client.query("RELEASE SAVEPOINT payment_access");
            }
          }
          assert.equal((await listOffer(buyer)).status, "active");
          const transferUrl = `http://127.0.0.1:${server.address().port}/api/rolls/transfers`;
          const transferUsingReservedKey = await fetch(transferUrl, {
            method: "POST", headers: { "x-test-user": buyer, "Content-Type": "application/json" },
            body: JSON.stringify({ recipientId: other, amount: 1, idempotencyKey: created.body.offer.id }),
          });
          assert.equal(transferUsingReservedKey.status, 409);
          assert.equal((await transferUsingReservedKey.json()).code, "IDEMPOTENCY_CONFLICT");
          assert.deepEqual(await balances(), beforeStatus);
          await client.query("SAVEPOINT independent_sender");
          try {
            const anotherSender = await fetch(transferUrl, {
              method: "POST", headers: { "x-test-user": other, "Content-Type": "application/json" },
              body: JSON.stringify({ recipientId: buyer, amount: 1, idempotencyKey: created.body.offer.id }),
            });
            assert.equal(anotherSender.status, 201);
            const anotherTransfer = await anotherSender.json();
            const anotherLookup = await fetch(`${transferUrl}/${created.body.offer.id}`, { headers: { "x-test-user": other } });
            assert.equal((await anotherLookup.json()).transfer.id, anotherTransfer.transfer.id);
          } finally {
            await client.query("ROLLBACK TO SAVEPOINT independent_sender");
            await client.query("RELEASE SAVEPOINT independent_sender");
          }

          const paid = await post(path, buyer, { expectedPriceRolls: 1 });
          assert.equal(paid.status, 201);
          const replay = await post(path, buyer);
          assert.equal(replay.status, 200); assert.equal(replay.body.purchase.id, paid.body.purchase.id);
          const recorded = await status(path, buyer);
          assert.equal(recorded.result.purchase.id, paid.body.purchase.id);
          assert.equal(recorded.result.purchase.offerId, created.body.offer.id);
          assert.equal(recorded.result.purchase.recipientId, buyer);
          assert.equal(recorded.result.purchase.businessId, seller);
          assert.equal(recorded.result.purchase.priceRolls, 1);
          assert.equal(recorded.result.purchase.refundedAt, null);
          const { rows: [debit] } = await client.query(`
            SELECT t.id,p.delivery->>'paymentTransactionId' AS linked_payment
            FROM roll_transactions t JOIN roll_store_purchases p ON p.id=$1
            WHERE t.sender_id=$2 AND t.idempotency_key=$3
          `, [paid.body.purchase.id, buyer, created.body.offer.id]);
          assert.equal(debit.linked_payment, debit.id);
          const publicLookup = await fetch(`${transferUrl}/${created.body.offer.id}`, { headers: { "x-test-user": buyer } });
          assert.equal(publicLookup.status, 200);
          assert.deepEqual(await publicLookup.json(), { transfer: null });
          await client.query("SAVEPOINT invoice_payment_link");
          try {
            await client.query("UPDATE roll_store_purchases SET delivery=jsonb_set(delivery,'{paymentTransactionId}',to_jsonb($2::text)) WHERE id=$1",
              [paid.body.purchase.id, randomUUID()]);
            assert.equal((await status(path, buyer)).result.code, "OFFER_ORDER_MISMATCH");
            assert.equal((await post(path, buyer)).body.code, "OFFER_ORDER_MISMATCH");
            assert.equal((await post(refundPath, seller)).body.code, "ORDER_PAYMENT_NOT_FOUND");
            assert.equal((await readRollReceipt(client, buyer, { kind: "transfer", id: debit.id })).orderId, null);
          } finally {
            await client.query("ROLLBACK TO SAVEPOINT invoice_payment_link");
            await client.query("RELEASE SAVEPOINT invoice_payment_link");
          }
          assert.deepEqual(await status(refundPath, seller), { code: 200, result: { purchase: null } });
          await client.query("SAVEPOINT corrupt_lookup");
          try {
            await client.query("UPDATE roll_store_purchases SET amount=2 WHERE id=$1", [paid.body.purchase.id]);
            assert.equal((await status(path, buyer)).result.code, "OFFER_ORDER_MISMATCH");
          } finally { await client.query("ROLLBACK TO SAVEPOINT corrupt_lookup"); }
          const buyerBalance = async () => (await client.query("SELECT balance::text FROM roll_wallets WHERE user_id=$1", [buyer])).rows[0].balance;
          assert.equal(await buyerBalance(), "99");
          assert.equal((await client.query("SELECT balance::text FROM roll_wallets WHERE user_id=$1", [seller])).rows[0].balance, "101");
          const expensive = await post("", seller, { ...terms, priceRolls: 101, idempotencyKey: randomUUID() });
          const insufficient = await post(`/${expensive.body.offer.id}/pay`, buyer);
          assert.equal(insufficient.status, 409); assert.equal(insufficient.body.code, "INSUFFICIENT_ROLLS");
          const expired = await post("", seller, { ...terms, idempotencyKey: randomUUID() });
          await client.query("UPDATE business_personal_offers SET created_at=clock_timestamp()-INTERVAL '2 hours',expires_at=clock_timestamp()-INTERVAL '1 hour' WHERE id=$1", [expired.body.offer.id]);
          const expiredPayment = await post(`/${expired.body.offer.id}/pay`, buyer);
          assert.equal(expiredPayment.status, 409); assert.equal(expiredPayment.body.code, "OFFER_EXPIRED");
          assert.equal(await buyerBalance(), "99");
          assert.equal((await client.query("SELECT count(*)::int AS count FROM roll_store_purchases WHERE user_id=$1", [buyer])).rows[0].count, 1);
          assert.equal((await post(refundPath, seller, { expectedPriceRolls: 2 })).body.code, "OFFER_PRICE_CHANGED");
          for (const id of [buyer, other]) {
            const denied = await post(refundPath, id);
            assert.equal(denied.status, 404);
            assert.equal(denied.body.code, "OFFER_NOT_FOUND");
          }
          assert.equal((await post(`/${expensive.body.offer.id}/refund`, seller)).body.code, "OFFER_NOT_PAID");
          await client.query("SAVEPOINT refund_recipient_capacity");
          try {
            await client.query("UPDATE roll_wallets SET balance=$1 WHERE user_id=$2", [ROLLS_MAX_BALANCE, buyer]);
            const limit = await post(refundPath, seller);
            assert.equal(limit.status, 409);
            assert.equal(limit.body.code, "RECIPIENT_BALANCE_LIMIT");
            assert.equal((await readRollWallet(client, seller)).balance, 101);
            assert.equal((await readRollOrders(client, buyer)).orders[0].status, "placed");
          } finally { await client.query("ROLLBACK TO SAVEPOINT refund_recipient_capacity"); }

          await blockBrand();
          await client.query("UPDATE business_marketplace_items SET active=FALSE WHERE id=$1", [product.id]);
          assert.equal((await listOffer(buyer)).status, "paid");
          assert.equal((await status(path, buyer)).result.purchase.id, paid.body.purchase.id);
          await client.query("SAVEPOINT historical_invoice");
          try {
            await client.query("UPDATE roll_store_purchases SET delivery=delivery-'paymentTransactionId' WHERE id=$1", [paid.body.purchase.id]);
            assert.equal((await status(path, buyer)).result.purchase.id, paid.body.purchase.id);
            assert.equal((await post(refundPath, seller, { expectedPriceRolls: 1 })).body.purchase.replayed, false);
            assert.equal((await post(refundPath, seller)).body.purchase.replayed, true);
            assert.equal((await readRollReceipt(client, buyer, { kind: "transfer", id: debit.id })).orderId, paid.body.purchase.id);
          } finally {
            await client.query("ROLLBACK TO SAVEPOINT historical_invoice");
            await client.query("RELEASE SAVEPOINT historical_invoice");
          }

          const refunded = await post(refundPath, seller, { expectedPriceRolls: 1 });
          assert.equal(refunded.status, 200);
          assert.equal(refunded.body.purchase.replayed, false);
          const refundStatus = await status(refundPath, seller);
          assert.equal(refundStatus.result.purchase.refundedAt, refunded.body.purchase.refundedAt);
          assert.equal(refundStatus.result.purchase.id, paid.body.purchase.id);
          assert.equal((await status(path, buyer)).result.purchase.refundedAt, refunded.body.purchase.refundedAt);
          assert.equal(readOnlyRequests, 14);
          assert.equal((await post(refundPath, seller)).body.purchase.replayed, true);
          assert.equal((await post(`/${created.body.offer.id.toUpperCase()}/refund`, seller)).body.purchase.replayed, true);
          const paidReplay = await post(path, buyer);
          assert.equal(paidReplay.body.purchase.refundedAt, refunded.body.purchase.refundedAt);
          for (const userId of [buyer, seller]) {
            const response = await fetch(`http://127.0.0.1:${server.address().port}/api/personal-offers`, { headers: { "x-test-user": userId } });
            const { offers } = await response.json();
            assert.equal(offers.find(({ id }) => id === created.body.offer.id).status, "refunded");
            const wallet = await readRollWallet(client, userId);
            assert.equal(wallet.balance, 100);
            assert.equal(wallet.transactions.filter(({ note }) => note.startsWith("Возврат по счёту")).length, 1);
            assert.equal(wallet.transactions.some(({ kind }) => kind === "purchase" || kind === "refund"), false, "Invoice transfers must not be counted again as store orders");
            const transfers = wallet.transactions.filter(({ kind }) => kind === "transfer");
            const receipts = [];
            for (const { id, kind } of transfers) receipts.push(await readRollReceipt(client, userId, { id, kind }));
            assert.deepEqual(receipts.map(({ purpose }) => purpose).sort(), ["personal_offer_payment", "personal_offer_refund"]);
            assert(receipts.every(({ orderId }) => orderId === paid.body.purchase.id));
            assert.equal(await readRollReceipt(client, other, { id: transfers[0].id, kind: "transfer" }), null);
          }
          assert.equal((await readRollOrders(client, buyer)).orders[0].status, "refunded");
          const audit = await reconcileRollAccounting(client);
          assert.equal(audit.unaccountedRolls, "0");
          assert.equal(audit.walletMismatches, 0);
          assert.equal(audit.cardMismatches, 0);
        } finally { await client.query("ROLLBACK TO SAVEPOINT http_invoice_lifecycle"); }
        await client.query("SAVEPOINT wishlist_checkout");
        try {
          await client.query("UPDATE users SET business_category='seller',seller_space='products' WHERE id=$1",[seller]);
          await client.query("INSERT INTO wishlist_business_pages(business_user_id,space,title,published) VALUES($1,'products','Seller page',TRUE)",[seller]);
          const wishlistItem=randomUUID();
          await client.query("INSERT INTO wishlist_business_items(id,business_user_id,space,title,price) VALUES($1,$2,'products','Original wishlist item','999 RUB')",[wishlistItem,seller]);
          const grant=()=>client.query("INSERT INTO sphere_section_shares(owner_user_id,viewer_user_id,sphere,section) VALUES($1,$2,'wishlist','products')",[buyer,seller]);
          await grant();
          const request=async(path,body,userId=buyer)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method:body?"POST":"GET",headers:{"x-test-user":userId,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,body:await response.json()};};
          const terms={buyerId:buyer,priceRolls:40,durationHours:24,idempotencyKey:randomUUID()};
          const path=`/wishlist-business/products/items/${wishlistItem}/recommend`;
          const account = (space) => request(`/wishlist-business/${space}/accounts`).then(({ body }) =>
            body.accounts.find(entry => entry.username === `offer-${seller}`));
          await blockBrand();
          assert.deepEqual((await request("/wishlist-business/products/buyers", null, seller)).body.buyers, []);
          const grantOnly = await request(path, terms, seller);
          assert.equal(grantOnly.status, 403);
          assert.equal(grantOnly.body.code, "OFFER_CONSENT_REQUIRED");
          const direct = await request("/personal-offers", {
            itemId: wishlistItem, itemSource: "wishlist", recipientId: buyer,
            priceRolls: terms.priceRolls, durationHours: terms.durationHours, idempotencyKey: terms.idempotencyKey,
          }, seller);
          assert.equal(direct.body.code, "OFFER_CONSENT_REQUIRED");
          await client.query("UPDATE wishlist_business_pages SET published=FALSE WHERE business_user_id=$1 AND space='products'", [seller]);
          assert.equal((await account("products")).storefrontTitle, null);
          assert.equal(await account("places"), undefined);
          await client.query("UPDATE users SET seller_space=NULL WHERE id=$1", [seller]);
          assert.equal((await account("places")).storefrontTitle, null);
          await client.query("UPDATE users SET seller_space='products' WHERE id=$1", [seller]);
          await client.query("UPDATE wishlist_business_pages SET published=TRUE WHERE business_user_id=$1 AND space='products'", [seller]);
          await allowBrand();
          assert.equal((await account("products")).offerConsent, true);
          const recommendation=await request(path,terms,seller);
          assert.equal(recommendation.status,200,JSON.stringify(recommendation.body));
          const paymentId=recommendation.body.personalOfferId;
          assert(paymentId); assert.equal((await request(path,terms,seller)).body.personalOfferId,paymentId);
          const invoiceStatus = async () => (await request("/personal-offers")).body.offers.find(({ id }) => id === paymentId).status;
          assert.equal(await invoiceStatus(), "active");
          const listed=await request('/wishlist-business/products/offers');
          assert.equal(listed.body.items[0].personalOffer.priceRolls,40);assert.equal(listed.body.items[0].personalOffer.id,paymentId);
          assert.equal((await request('/wishlist-business/products/offers',null,other)).body.items.length,0);
          await client.query("UPDATE wishlist_business_items SET title='Changed',price='10000 RUB' WHERE id=$1",[wishlistItem]);
          assert.equal((await request('/wishlist-business/products/offers')).body.items[0].title,'Original wishlist item');
          await blockBrand();
          assert.equal((await account("products")).offerConsent, false);
          assert.equal((await request(path, { ...terms, idempotencyKey: randomUUID() }, seller)).body.code, "OFFER_CONSENT_REQUIRED");
          assert.equal((await request(path, terms, seller)).body.personalOfferId, paymentId);
          await client.query("SAVEPOINT wishlist_grant_only");
          try {
            const paymentPath = `/personal-offers/${paymentId}/pay`;
            const before = await balances();
            await client.query("UPDATE wishlist_business_pages SET published=FALSE WHERE business_user_id=$1 AND space='products'", [seller]);
            assert.equal(await invoiceStatus(), "unavailable");
            const unpublished = await request(paymentPath, {});
            assert.equal(unpublished.status, 403);
            assert.equal(unpublished.body.code, "OFFER_ACCESS_REVOKED");
            assert.deepEqual(await balances(), before);
            await client.query("UPDATE wishlist_business_pages SET published=TRUE WHERE business_user_id=$1 AND space='products'", [seller]);
            const granted = await request(paymentPath, {});
            assert.equal(granted.status, 201, JSON.stringify(granted.body));
          } finally {
            await client.query("ROLLBACK TO SAVEPOINT wishlist_grant_only");
            await client.query("RELEASE SAVEPOINT wishlist_grant_only");
          }
          await client.query("DELETE FROM sphere_section_shares WHERE owner_user_id=$1 AND viewer_user_id=$2 AND sphere='wishlist'",[buyer,seller]);
          assert.equal(await invoiceStatus(), "unavailable");
          const denied=await request(`/personal-offers/${paymentId}/pay`,{});assert.equal(denied.status,403);assert.equal(denied.body.code,'OFFER_ACCESS_REVOKED');
          await allowBrand();
          const buyers = await request('/wishlist-business/products/buyers',null,seller);
          assert.deepEqual(buyers.body.buyers.map(person => person.id), [buyer]);
          const paid=await request(`/personal-offers/${paymentId}/pay`,{});assert.equal(paid.status,201,JSON.stringify(paid.body));
          assert.equal((await request(`/personal-offers/${paymentId}/pay`,{})).status,200);
          assert.equal((await client.query("SELECT balance::text FROM roll_wallets WHERE user_id=$1",[buyer])).rows[0].balance,'60');
          assert.equal((await request('/wishlist-business/products/offers')).body.items[0].personalOffer.status,'paid');
          assert.equal((await request(`/personal-offers/${paymentId}/refund`, {}, seller)).status, 200);
          assert.equal((await request('/wishlist-business/products/offers')).body.items[0].personalOffer.status, 'refunded');
          const subscribed = await request(path, {...terms, idempotencyKey: randomUUID()},seller);
          assert.equal(subscribed.status,200);
        } finally { await client.query("ROLLBACK TO SAVEPOINT wishlist_checkout"); }
      } finally { await new Promise(resolve => server.close(resolve)); }
    });
    await t.test("frozen terms, exact transfer, order, replay and guarded refund", async () => {
      await client.query("UPDATE business_marketplace_items SET title='Changed title',price_rolls=99 WHERE id=$1", [product.id]);
      const paid = await payPersonalOffer(client, buyer, offer.id);
      const order = (await client.query("SELECT product_title,amount FROM roll_store_purchases WHERE id=$1", [paid.id])).rows[0];
      assert.deepEqual(order, { product_title: "Frozen title", amount: "40" });
      assert.equal((await client.query("SELECT balance::text FROM roll_wallets WHERE user_id=$1", [buyer])).rows[0].balance, "60");
      assert.equal((await client.query("SELECT balance::text FROM roll_wallets WHERE user_id=$1", [seller])).rows[0].balance, "140");
      const before = await balances(); assert.deepEqual(await payPersonalOffer(client, buyer, offer.id), { id: paid.id, replayed: true }); assert.deepEqual(await balances(), before);
      await reject(() => refundRollPurchase(client, buyer, paid.id), "SELLER_REFUND_REQUIRED");
    });
    await t.test("expired and insufficient-funds offers do not move money or create orders", async () => {
      const expired = await createPersonalOffer(client, seller, { ...data, idempotencyKey: randomUUID() });
      await client.query("UPDATE business_personal_offers SET created_at=clock_timestamp()-INTERVAL '2 hours',expires_at=clock_timestamp()-INTERVAL '1 hour' WHERE id=$1", [expired.id]);
      await reject(() => payPersonalOffer(client, buyer, expired.id), "OFFER_EXPIRED");
      const costly = await createPersonalOffer(client, seller, { ...data, priceRolls: 100, idempotencyKey: randomUUID() });
      await reject(() => payPersonalOffer(client, buyer, costly.id), "INSUFFICIENT_ROLLS");
      assert.equal((await client.query("SELECT count(*)::int AS count FROM roll_store_purchases WHERE user_id=$1", [buyer])).rows[0].count, 1);
    });
  } finally { await client.query("ROLLBACK"); client.release(); await db.pool.end(); }
});
