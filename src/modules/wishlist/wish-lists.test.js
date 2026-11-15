import assert from "node:assert/strict";
import { test } from "node:test";
import { filterWishesWithoutList, initialWishListIds } from "./wish-lists.js";

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

test("preselects the open list for a new wish", () => {
  assert.deepEqual(initialWishListIds(null, "care"), ["care"]);
  assert.deepEqual(initialWishListIds({ listIds: ["care"] }, "care"), ["care"]);
});

test("preserves existing memberships when editing a wish", () => {
  const wish = { listIds: ["care", "health"] };

  assert.deepEqual(initialWishListIds(wish), ["care", "health"]);
  assert.notStrictEqual(initialWishListIds(wish), wish.listIds);
});
