import assert from "node:assert/strict";
import test from "node:test";
import { BUSINESS_CATEGORIES, businessCategoryFor, businessCategoryForSection, canBusinessAccessSection } from "./business-accounts.js";
import { SPHERE_SECTIONS } from "./sphere-sharing.js";

test("the five business categories grant eligibility only for their specified sphere", () => {
  assert.deepEqual(BUSINESS_CATEGORIES.map(({ id, sphere }) => [id, sphere]), [
    ["psychologist-coach", "identity"], ["doctor", "health"], ["seller", "wishlist"],
    ["teacher", "education"], ["career-consultant", "career"],
  ]);
  for (const category of BUSINESS_CATEGORIES) {
    for (const [sphere, sections] of Object.entries(SPHERE_SECTIONS)) {
      for (const section of sections) {
        const permitted = (sphere === "contacts" ? "career" : sphere) === category.sphere;
        assert.equal(canBusinessAccessSection({ accountType: "business", businessCategory: category.id }, sphere, section), permitted, `${category.id}: ${sphere}/${section}`);
        assert.equal(canBusinessAccessSection({ account_type: "business", business_category: category.id }, sphere, section), permitted);
      }
    }
    assert.equal(businessCategoryFor({ businessCategory: category.id }), category);
    assert.equal(businessCategoryForSection(category.sphere, SPHERE_SECTIONS[category.sphere][0]), category);
  }
});

test("personal, unknown categories and invalid sections cannot obtain business access", () => {
  for (const account of [null, {}, { accountType: "personal", businessCategory: "doctor" }, { accountType: "business", businessCategory: "unknown" }, { accountType: "business", businessCategory: "" }]) {
    assert.equal(canBusinessAccessSection(account, "health", "lab-results"), false);
  }
  assert.equal(canBusinessAccessSection({ accountType: "business", businessCategory: "doctor" }, "health", "cv"), false);
  assert.equal(businessCategoryForSection("unknown", "unknown"), null);
});

test("pre-existing uncategorized business accounts retain eligibility without assigning or changing grants", () => {
  for (const [sphere, sections] of Object.entries(SPHERE_SECTIONS)) {
    assert(canBusinessAccessSection({ account_type: "business", business_category: null }, sphere, sections[0]));
  }
});
