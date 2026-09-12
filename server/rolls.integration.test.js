import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import { registerRollsRoutes } from "./rolls-routes.js";
import {
  enrollWishRewards,
  ensureRollWallet,
  grantRolls,
  grantWishReward,
  readRollWallet,
  rollsSchema,
  transferRolls,
} from "./rolls.js";
import { ROLLS_MAX_BALANCE } from "../shared/rolls.js";

test("rolls transactions on configured production PostgreSQL, with every write rolled back", { skip: process.env.ROLLAPP_TEST_ROLLS !== "1" }, async (t) => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query(rollsSchema);
    const [alice, bob, other] = [randomUUID(), randomUUID(), randomUUID()];
    for (const [index, id] of [alice, bob, other].entries()) {
      await client.query("INSERT INTO users (id,email,username,name,password_hash) VALUES ($1,$2,$3,$4,$5)", [id, `${id}@rolls-test.invalid`, `rolls-test-${id}`, `Rolls test ${index}`, "unusable"]);
    }
    const balances = async () => (await client.query("SELECT user_id,balance::text FROM roll_wallets WHERE user_id=ANY($1::text[]) ORDER BY user_id", [[alice, bob, other]])).rows;
    const rejectWithoutChanges = async (input, code) => {
      const before = await balances();
      await client.query("SAVEPOINT rejected_transfer");
      await assert.rejects(transferRolls(client, alice, input), (error) => error.code === code);
      await client.query("ROLLBACK TO SAVEPOINT rejected_transfer");
      assert.deepEqual(await balances(), before);
    };

    await t.test("welcome grant is once, also after the wallet has been spent", async () => {
      assert.equal(await ensureRollWallet(client, alice), true);
      assert.equal(await ensureRollWallet(client, alice), false);
      assert.equal((await readRollWallet(client, alice)).balance, 100);
      assert.equal((await readRollWallet(client, alice)).transactions.length, 1);
    });

    await t.test("manual grant is idempotent and appears in history", async () => {
      await client.query("SAVEPOINT manual_grant_check");
      try {
        const idempotencyKey = `test:${randomUUID()}`;
        const input = { amount: 2000, reason: "Ручное начисление", idempotencyKey };
        const first = await grantRolls(client, alice, input);
        assert.equal(first.replayed, false);
        assert.equal(first.balance, 2100);
        const replay = await grantRolls(client, alice, input);
        assert.equal(replay.replayed, true);
        assert.equal(replay.id, first.id);
        assert.equal(replay.balance, 2100);
        const wallet = await readRollWallet(client, alice);
        const grant = wallet.transactions.find((item) => item.kind === "manual_grant");
        assert.equal(grant.amount, 2000);
        assert.equal(grant.note, "Ручное начисление");
        assert.equal(grant.person, null);
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT manual_grant_check");
      }
    });

    await t.test("only newly enrolled users receive 100 rolls for each of their first ten wishes", async () => {
      await client.query("SAVEPOINT wish_reward_check");
      try {
        const userId = randomUUID();
        await client.query(
          "INSERT INTO users (id,email,username,name,password_hash) VALUES ($1,$2,$3,$4,$5)",
          [userId, `${userId}@rolls-test.invalid`, `rolls-test-${userId}`, "Wish rewards test", "unusable"],
        );
        await ensureRollWallet(client, userId);
        assert.equal(await enrollWishRewards(client, userId), true);
        assert.equal(await enrollWishRewards(client, userId), false);

        const grants = [];
        const wishIds = Array.from({ length: 11 }, () => randomUUID());
        for (let index = 1; index <= 11; index += 1) {
          grants.push(await grantWishReward(client, userId, { id: wishIds[index - 1], title: `Желание ${index}` }));
        }
        assert.deepEqual(grants.slice(0, 10).map((grant) => grant.ordinal), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        assert.equal(grants.every((grant, index) => grant.granted === (index < 10)), true);
        assert.equal(grants[9].remaining, 0);
        assert.equal(grants[10].limit, 10);

        const duplicate = await grantWishReward(client, userId, { id: wishIds[0], title: "Повтор первого желания" });
        assert.equal(duplicate.granted, false);
        assert.equal(duplicate.ordinal, 1);
        assert.equal((await readRollWallet(client, userId)).balance, 1100);
        const history = (await readRollWallet(client, userId)).transactions;
        assert.equal(history.filter((item) => item.kind === "wish_reward").length, 10);
        assert.equal(history.find((item) => item.kind === "wish_reward").person, null);

        assert.deepEqual(await grantWishReward(client, other, { id: randomUUID(), title: "Старый пользователь" }), { granted: false });
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT wish_reward_check");
      }
    });

    const input = { recipientId: bob, amount: 75, note: "Спасибо!", idempotencyKey: randomUUID() };
    await t.test("transfer conserves balances and appears in both private histories", async () => {
      await transferRolls(client, alice, input);
      const sender = await readRollWallet(client, alice);
      const recipient = await readRollWallet(client, bob);
      assert.equal(sender.balance, 25);
      assert.equal(recipient.balance, 175);
      const sent = sender.transactions.find((item) => item.kind === "transfer");
      const received = recipient.transactions.find((item) => item.kind === "transfer");
      assert.equal(sent.direction, "outgoing");
      assert.equal(sent.note, "Спасибо!");
      assert.equal(received.direction, "incoming");
      assert.equal(sent.id, received.id);
      assert.equal(sent.person.id, bob);
      assert.equal(received.person.id, alice);
      assert.equal(await ensureRollWallet(client, alice), false);
      assert.equal((await readRollWallet(client, alice)).balance, 25);
      const outsider = await readRollWallet(client, other);
      assert.equal(outsider.transactions.length, 1);
      assert.equal(outsider.transactions[0].kind, "welcome");
    });

    await t.test("replaying an already spent request never debits again", async () => {
      const before = await balances();
      const replay = await transferRolls(client, alice, input);
      assert.equal(replay.replayed, true);
      assert.deepEqual(await balances(), before);
      await rejectWithoutChanges({ ...input, amount: 10 }, "IDEMPOTENCY_CONFLICT");
      await rejectWithoutChanges({ ...input, recipientId: other }, "IDEMPOTENCY_CONFLICT");
      await rejectWithoutChanges({ ...input, note: "Другое" }, "IDEMPOTENCY_CONFLICT");
    });

    await t.test("overdraft, self-transfer and missing recipient leave balances intact", async () => {
      await rejectWithoutChanges({ ...input, amount: 26, idempotencyKey: randomUUID() }, "INSUFFICIENT_ROLLS");
      await rejectWithoutChanges({ ...input, recipientId: alice }, "SELF_TRANSFER");
      await rejectWithoutChanges({ ...input, recipientId: randomUUID() }, "RECIPIENT_NOT_FOUND");
    });

    await t.test("recipient capacity failure rolls back the preceding debit", async () => {
      await client.query("SAVEPOINT capacity_check");
      await client.query("UPDATE roll_wallets SET balance=$1 WHERE user_id=$2", [ROLLS_MAX_BALANCE, bob]);
      await rejectWithoutChanges({ ...input, amount: 1, idempotencyKey: randomUUID() }, "RECIPIENT_BALANCE_LIMIT");
      await client.query("ROLLBACK TO SAVEPOINT capacity_check");
    });

    await t.test("history pagination and same request key for different senders", async () => {
      const first = await readRollWallet(client, alice, { limit: 1 });
      const second = await readRollWallet(client, alice, { offset: first.nextOffset, limit: 1 });
      assert.equal(first.nextOffset, 1);
      assert.equal(second.nextOffset, null);
      assert.notEqual(first.transactions[0].id, second.transactions[0].id);
      const result = await transferRolls(client, bob, { ...input, recipientId: alice, amount: 5 });
      assert.equal(result.replayed, false);
      assert.equal((await readRollWallet(client, alice)).balance, 30);
      assert.equal((await readRollWallet(client, bob)).balance, 170);
    });

    await t.test("database independently rejects negative balances and duplicate grants", async () => {
      await client.query("SAVEPOINT constraint_check");
      await assert.rejects(client.query("UPDATE roll_wallets SET balance=-1 WHERE user_id=$1", [alice]), { code: "23514" });
      await client.query("ROLLBACK TO SAVEPOINT constraint_check");
      await assert.rejects(client.query("INSERT INTO roll_transactions (id,kind,recipient_id,amount) VALUES ($1,'welcome',$2,100)", [randomUUID(), alice]), { code: "23505" });
      await client.query("ROLLBACK TO SAVEPOINT constraint_check");
    });

    await t.test("HTTP authentication, sender isolation, search privacy and errors", async () => {
      const app = express();
      app.use(express.json());
      // Only the authentication context is a fixture; all queries use the real
      // PostgreSQL connection and the outer transaction is always rolled back.
      const requireAuth = (req, res, next) => {
        if (req.headers["x-test-user"] !== alice) return res.status(401).json({ error: "Unauthorized" });
        req.user = { id: alice };
        next();
      };
      registerRollsRoutes(app, {
        requireAuth,
        query: (...args) => client.query(...args),
        transaction: async (callback) => {
          await client.query("SAVEPOINT http_request");
          try { return await callback(client); }
          catch (error) { await client.query("ROLLBACK TO SAVEPOINT http_request"); throw error; }
        },
      });
      const server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
      const origin = `http://127.0.0.1:${server.address().port}`;
      const request = (path, body, authenticated = true) => fetch(`${origin}/api${path}`, {
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json", ...(authenticated ? { "x-test-user": alice } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      try {
        for (const path of ["/rolls", "/rolls/recipients?q=test", "/rolls/transfers"]) {
          assert.equal((await request(path, path.endsWith("transfers") ? input : null, false)).status, 401);
        }
        const own = await request(`/rolls?userId=${bob}`);
        assert.equal(own.headers.get("cache-control"), "no-store");
        assert.equal((await own.json()).balance, 30);
        assert.equal((await request("/rolls?offset=-1")).status, 400);
        assert.equal((await request("/rolls/transfers", { ...input, senderId: bob })).status, 400);
        assert.equal((await request("/rolls/transfers", { ...input, amount: 100, idempotencyKey: randomUUID() })).status, 409);
        const search = await request(`/rolls/recipients?q=${bob}`);
        const found = (await search.json()).people;
        assert.equal(found.length, 1);
        assert.equal(found[0].id, bob);
        assert.deepEqual(Object.keys(found[0]).sort(), ["avatarUrl", "id", "name", "username"]);
        assert.deepEqual((await (await request("/rolls/recipients?q=%25%25")).json()).people, []);
        const httpInput = { ...input, amount: 1, idempotencyKey: randomUUID() };
        assert.equal((await request("/rolls/transfers", httpInput)).status, 201);
        assert.equal((await request("/rolls/transfers", httpInput)).status, 200);
        assert.equal((await (await request("/rolls")).json()).balance, 29);
      } finally { await new Promise((resolve) => server.close(resolve)); }
    });
  } finally {
    await client.query("ROLLBACK");
    client.release();
    // The following top-level test reuses the ESM-cached production pool and
    // closes it after its two-connection serialization check.
  }
});

