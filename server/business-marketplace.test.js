import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { businessMarketplacePurchaseSchema, listBusinessMarketplaceItems, purchaseBusinessMarketplaceItem, registerBusinessMarketplaceRoutes } from "./business-marketplace.js";

test("business marketplace rejects client-controlled purchase data", () => {
  const input = { itemId: "offer-1", idempotencyKey: randomUUID() };
  assert.equal(businessMarketplacePurchaseSchema.safeParse(input).success, true);
  assert.equal(businessMarketplacePurchaseSchema.safeParse({ ...input, priceRolls: 1 }).success, false);
  assert.equal(businessMarketplacePurchaseSchema.safeParse({ ...input, businessId: "other" }).success, false);
  assert.equal(businessMarketplacePurchaseSchema.safeParse({ ...input, idempotencyKey: "reused" }).success, false);
});

test("business marketplace maps production rows without inventing content", async () => {
  const query = async (_sql, params) => {
    assert.deepEqual(params, ["education", "store"]);
    return { rows: [{
      id: "offer-1", sphere: "education", kind: "store", item_type: "service",
      title: "Карьерная консультация", description: "", category: "", image_url: "", action_url: "",
      price_rolls: 250, business_user_id: "business-1", business_name: "Студия",
      business_username: "studio", business_avatar_url: "",
    }] };
  };
  const items = await listBusinessMarketplaceItems(query, { sphere: "education", kind: "store" });
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].business, { id: "business-1", name: "Студия", username: "studio", avatarUrl: "" });
  assert.equal(items[0].priceRolls, 250);
});

test("sphere catalogs are unavailable without querying legacy records", async () => {
  let queries = 0;
  for (const sphere of ["identity", "career", "education", "health", "contacts", "planning"]) {
    await assert.rejects(() => listBusinessMarketplaceItems(async () => { queries += 1; return { rows: [] }; }, { sphere, kind: "catalog" }), error => error.status === 404);
  }
  assert.equal(queries, 0);
});

test("identity marketplace cannot list or purchase legacy offers", async () => {
  const query = async () => { throw new Error("Removed identity marketplace must not query or mutate records"); };
  await assert.rejects(() => listBusinessMarketplaceItems(query, { sphere: "identity", kind: "store" }), error => error.status === 404);
  await assert.rejects(() => purchaseBusinessMarketplaceItem({ query }, "owner", "identity", { itemId: "legacy-offer", idempotencyKey: randomUUID() }), error => error.status === 404);
});

test("retired marketplace HTTP routes return 404 before querying or starting a transaction", async () => {
  const routes = [];
  const rejectDatabase = async () => { throw new Error("Retired route reached the database"); };
  registerBusinessMarketplaceRoutes({
    get: (_path, ...handlers) => routes.push(handlers),
    post: (_path, ...handlers) => routes.push(handlers),
  }, { requireAuth: (_req, _res, next) => next(), query: rejectDatabase, transaction: rejectDatabase });
  for (const sphere of ["identity", "unknown"]) for (const handlers of routes) {
    const req = { params: { sphere }, user: { id: "owner" }, body: { itemId: "legacy-offer", idempotencyKey: randomUUID() } };
    const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    let cursor = 0;
    const next = error => { if (error) throw error; return handlers[cursor++](req, res, next); };
    await next();
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.code, "MARKETPLACE_NOT_FOUND");
  }
});
