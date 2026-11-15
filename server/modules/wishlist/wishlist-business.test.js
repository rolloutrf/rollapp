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
    for (const path of ["/classifieds", "/products/page", "/products/store", "/products/buyers", "/products/offers", "/products/sales"]) {
      assert.equal((await fetch(`${origin}/api/wishlist-business${path}`)).status, 401);
    }
    assert.equal((await fetch(`${origin}/api/wishlist-business/unknown/profiles/studio`)).status, 404);
    assert.equal(calls.length, before, "Invalid scope and private reads must not query products");
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("a visibility-only save preserves storefront metadata and still requires the seller's space", async () => {
  const calls = [];
  const app = express();
  app.use(express.json());
  registerWishlistBusinessRoutes(app, {
    requireAuth: (req, _res, next) => {
      req.user = { id: "seller", name: "Business profile", account_type: "business", business_category: "seller", seller_space: "products" };
      next();
    },
    query: async (sql, params) => { calls.push({ sql, params }); return { rows: [], rowCount: 1 }; },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const save = (space, body) => fetch(`${origin}/api/wishlist-business/${space}/page`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  try {
    assert.equal((await save("places", { published: true })).status, 403);
    assert.equal((await save("products", { published: "true" })).status, 400);
    assert.equal(calls.length, 0);
    const response = await save("products", { published: true });
    assert.deepEqual(await response.json(), { saved: true });
    const [visibility] = calls;
    assert.deepEqual(visibility.params, ["seller", "products", "Business profile", true]);
    assert.match(visibility.sql, /DO UPDATE SET published=\$4,updated_at=CURRENT_TIMESTAMP$/);
    const legacy = await save("products", { title: "Old client title", description: "Old client description", published: false });
    assert.deepEqual(await legacy.json(), { saved: true });
    assert.deepEqual(calls[1].params, ["seller", "products", "Old client title", "Old client description", false]);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("direct sale creation retries in the same owner and space, while wish sales still require a fulfilled source", async () => {
  const app = express();
  app.use(express.json());
  let user = { id: "owner", name: "Owner", account_type: "personal" };
  const items = new Map();
  const calls = [];
  registerWishlistBusinessRoutes(app, {
    requireAuth: (req, _res, next) => { req.user = user; next(); },
    transaction: async (fn) => fn({ query: async (sql, params) => {
      calls.push({ sql, params });
      const [id, owner, space, title, description, brand, imageUrl, actionUrl, price, active] = params;
      if (sql.startsWith("SELECT i.*")) {
        const item = items.get(id);
        return { rows: item?.business_user_id === owner && item.space === space ? [item] : [] };
      }
      if (sql.includes("FROM wishes w") || sql.includes("FROM wish_images")) return { rows: [], rowCount: 0 };
      if (sql.startsWith("INSERT INTO wishlist_business_pages")) return { rowCount: 1 };
      if (sql.startsWith("INSERT INTO wishlist_business_items")) {
        if (items.has(id)) return { rowCount: 0 };
        items.set(id, { id, business_user_id: owner, space, title, description, brand, image_url: imageUrl, action_url: actionUrl, price, active });
        return { rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    } }),
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/wishlist-business`;
  const payload = { title: "Кофемашина", price: "3 500 ₽", active: false };
  const requestId = "63dc864f-d91d-47d4-b035-0a579765f951";
  const create = (body, space = "products") => fetch(`${endpoint}/${space}/sales`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  try {
    for (const invalid of [payload, { ...payload, requestId, wishId: "wish" }, { ...payload, requestId: "invalid" }]) {
      assert.equal((await create(invalid)).status, 400);
    }
    assert.equal(calls.length, 0);
    const response = await create({ ...payload, requestId });
    assert.equal(response.status, 201);
    const first = await response.json();
    assert.match(first.id, /^wish-sale:manual:[a-f0-9]{64}$/);
    assert.equal(first.item.active, false);
    assert.equal(first.item.price, payload.price);
    assert.deepEqual(calls.find(call => call.sql.startsWith("INSERT INTO wishlist_business_pages")).params, ["owner", "products", "Owner", true]);
    assert(!calls.some(call => call.sql.includes("FROM wishes w")));
    const retry = await create({ ...payload, requestId, title: "Правка после обрыва" });
    assert.equal(retry.status, 200);
    assert.deepEqual(await retry.json(), { ...first, replayed: true });
    assert.equal(items.size, 1);
    assert.equal((await create({ ...payload, requestId }, "transport")).status, 201);

    user = { ...user, id: "other" };
    assert.equal((await create({ ...payload, requestId })).status, 201);
    assert.equal(items.size, 3);
    assert.equal((await create({ ...payload, requestId: "db5081ba-ef4a-409c-bece-c6fd04c3331f", imageUrl: "/api/media/63dc864f-d91d-47d4-b035-0a579765f951" })).status, 404);
    assert.equal((await create({ ...payload, wishId: "missing" })).status, 404);
    assert.equal(items.size, 3);
    const source = calls.find(call => call.sql.includes("FROM wishes w"));
    assert.match(source.sql, /w\.status='fulfilled'/);
    assert.deepEqual(source.params, ["missing", "other", "products"]);

    user = { ...user, account_type: "business", business_category: "seller", seller_space: "transport" };
    assert.equal((await create({ ...payload, requestId })).status, 403);
    assert.equal(items.size, 3);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("classifieds read only the authenticated owner's active listings in permitted spaces", async () => {
  const calls = [];
  let user = { id: "seller", accountType: "business", businessCategory: "seller", sellerSpace: "transport" };
  const app = express();
  registerWishlistBusinessRoutes(app, {
    requireAuth: (req, _res, next) => { req.user = user; next(); },
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ id: "listing", space: "transport", active: true, page_published: false }] };
    },
    transaction: () => { throw new Error("Read must not open a write transaction"); },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/wishlist-business/classifieds?owner=other&space=products`;
  try {
    const response = await fetch(endpoint);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const { items } = await response.json();
    assert.deepEqual(items.map(({ id, published }) => ({ id, published })), [{ id: "listing", published: false }]);
    assert.deepEqual(calls[0].params, ["seller", ["transport"]]);
    assert.match(calls[0].sql, /WHERE i\.business_user_id=\$1 AND i\.space=ANY\(\$2::text\[\]\) AND i\.active/);
    assert.match(calls[0].sql, /u\.account_type='personal' AND starts_with\(i\.id, 'wish-sale:'\)/);
    assert.doesNotMatch(calls[0].sql, /LIMIT|AND p\.published/);

    user = { ...user, sellerSpace: null };
    assert.equal((await fetch(endpoint)).status, 200);
    assert.deepEqual(calls[1].params, ["seller", ["products", "places", "events", "media", "food", "transport"]]);

    user = { id: "personal", accountType: "personal" };
    assert.equal((await fetch(endpoint)).status, 200);
    assert.deepEqual(calls[2].params, ["personal", ["products", "places", "events", "media", "food", "transport"]]);

    user = { id: "doctor", accountType: "business", businessCategory: "doctor" };
    assert.equal((await fetch(endpoint)).status, 403);
    assert.equal(calls.length, 3);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
