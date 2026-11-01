import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { registerWishGroupFundraisingRoutes } from "./wish-group-fundraising.js";
import { ROLLS_MAX_BALANCE } from "../shared/rolls.js";

test("group fundraising uses existing production schema; all test data and transfers roll back", { skip: process.env.ROLLAPP_TEST_GROUP_FUNDRAISING !== "1" }, async t => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  const client = await db.pool.connect();
  let server;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    // Do not initialize/migrate production, even inside a rolled-back test.
    await client.query("SELECT id,group_id,target FROM wish_group_fundraisers LIMIT 0");
    await client.query("SELECT transaction_id FROM wish_group_contributions LIMIT 0");
    const [owner, donor, stranger, listId, groupId, wishId] = Array.from({ length: 6 }, () => randomUUID());
    for (const id of [owner, donor, stranger]) {
      await client.query("INSERT INTO users (id,email,username,name,password_hash) VALUES ($1,$2,$3,$4,'unusable')", [id, `${id}@fundraising.invalid`, `fund-${id}`, "Fundraising verification"]);
      await client.query("INSERT INTO roll_wallets (user_id,balance) VALUES ($1,500)", [id]);
      await client.query("INSERT INTO roll_transactions (id,kind,recipient_id,amount) VALUES ($1,'welcome',$2,100)", [randomUUID(), id]);
    }
    await client.query("INSERT INTO wishlists (id,user_id,title,share_token,space) VALUES ($1,$2,'Часы',$3,'products')", [listId, owner, randomUUID()]);
    await client.query("INSERT INTO wishes (id,user_id,title,space) VALUES ($1,$2,'Часы','products')", [wishId, owner]);
    await client.query("INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)", [listId, wishId]);
    await client.query("INSERT INTO wish_groups (id,wishlist_id,space,title) VALUES ($1,$2,'products','Часы')", [groupId, listId]);
    await client.query("INSERT INTO wish_group_members (group_id,wishlist_id,space,wish_id) VALUES ($1,$2,'products',$3)", [groupId, listId, wishId]);
    const app = express(); app.use(express.json());
    app.use((req, res, next) => { if (req.headers["x-test-user"]) req.user = { id: req.headers["x-test-user"] }; next(); });
    let savepoint = 0;
    registerWishGroupFundraisingRoutes(app, {
      query: (...args) => client.query(...args),
      requireAuth: (req, res, next) => req.user ? next() : res.status(401).json({ error: "Authentication required" }),
      transaction: async callback => {
        const name = `fundraising_${++savepoint}`;
        await client.query(`SAVEPOINT ${name}`);
        try { const result = await callback(client); await client.query(`RELEASE SAVEPOINT ${name}`); return result; }
        catch (error) { await client.query(`ROLLBACK TO SAVEPOINT ${name}`); throw error; }
      },
      canViewWish: async wish => wish.privacy !== "private",
    });
    app.use((error, req, res, next) => res.status(500).json({ error: error.message }));
    server = await new Promise(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    const endpoint = `/api/wish-groups/${groupId}/fundraiser`;
    const call = async (method, path = endpoint, body, userId = owner) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { "Content-Type": "application/json", ...(userId ? { "x-test-user": userId } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, ...await response.json() };
    };
    const balances = async () => (await client.query("SELECT user_id,balance::text FROM roll_wallets WHERE user_id=ANY($1::text[]) ORDER BY user_id", [[owner, donor, stranger]])).rows;
    await t.test("guest reads are read-only; only the owner can open a product-group fundraiser", async () => {
      assert.equal((await call("GET", endpoint, undefined, null)).fundraiser, null);
      assert.equal((await call("POST", endpoint, { target: 1000 }, null)).status, 401);
      assert.equal((await call("POST", endpoint, { target: 1000 }, stranger)).status, 404);
      const created = await call("POST", endpoint, { target: 1000 });
      assert.equal(created.status, 201); assert.equal(created.fundraiser.target, 1000);
      assert.equal((await call("PATCH", endpoint, { target: 2000, accepting: false }, stranger)).status, 404);
      assert.equal((await call("POST", endpoint, { target: 1000 })).fundraiser.id, created.fundraiser.id);
      await client.query("UPDATE wish_groups SET space='places' WHERE id=$1", [groupId]);
      assert.equal((await call("GET")).status, 404);
      await client.query("UPDATE wish_groups SET space='products' WHERE id=$1", [groupId]);
    });
    const input = { amount: 100, idempotencyKey: randomUUID() };
    await t.test("confirmed contribution is atomic, visible in the existing wallet ledger and replayed exactly once", async () => {
      const before = await balances();
      assert.equal((await call("POST", `${endpoint}/contributions`, { ...input, recipientId: stranger }, donor)).status, 400);
      const first = await call("POST", `${endpoint}/contributions`, input, donor);
      assert.equal(first.status, 201); assert.equal(first.fundraiser.raised, 100); assert.equal(first.fundraiser.contributors, 1);
      const after = await balances();
      assert.equal(Number(after.find(row => row.user_id === owner).balance), 600);
      assert.equal(Number(after.find(row => row.user_id === donor).balance), 400);
      assert.equal(after.reduce((sum, row) => sum + Number(row.balance), 0), before.reduce((sum, row) => sum + Number(row.balance), 0));
      const replay = await call("POST", `${endpoint}/contributions`, input, donor);
      assert.equal(replay.status, 200); assert.equal(replay.id, first.id); assert.equal(replay.replayed, true);
      assert.deepEqual(await balances(), after);
      const conflict = await call("POST", `${endpoint}/contributions`, { ...input, amount: 101 }, donor);
      assert.equal(conflict.code, "IDEMPOTENCY_CONFLICT"); assert.deepEqual(await balances(), after);
      const ledger = await client.query("SELECT kind,amount::int,note FROM roll_transactions WHERE id=$1", [first.id]);
      assert.deepEqual(ledger.rows[0], { kind: "transfer", amount: 100, note: "Сбор «Часы»" });
    });
    await t.test("self, insufficient balance, target overflow and closed fund cannot debit wallets", async () => {
      const before = await balances();
      for (const [userId, amount, code] of [[owner, 1, "SELF_TRANSFER"], [donor, 501, "INSUFFICIENT_ROLLS"], [donor, 901, "TARGET_EXCEEDED"]]) {
        const result = await call("POST", `${endpoint}/contributions`, { amount, idempotencyKey: randomUUID() }, userId);
        assert.equal(result.code, code); assert.deepEqual(await balances(), before);
      }
      assert.equal((await call("PATCH", endpoint, { target: 99, accepting: true })).code, "TARGET_BELOW_RAISED");
      await client.query("SAVEPOINT recipient_limit");
      await client.query("UPDATE roll_wallets SET balance=$1 WHERE user_id=$2", [ROLLS_MAX_BALANCE, owner]);
      const limited = await balances();
      assert.equal((await call("POST", `${endpoint}/contributions`, { amount: 1, idempotencyKey: randomUUID() }, donor)).code, "RECIPIENT_BALANCE_LIMIT");
      assert.deepEqual(await balances(), limited);
      await client.query("ROLLBACK TO SAVEPOINT recipient_limit");
      assert.equal((await call("PATCH", endpoint, { target: 1000, accepting: false })).fundraiser.status, "closed");
      assert.equal((await call("POST", `${endpoint}/contributions`, { amount: 1, idempotencyKey: randomUUID() }, donor)).code, "FUNDRAISER_CLOSED");
      assert.equal((await call("POST", `${endpoint}/contributions`, input, donor)).status, 200);
      assert.deepEqual(await balances(), before);
      await call("PATCH", endpoint, { target: 1000, accepting: true });
    });
    await t.test("private/follower/link lists and hidden members retain source access checks", async () => {
      const before = await balances();
      await client.query("UPDATE wishlists SET privacy='private' WHERE id=$1", [listId]);
      assert.equal((await call("GET", endpoint, undefined, stranger)).status, 404);
      assert.equal((await call("POST", `${endpoint}/contributions`, { amount: 1, idempotencyKey: randomUUID() }, stranger)).status, 404);
      await client.query("UPDATE wishlists SET privacy='followers' WHERE id=$1", [listId]);
      assert.equal((await call("GET", endpoint, undefined, stranger)).status, 404);
      await client.query("INSERT INTO follows (follower_id,following_id) VALUES ($1,$2)", [stranger, owner]);
      assert.equal((await call("GET", endpoint, undefined, stranger)).status, 200);
      await client.query("UPDATE wishlists SET privacy='link',share_token='fundraising-test-link' WHERE id=$1", [listId]);
      assert.equal((await call("GET", endpoint, undefined, stranger)).status, 404);
      assert.equal((await call("GET", `${endpoint}?shareToken=fundraising-test-link`, undefined, null)).status, 200);
      await client.query("UPDATE wishes SET privacy='private' WHERE id=$1", [wishId]);
      assert.equal((await call("GET", `${endpoint}?shareToken=fundraising-test-link`, undefined, null)).status, 404);
      await client.query("UPDATE wishes SET privacy='public' WHERE id=$1", [wishId]);
      await client.query("UPDATE wishlists SET privacy='public' WHERE id=$1", [listId]);
      assert.deepEqual(await balances(), before);
    });
    await t.test("completion stops further payments; group deletion preserves contributions and wallet history", async () => {
      await call("PATCH", endpoint, { target: 200, accepting: true });
      const final = await call("POST", `${endpoint}/contributions`, { amount: 100, idempotencyKey: randomUUID() }, donor);
      assert.equal(final.fundraiser.status, "completed"); assert.equal(final.fundraiser.contributors, 1);
      assert.equal((await call("POST", `${endpoint}/contributions`, { amount: 1, idempotencyKey: randomUUID() }, stranger)).code, "FUNDRAISER_CLOSED");
      await client.query("DELETE FROM wish_groups WHERE id=$1", [groupId]);
      const archived = await client.query("SELECT group_id FROM wish_group_fundraisers WHERE id=$1", [final.fundraiser.id]);
      assert.equal(archived.rows[0].group_id, null);
      assert.equal((await client.query("SELECT transaction_id FROM wish_group_contributions WHERE fundraiser_id=$1", [final.fundraiser.id])).rowCount, 2);
      assert.equal((await client.query("SELECT id FROM roll_transactions WHERE id=$1", [final.id])).rowCount, 1);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await client.query("ROLLBACK"); client.release(); await db.pool.end();
  }
});
