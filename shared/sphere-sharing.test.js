import assert from "node:assert/strict";
import { test } from "node:test";
import { SPHERE_SECTIONS, SPHERE_SECTION_LABELS, isSphereSection, sphereSectionPath } from "./sphere-sharing.js";

test("validates share scopes at section granularity", () => {
  assert.equal(isSphereSection("education", "courses"), true);
  assert.equal(isSphereSection("education", "medications"), false);
  assert.equal(isSphereSection("wishlist", "wishlist"), true);
  assert.equal(isSphereSection("unknown", "courses"), false);
});

test("keeps Character immediately after Values in Identity", () => {
  const valuesIndex = SPHERE_SECTIONS.identity.indexOf("values");
  assert.equal(SPHERE_SECTIONS.identity[valuesIndex + 1], "character");
  assert.equal(SPHERE_SECTION_LABELS.character, "Характер");
  assert.equal(isSphereSection("identity", "character"), true);
});

test("builds an authenticated shared-section path", () => {
  assert.equal(
    sphereSectionPath({ ownerUsername: "mikhail", sphere: "education", section: "courses" }),
    "/app/spheres/education?tab=courses&owner=mikhail",
  );
  assert.equal(
    sphereSectionPath({ ownerUsername: "mikhail", sphere: "contacts", section: "contacts" }),
    "/app/spheres/contacts?owner=mikhail",
  );
  assert.equal(
    sphereSectionPath({ ownerUsername: "mikhail", sphere: "wishlist", section: "wishlist" }),
    "/u/mikhail",
  );
});