test("opposite transfers serialize across PostgreSQL connections without persisting changes", { skip: process.env.ROLLAPP_TEST_ROLLS !== "1" }, async (t) => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  const exists = await db.query("SELECT to_regclass('roll_wallets') AS wallets");
  if (!exists.rows[0].wallets) { await db.pool.end(); t.skip("Apply the welcome grant before testing concurrent wallet locks."); return; }
  const users = await db.query("SELECT user_id,balance::text FROM roll_wallets WHERE balance>0 ORDER BY user_id LIMIT 2");
  if (users.rowCount < 2) { await db.pool.end(); t.skip("Two funded wallets are needed for the rollback-only lock check."); return; }
  const [firstId, secondId] = users.rows.map((row) => row.user_id);
  const first = await db.pool.connect();
  const second = await db.pool.connect();
  let secondTransfer;
  try {
    await first.query("BEGIN");
    await second.query("BEGIN");
    await second.query("SET LOCAL lock_timeout='5s'");
    const firstPid = (await first.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    const secondPid = (await second.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    await transferRolls(first, firstId, { recipientId: secondId, amount: 1, idempotencyKey: randomUUID() });
    secondTransfer = transferRolls(second, secondId, { recipientId: firstId, amount: 1, idempotencyKey: randomUUID() });
    secondTransfer.catch(() => {});
    let blocking = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      blocking = (await first.query("SELECT pg_blocking_pids($1) AS pids", [secondPid])).rows[0].pids;
      if (blocking.includes(firstPid)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(blocking.includes(firstPid), "The second connection must wait for the first wallet transaction");
    await first.query("ROLLBACK");
    assert.equal((await secondTransfer).replayed, false);
  } finally {
    await first.query("ROLLBACK");
    if (secondTransfer) await secondTransfer.catch(() => {});
    await second.query("ROLLBACK");
    first.release();
    second.release();
    await db.pool.end();
  }
});
