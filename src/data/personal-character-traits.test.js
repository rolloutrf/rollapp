import assert from "node:assert/strict";
import test from "node:test";
import { PERSONAL_CHARACTER_TRAIT_GROUPS, PERSONAL_CHARACTER_TRAITS } from "./personal-character-traits.js";

test("personal character trait catalogue has unique selectable traits in every group", () => {
  assert.equal(PERSONAL_CHARACTER_TRAITS.length, 28);
  assert.equal(new Set(PERSONAL_CHARACTER_TRAITS.map((trait) => trait.id)).size, PERSONAL_CHARACTER_TRAITS.length);
  assert.ok(PERSONAL_CHARACTER_TRAIT_GROUPS.every((group) => group.traits.length > 0));
  assert.ok(PERSONAL_CHARACTER_TRAITS.every((trait) => trait.label && trait.description));
});
