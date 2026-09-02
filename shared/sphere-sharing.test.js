import assert from "node:assert/strict";
import { test } from "node:test";
import { isSphereSection, sphereSectionPath } from "./sphere-sharing.js";

test("validates share scopes at section granularity", () => {
  assert.equal(isSphereSection("education", "courses"), true);
  assert.equal(isSphereSection("education", "medications"), false);
  assert.equal(isSphereSection("unknown", "courses"), false);
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
});
