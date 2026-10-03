import assert from "node:assert/strict";
import { test } from "node:test";
import { SPHERE_SECTIONS, SPHERE_SECTION_LABELS, canonicalSphereSection, isSphereSection, sphereSectionPath, sphereSectionStorageScope } from "./sphere-sharing.js";

test("validates share scopes at section granularity", () => {
  assert.equal(isSphereSection("education", "courses"), true);
  assert.equal(isSphereSection("education", "medications"), false);
  assert.equal(isSphereSection("wishlist", "wishlist"), true);
  assert.equal(isSphereSection("unknown", "courses"), false);
});

test("principles have their own Identity access scope and shared link", () => {
  assert.equal(isSphereSection("identity", "principles"), true);
  assert.equal(isSphereSection("career", "principles"), false);
  assert.equal(SPHERE_SECTION_LABELS.principles, "Принципы");
  assert.deepEqual(sphereSectionStorageScope("identity", "principles"), { sphere: "identity", section: "principles" });
  assert.equal(
    sphereSectionPath({ ownerUsername: "mikhail", sphere: "identity", section: "principles" }),
    "/app/spheres/identity?tab=principles&owner=mikhail",
  );
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
    "/app/spheres/career?tab=contacts&owner=mikhail",
  );
  assert.equal(
    sphereSectionPath({ ownerUsername: "mikhail", sphere: "wishlist", section: "wishlist" }),
    "/u/mikhail",
  );
});

test("contacts use the career route while retaining their existing access scope", () => {
  assert.equal(isSphereSection("career", "contacts"), true);
  assert.equal(isSphereSection("contacts", "contacts"), true);
  assert.equal(isSphereSection("contacts", "about"), false);
  assert.equal(isSphereSection("health", "contacts"), false);
  assert.deepEqual(canonicalSphereSection("contacts", "contacts"), { sphere: "career", section: "contacts" });
  assert.equal(sphereSectionPath({ sphere: "career", section: "contacts" }), "/app/spheres/career?tab=contacts");
  assert.deepEqual(sphereSectionStorageScope("career", "contacts"), sphereSectionStorageScope("contacts", "contacts"));
  assert.deepEqual(sphereSectionStorageScope("career", "about"), { sphere: "career", section: "about" });
  assert.deepEqual(sphereSectionStorageScope("health", "contacts"), { sphere: "health", section: "contacts" });
});
