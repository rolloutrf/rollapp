import assert from "node:assert/strict";
import { test } from "node:test";
import { filterWishesWithoutList } from "./wish-lists.js";

test("keeps only wishes that are not assigned to a category list", () => {
  const wishes = [
    { id: "unassigned", listIds: [] },
    { id: "general-only", listIds: ["general"] },
    { id: "assigned", listIds: ["general", "auto"] },
    { id: "assigned-to-another-space", listIds: ["travel"] },
  ];
  const categoryLists = [{ id: "auto" }, { id: "travel" }];

  assert.deepEqual(
    filterWishesWithoutList(wishes, categoryLists).map((wish) => wish.id),
    ["unassigned", "general-only"],
  );
});

test("ignores stale and technical list memberships", () => {
  const wishes = [
    { id: "missing-listIds" },
    { id: "unknown-list", listIds: ["deleted-list"] },
  ];

  assert.deepEqual(filterWishesWithoutList(wishes, [{ id: "known-list" }]), wishes);
});
