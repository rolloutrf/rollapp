import assert from "node:assert/strict";
import test from "node:test";
import {
  educationApiListId,
  educationItemsInList,
  educationListSelection,
  mergeEducationListOrder,
  UNLISTED_EDUCATION_LIST_ID,
} from "./education-lists.js";

const lists = [{ id: "first" }, { id: "second" }];
const items = [
  { id: "a", listId: null },
  { id: "b", listId: "first" },
  { id: "c", listId: "first" },
  { id: "d", listId: "second" },
];

test("education list selection follows visible Wishlist-style tiles", () => {
  assert.equal(educationListSelection(UNLISTED_EDUCATION_LIST_ID, lists, items), UNLISTED_EDUCATION_LIST_ID);
  assert.equal(educationListSelection("missing", lists, items), UNLISTED_EDUCATION_LIST_ID);
  assert.equal(educationListSelection(UNLISTED_EDUCATION_LIST_ID, lists, items.slice(1)), "first");
  assert.equal(educationListSelection(UNLISTED_EDUCATION_LIST_ID, [], []), UNLISTED_EDUCATION_LIST_ID);
});

test("education items are filtered and reordered only inside the selected list", () => {
  assert.deepEqual(educationItemsInList(items, "first").map((item) => item.id), ["b", "c"]);
  assert.deepEqual(educationItemsInList(items, UNLISTED_EDUCATION_LIST_ID).map((item) => item.id), ["a"]);
  assert.deepEqual(
    mergeEducationListOrder(items, [items[2], items[1]], "first").map((item) => item.id),
    ["a", "c", "b", "d"],
  );
  assert.equal(educationApiListId(UNLISTED_EDUCATION_LIST_ID), "");
  assert.equal(educationApiListId("first"), "first");
});
