import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerWishlistBusinessRoutes } from "./wishlist-business.js";

test("public seller profile scopes published products to the exact username and space without exposing owner APIs", async () => {
  const calls = [];
  const app = express();
  registerWishlistBusinessRoutes(app, {
    requireAuth: (_req, res) => res.status(401).json({ error: "Authentication required" }),
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [] };
    },
    transaction: () => { throw new Error("Read must not open a write transaction"); },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${origin}/api/wishlist-business/products/profiles/studio`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), { items: [], pages: [] });
    assert.equal(calls.length, 2);
    for (const { sql, params } of calls) {
      assert.deepEqual(params, ["products", "studio"]);
      assert.match(sql, /u\.username=\$2/);
      assert.match(sql, /p\.published/);
      assert.match(sql, /u\.account_type='business'/);
      assert.match(sql, /u\.business_category='seller'/);
      assert.match(sql, /u\.seller_space IS NULL OR u\.seller_space=/);
      assert.match(sql, /space=\$1/);
    }
    assert.match(calls[0].sql, /i\.active/);
    const before = calls.length;
    for (const path of ["/products/page", "/products/store", "/products/buyers", "/products/offers"]) {
      assert.equal((await fetch(`${origin}/api/wishlist-business${path}`)).status, 401);
    }
    assert.equal((await fetch(`${origin}/api/wishlist-business/unknown/profiles/studio`)).status, 404);
    assert.equal(calls.length, before, "Invalid scope and private reads must not query products");
  } finally { await new Promise(resolve => server.close(resolve)); }
});
