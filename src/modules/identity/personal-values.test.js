import assert from "node:assert/strict";
import test from "node:test";
import { PERSONAL_VALUE_GROUPS, PERSONAL_VALUES } from "./personal-values.js";

test("personal values card sort contains 83 unique values", () => {
  assert.equal(PERSONAL_VALUES.length, 83);
  assert.equal(new Set(PERSONAL_VALUES.map((value) => value.id)).size, 83);
  assert.ok(PERSONAL_VALUE_GROUPS.every((group) => group.values.length > 0));
  assert.ok(PERSONAL_VALUES.every((value) => value.label && value.description));
});
