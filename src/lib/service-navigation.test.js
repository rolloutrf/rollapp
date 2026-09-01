import assert from "node:assert/strict";
import { test } from "node:test";
import { canAccessPrivateSpheres, serviceSwitcherItemsForUser } from "./service-navigation.js";

const services = [
  { id: "wishlist" },
  { id: "identity" },
  { id: "career" },
];

test("only the private-sphere owner has access to private spheres", () => {
  assert.equal(canAccessPrivateSpheres({ canDiscoverSpheres: true }), true);
  assert.equal(canAccessPrivateSpheres({ canDiscoverSpheres: false }), false);
  assert.equal(canAccessPrivateSpheres(null), false);
});

test("the private-sphere owner can discover every service", () => {
  assert.deepEqual(
    serviceSwitcherItemsForUser(services, { canDiscoverSpheres: true }),
    services,
  );
});

test("other users and guests can discover only the wishlist", () => {
  assert.deepEqual(
    serviceSwitcherItemsForUser(services, { canDiscoverSpheres: false }),
    [{ id: "wishlist" }],
  );
  assert.deepEqual(serviceSwitcherItemsForUser(services, null), [{ id: "wishlist" }]);
});
