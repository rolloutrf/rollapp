import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { WISHLIST_SPACE_IDS } from "../../../shared/modules/wishlist/wishlist-business.js";
import { placeListingsSchema, registerPlaceListingRoutes, spaceSchema, waitBodySchema } from "./place-listings.js";

test("wait body requires a strict boolean", () => {
  assert.deepEqual(waitBodySchema.parse({ waiting: true }), { waiting: true });
  assert.deepEqual(waitBodySchema.parse({ waiting: false }), { waiting: false });
  for (const value of [undefined, null, "", "true", 1, { waiting: "yes" }, ["waiting"]]) {
    assert.equal(waitBodySchema.safeParse(value).success, false);
  }
  assert.equal(waitBodySchema.safeParse({ waiting: true, extra: 1 }).success, false);
});

test("space schema accepts only Wishlist spaces", () => {
  for (const space of WISHLIST_SPACE_IDS) assert.equal(spaceSchema.parse(space), space);
  for (const space of [undefined, "", "place", "places ", ["places"], null]) {
    assert.equal(spaceSchema.safeParse(space).success, false);
  }
});

test("place listings schema constrains space and keys the waitlist per place and user", () => {
  assert.match(placeListingsSchema, /CREATE TABLE IF NOT EXISTS place_listings/);
  assert.match(placeListingsSchema, /CREATE TABLE IF NOT EXISTS place_waitlist/);
  assert.match(placeListingsSchema, /UNIQUE\(space, slug\)/);
  assert.match(placeListingsSchema, /PRIMARY KEY\(place_id, user_id\)/);
  assert.match(placeListingsSchema, /REFERENCES place_listings\(id\) ON DELETE CASCADE/);
  assert.match(placeListingsSchema, /REFERENCES users\(id\) ON DELETE CASCADE/);
  for (const space of WISHLIST_SPACE_IDS) {
    assert.ok(placeListingsSchema.includes(`'${space}'`), `schema CHECK misses space ${space}`);
  }
});

test("places list types the optional user parameter inside the CASE/EXISTS guard", () => {
  // PostgreSQL cannot infer $2's type when it only occurs inside EXISTS within a
  // CASE expression (42P08 could not determine data type of parameter $2), so the
  // query must carry an explicit ::text cast on every $2 occurrence.
  const queries = [];
  const query = async (text, params) => { queries.push({ text, params }); return { rows: [] }; };
  const app = express();
  registerPlaceListingRoutes(app, {
    requireAuth: (req, _res, next) => { req.user = { id: "u1", account_type: "personal" }; next(); },
    query,
    transaction: async () => ({}),
  });
  const listener = app.listen(0, async () => {
    try {
      const address = `http://127.0.0.1:${listener.address().port}`;
      const response = await fetch(`${address}/api/wishlist-business/places/places`);
      assert.equal(response.status, 200);
      const list = queries.find(({ text }) => text.includes("FROM place_listings"));
      assert.ok(list, "places list query was not issued");
      assert.ok(!/\$2(?!::)/.test(list.text), "places list query leaves $2 without an explicit ::text cast");
      assert.deepEqual(list.params, ["places", "u1"]);
    } finally { listener.close(); }
  });
});
