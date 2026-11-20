import assert from "node:assert/strict";
import test from "node:test";
import { WISHLIST_SPACE_IDS } from "../../../shared/modules/wishlist/wishlist-business.js";
import { placeListingsSchema, spaceSchema, waitBodySchema } from "./place-listings.js";

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
