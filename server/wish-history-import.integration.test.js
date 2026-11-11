import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import { registerWishHistoryImport } from "./wish-history-import.js";

test("purchase import isolates list ownership, keeps private cards and deduplicates on configured PostgreSQL", {
  skip: process.env.ROLLAPP_TEST_WISH_HISTORY !== "1",
}, async () => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  const client = await db.pool.connect();
  let server;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='10s'");
    const [owner, other, list] = Array.from({ length: 3 }, () => randomUUID());
    for (const user of [owner, other]) {
      await client.query(
        "INSERT INTO users (id,email,username,name,password_hash) VALUES ($1,$2,$3,$4,'unusable')",
        [user, `${user}@purchase-history-test.invalid`, `purchase-test-${user}`, "Purchase test"],
      );
    }
    await client.query(
      "INSERT INTO wishlists (id,user_id,title,share_token,space) VALUES ($1,$2,'Test list',$3,'products')",
      [list, owner, randomUUID()],
    );
    const app = express();
    app.use(express.json());
    registerWishHistoryImport(app, {
      requireAuth(req, res, next) {
        const user = req.headers.authorization;
        if (![owner, other].includes(user)) return res.sendStatus(401);
        req.user = { id: user };
        next();
      },
      asyncRoute: (callback) => (req, res, next) => callback(req, res).catch(next),
      transaction: (callback) => callback(client),
    });
    server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    const send = async (payload, auth = owner) => {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/wishes/import-history`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify(payload),
      });
      return [res.status, await res.json().catch(() => null)];
    };
    const book = { title: "Книга", price: null, currency: "RUB" };
    const tea = { title: "Чай зелёный", price: 149.95, currency: "RUB" };
    const data = { listId: list, space: "products", items: [book, tea, { ...tea, title: " ЧАЙ   ЗЕЛЁНЫЙ " }] };
    assert.equal((await send(data, "")).at(0), 401);
    assert.equal((await send(data, other)).at(0), 404);
    assert.equal((await send({ ...data, space: "food" })).at(0), 404);
    assert.equal((await send({ ...data, items: [{ ...book, operation: { amount: 300 } }] })).at(0), 400);
    assert.deepEqual(await send(data), [201, { created: 2, skipped: 1 }]);
    assert.deepEqual(await send(data), [200, { created: 0, skipped: 3 }]);
    const { rows } = await client.query(
      `SELECT w.title,w.price::float,w.currency,w.privacy,w.space,ww.wishlist_id
       FROM wishes w JOIN wishlist_wishes ww ON ww.wish_id=w.id
       WHERE w.user_id=$1 ORDER BY w.price NULLS FIRST`,
      [owner],
    );
    assert.deepEqual(rows, [book, tea].map((item) => ({ ...item, privacy: "private", space: "products", wishlist_id: list })));
    assert.deepEqual(await send({ listId: null, space: "products", items: [tea] }), [201, { created: 1, skipped: 0 }]);
    assert.deepEqual(await send({ listId: null, space: "products", items: [tea] }), [200, { created: 0, skipped: 1 }]);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM wishes WHERE user_id=$1", [other])).rows[0].count, 0);
  } finally {
    try {
      if (server) await new Promise((resolve) => server.close(resolve));
      await client.query("ROLLBACK");
    } finally {
      client.release();
      await db.pool.end();
    }
  }
});
