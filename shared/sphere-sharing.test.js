import assert from "node:assert/strict";
import { test } from "node:test";
import { isSphereSection, sphereSectionPath } from "./sphere-sharing.js";

test("validates share scopes at section granularity", () => {
  assert.equal(isSphereSection("education", "courses"), true);
  assert.equal(isSphereSection("education", "medications"), false);
  assert.equal(isSphereSection("wishlist", "wishlist"), true);
  assert.equal(isSphereSection("unknown", "courses"), false);
});

test("builds an authenticated shared-section path", () => {
  assert.equal(
    sphereSectionPath({ ownerUsername: "synthetic-user", sphere: "education", section: "courses" }),
    "/app/spheres/education?tab=courses&owner=synthetic-user",
  );
  assert.equal(
    sphereSectionPath({ ownerUsername: "synthetic-user", sphere: "contacts", section: "contacts" }),
    "/app/spheres/contacts?owner=synthetic-user",
  );
  assert.equal(
    sphereSectionPath({ ownerUsername: "synthetic-user", sphere: "wishlist", section: "wishlist" }),
    "/u/synthetic-user",
  );
});
