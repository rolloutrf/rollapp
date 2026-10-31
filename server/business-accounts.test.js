import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { BUSINESS_CATEGORIES } from "../shared/business-accounts.js";
import { createRegistrationSchema } from "./business-accounts.js";

const schema = createRegistrationSchema(z.object({ email: z.email(), password: z.string().min(8) }));
const credentials = { name: "Новый пользователь", email: "business@example.com", password: "test-password" };

test("new business registration requires exactly one recognized category", () => {
  for (const category of BUSINESS_CATEGORIES) {
    const value = { ...credentials, accountType: "business", businessCategory: category.id, ...(category.id === "seller" ? { sellerSpace: "products" } : {}) };
    assert.deepEqual(schema.parse(value), value);
  }
  for (const category of [undefined, null, "", "admin", ["doctor", "seller"]]) {
    const result = schema.safeParse({ ...credentials, accountType: "business", businessCategory: category });
    assert.equal(result.success, false);
    assert(result.error.issues.some(({ path }) => path[0] === "businessCategory"));
  }
});

test("personal registration stays category-free and rejects submitted business categories", () => {
  assert.equal(schema.parse(credentials).accountType, "personal");
  assert(schema.safeParse({ ...credentials, accountType: "personal", businessCategory: null }).success);
  assert.equal(schema.safeParse({ ...credentials, accountType: "personal", businessCategory: "doctor" }).success, false);
  assert.equal(schema.safeParse({ ...credentials, accountType: "admin", businessCategory: "doctor" }).success, false);
});


test("seller registration requires a Wishlist space and other accounts cannot carry it", () => {
  assert.equal(schema.safeParse({ ...credentials, accountType: "business", businessCategory: "seller" }).success, false);
  for (const sellerSpace of ["products", "places", "events", "media", "food", "transport"]) {
    assert.equal(schema.parse({ ...credentials, accountType: "business", businessCategory: "seller", sellerSpace }).sellerSpace, sellerSpace);
  }
  for (const value of [{ accountType: "personal" }, { accountType: "business", businessCategory: "doctor" }]) {
    assert.equal(schema.safeParse({ ...credentials, ...value, sellerSpace: "products" }).success, false);
  }
});
