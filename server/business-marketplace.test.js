import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { businessMarketplacePurchaseSchema, listBusinessMarketplaceItems } from "./business-marketplace.js";

test("business marketplace rejects client-controlled purchase data", () => {
  const input = { itemId: "offer-1", idempotencyKey: randomUUID() };
  assert.equal(businessMarketplacePurchaseSchema.safeParse(input).success, true);
  assert.equal(businessMarketplacePurchaseSchema.safeParse({ ...input, priceRolls: 1 }).success, false);
  assert.equal(businessMarketplacePurchaseSchema.safeParse({ ...input, businessId: "other" }).success, false);
  assert.equal(businessMarketplacePurchaseSchema.safeParse({ ...input, idempotencyKey: "reused" }).success, false);
});

test("business marketplace maps production rows without inventing content", async () => {
  const query = async (_sql, params) => {
    assert.deepEqual(params, ["education", "catalog"]);
    return { rows: [{
      id: "offer-1", sphere: "education", kind: "catalog", item_type: "service",
      title: "Карьерная консультация", description: "", category: "", image_url: "", action_url: "",
      price_rolls: null, business_user_id: "business-1", business_name: "Студия",
      business_username: "studio", business_avatar_url: "",
    }] };
  };
  const items = await listBusinessMarketplaceItems(query, { sphere: "education", kind: "catalog" });
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].business, { id: "business-1", name: "Студия", username: "studio", avatarUrl: "" });
  assert.equal(items[0].priceRolls, null);
});
