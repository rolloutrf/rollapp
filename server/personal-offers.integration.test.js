import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createPersonalOffer, payPersonalOffer, createPersonalOfferItem, registerPersonalOfferRoutes } from "./personal-offers.js";
import { ensureRollWallet, refundRollPurchase } from "./rolls.js";

test("personal offers on existing production schema: every test write is rolled back", { skip: process.env.ROLLAPP_TEST_PERSONAL_OFFERS !== "1" }, async t => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    // Never initialize, migrate or backfill the production database for a test.
    await client.query("SELECT id,purchase_id FROM business_personal_offers LIMIT 0");
    const [seller, buyer, other, itemId] = Array.from({ length: 4 }, () => randomUUID());
    for (const [id, type] of [[seller,"business"],[buyer,"personal"],[other,"personal"]]) {
      await client.query("INSERT INTO users (id,email,username,name,password_hash,account_type) VALUES ($1,$2,$3,'Offer test','unusable',$4)", [id, `${id}@offer-test.invalid`, `offer-${id}`, type]);
      await ensureRollWallet(client, id);
    }
    const product = await createPersonalOfferItem(client, seller, { title: "Frozen title", sphere: "education", itemType: "service", idempotencyKey: itemId });
    const data = { itemId: product.id, recipientId: buyer, priceRolls: 40, durationHours: 24, idempotencyKey: randomUUID() };
    const offer = await createPersonalOffer(client, seller, data);
    const balances = async () => (await client.query("SELECT user_id,balance::text FROM roll_wallets WHERE user_id=ANY($1::text[]) ORDER BY user_id", [[seller,buyer,other]])).rows;
    const reject = async (operation, code) => {
      const before = await balances(); await client.query("SAVEPOINT rejected_offer");
      await assert.rejects(operation, e => e.code === code);
      await client.query("ROLLBACK TO SAVEPOINT rejected_offer"); assert.deepEqual(await balances(), before);
    };
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
      registerPersonalOfferRoutes(app, {
        requireAuth(req, _res, next) { req.user = { id: req.headers["x-test-user"], account_type: req.headers["x-test-user"] === seller ? "business" : "personal" }; next(); },
        query: client.query.bind(client), transaction: async callback => {
          mutationRequests += 1;
          await client.query("SAVEPOINT http_offer_request");
          try { const result = await callback(client); await client.query("RELEASE SAVEPOINT http_offer_request"); return result; }
          catch (error) { await client.query("ROLLBACK TO SAVEPOINT http_offer_request"); await client.query("RELEASE SAVEPOINT http_offer_request"); throw error; }
        },
      });
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
          assert.equal((await post(path, other)).status, 404);
          const paid = await post(path, buyer);
          assert.equal(paid.status, 201);
          const replay = await post(path, buyer);
          assert.equal(replay.status, 200); assert.equal(replay.body.purchase.id, paid.body.purchase.id);
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
        } finally { await client.query("ROLLBACK TO SAVEPOINT http_invoice_lifecycle"); }
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
