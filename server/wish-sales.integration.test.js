import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { registerWishlistBusinessRoutes } from "./modules/wishlist/wishlist-business.js";

test("fulfilled wish sales on production PostgreSQL (all writes roll back)", {
  skip: process.env.ROLLAPP_TEST_WISH_SALES !== "1",
}, async () => {
  const { productionRollsDatabase } = await import("../scripts/rolls-database.mjs");
  const db = await productionRollsDatabase();
  const client = await db.pool.connect();
  let server;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='10s'");
    const [ownerId, buyerId, fulfilledId, activeId, imageId, legacyId, listId] = Array.from({ length: 7 }, () => randomUUID());
    const accounts = new Map();
    for (const id of [ownerId, buyerId]) {
      const { rows } = await client.query(
        "INSERT INTO users(id,email,username,name,password_hash) VALUES($1,$2,$3,$4,'unusable') RETURNING id,name,account_type",
        [id, `${id}@wish-sale-test.invalid`, `sale-${id}`, "Sale test account"],
      );
      accounts.set(id, rows[0]);
    }
    await client.query("INSERT INTO wish_images(id,user_id,mime_type,image_data,size_bytes) VALUES($1,$2,'image/png',$3,1)", [imageId, ownerId, Buffer.from([0])]);
    await client.query(
      `INSERT INTO wishes(id,user_id,title,description,image_url,status,space,privacy)
       VALUES($1,$4,'Кофемолка','Описание',$5,'fulfilled','products','private'),
             ($2,$4,'Кофеварка','','','active','products','inherit'),
             ($3,$4,'Машина','','','fulfilled',NULL,'inherit')`,
      [fulfilledId, activeId, legacyId, ownerId, `/api/media/${imageId}`],
    );
    await client.query("INSERT INTO wishlists(id,user_id,title,share_token,space) VALUES($1,$2,'Авто',$3,'transport')", [listId, ownerId, randomUUID()]);
    await client.query("INSERT INTO wishlist_wishes(wishlist_id,wish_id) VALUES($1,$2)", [listId, legacyId]);

    const app = express();
    app.use(express.json());
    registerWishlistBusinessRoutes(app, {
      requireAuth(req, res, next) {
        req.user = accounts.get(req.get("test-actor"));
        if (!req.user) return res.sendStatus(401);
        next();
      },
      query: client.query.bind(client),
      async transaction(run) {
        await client.query("SAVEPOINT sale_request");
        try {
          const result = await run(client);
          await client.query("RELEASE SAVEPOINT sale_request");
          return result;
        } catch (error) {
          await client.query("ROLLBACK TO SAVEPOINT sale_request");
          await client.query("RELEASE SAVEPOINT sale_request");
          throw error;
        }
      },
    });
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const request = async (path, { actor = ownerId, method = "GET", payload } = {}) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/wishlist-business/${path}`, {
        method, headers: { "test-actor": actor, "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      return { status: response.status, data: response.headers.get("content-type")?.includes("application/json") ? await response.json() : null };
    };
    const sale = { title: "Кофемолка", description: "Описание продажи", imageUrl: `/api/media/${imageId}`, price: "3 500 ₽", active: false };
    const endpoint = "products/sales";
    const draft = await request(`${endpoint}?wish=${fulfilledId}`);
    assert.equal(draft.status, 200);
    assert.deepEqual(draft.data.editor, { space: "products", title: sale.title, description: "Описание", imageUrl: sale.imageUrl, active: false });
    assert.equal((await request(`${endpoint}?wish=${fulfilledId}`, { actor: buyerId })).status, 404);
    assert.equal((await request(`transport/sales?wish=${legacyId}`)).status, 200);
    assert.equal((await request(`products/sales?wish=${legacyId}`)).status, 404);
    for (const [wishId, actor] of [[activeId, ownerId], [fulfilledId, buyerId]]) {
      assert.equal((await request(endpoint, { method: "POST", actor, payload: { ...sale, wishId } })).status, 404);
    }
    const create = { method: "POST", payload: { ...sale, wishId: fulfilledId } };
    const saved = await request(endpoint, create);
    assert.equal(saved.status, 201);
    assert.equal((await request(endpoint, create)).data.replayed, true);
    assert.equal((await request(endpoint)).data.items.length, 1);
    const itemId = saved.data.item.id;
    const storeShowsSale = async () => {
      const store = await request("products/store", { actor: buyerId });
      assert.equal(store.status, 200);
      return store.data.items.some(item => item.id === itemId && item.personalSale);
    };
    assert.equal(await storeShowsSale(), false);
    const editPath = `${endpoint}/${encodeURIComponent(itemId)}`;
    const publish = { method: "PATCH", payload: { ...sale, active: true } };
    assert.equal((await request(editPath, { ...publish, actor: buyerId })).status, 404);
    assert.equal((await request(editPath, publish)).status, 200);
    assert.equal(await storeShowsSale(), true);
    assert.equal((await request(editPath, { method: "PATCH", payload: sale })).status, 200);
    assert.equal(await storeShowsSale(), false);
    const wish = await client.query("SELECT status,privacy,description FROM wishes WHERE id=$1", [fulfilledId]);
    assert.deepEqual(wish.rows[0], { status: "fulfilled", privacy: "private", description: "Описание" });
    await client.query("UPDATE wishes SET space='transport' WHERE id=$1", [fulfilledId]);
    assert.equal((await request(`transport/sales?wish=${fulfilledId}`)).data.editor.id, itemId);
    assert.equal((await request("transport/sales", create)).status, 409);
    assert.equal((await client.query("SELECT 1 FROM wishlist_business_pages WHERE business_user_id=$1 AND space='transport'", [ownerId])).rowCount, 0);

    const sellerId = randomUUID();
    const sellerWishId = randomUUID();
    const seller = await client.query(
      `INSERT INTO users(id,email,username,name,password_hash,account_type,business_category,seller_space)
       VALUES($1,$2,$3,'Sale test business','unusable','business','seller','products')
       RETURNING id,name,username,account_type,business_category,seller_space`,
      [sellerId, `${sellerId}@wish-sale-test.invalid`, `sale-${sellerId}`],
    );
    accounts.set(sellerId, seller.rows[0]);
    await client.query("INSERT INTO wishes(id,user_id,title,status,space) VALUES($1,$2,'Часы','fulfilled','products')", [sellerWishId, sellerId]);
    const oldItem = randomUUID();
    await client.query("INSERT INTO wishlist_business_pages(business_user_id,space,title,description) VALUES($1,'products','Часовая мастерская','Старое описание')", [sellerId]);
    await client.query("INSERT INTO wishlist_business_items(id,business_user_id,space,title,active) VALUES($1,$2,'products','Ранее скрыто',true)", [oldItem, sellerId]);
    const publicProfile = `products/profiles/${seller.rows[0].username}`;
    assert.deepEqual((await request(publicProfile)).data.items, []);
    assert.equal((await request("products/page", { actor: sellerId })).data.items[0].active, false);
    assert.equal((await request("products/page", { actor: sellerId, method: "POST", payload: { published: true } })).status, 404);

    const draftItem = await request("products/items", { actor: sellerId, method: "POST", payload: { title: "Черновик", active: false } });
    assert.equal(draftItem.status, 201);
    assert.deepEqual((await request(publicProfile)).data.items, []);
    const newItem = { actor: sellerId, method: "POST", payload: { title: "Новый товар", requestId: randomUUID() } };
    const published = await request("products/items", newItem);
    assert.equal(published.status, 201);
    assert.equal(published.data.item.active, true);
    assert.deepEqual((await request("products/items", newItem)).data, { ...published.data, replayed: true });
    const storefront = (await request(publicProfile)).data;
    assert.deepEqual(storefront.items.map(({ id }) => id), [published.data.id]);
    assert.equal(storefront.pages[0].title, "Часовая мастерская");
    assert.equal(storefront.pages[0].description, "Старое описание");
    const oldItemSave = await request(`products/items/${oldItem}`, {
      actor: sellerId, method: "PATCH", payload: { title: "Ранее скрыто", active: true },
    });
    assert.equal(oldItemSave.status, 200);
    assert.equal((await request(publicProfile)).data.items.some(({ id }) => id === oldItem), true);

    const sellerSale = { actor: sellerId, method: "POST", payload: { wishId: sellerWishId, title: "Часы", active: true } };
    assert.equal((await request("transport/sales", sellerSale)).status, 403);
    const sellerSaved = await request(endpoint, sellerSale);
    assert.equal(sellerSaved.status, 201);
    const sellerItemVisible = async () => (await request("products/store", { actor: buyerId })).data.items.some(item => item.id === sellerSaved.data.item.id);
    assert.equal(await sellerItemVisible(), true);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      await client.query("ROLLBACK");
    } finally {
      client.release();
      await db.pool.end();
    }
  }
});
