import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isGeneralList, listDisplayTitle, resolveVisibleListSelection, shouldShowListNavigation,
  shouldShowUnsortedList, UNSORTED_LIST_TITLE,
} from "./list-navigation.js";

const supportedSpaces = ["products", "places", "events", "media", "food", "transport"];

test("empty list navigation stays hidden until there is a list or unsorted wish", () => {
  assert.equal(shouldShowListNavigation({ listCount: 0, unlistedCount: 0 }), false);
  assert.equal(shouldShowListNavigation({ listCount: 0, unlistedCount: 1 }), true);
});

test("existing and shared collections keep their navigation", () => {
  assert.equal(shouldShowListNavigation({ listCount: 1 }), true);
  assert.equal(shouldShowListNavigation({ shared: true, listCount: 0 }), true);
});

test("the unsorted list is hidden when it has no wishes", () => {
  assert.equal(shouldShowUnsortedList(0), false);
  assert.equal(shouldShowUnsortedList(1), true);
});

test("the first visible list is selected when the unsorted list is hidden", () => {
  const lists = [{ id: "lifestyle" }, { id: "health" }];
  assert.equal(resolveVisibleListSelection("all", lists, false), "lifestyle");
  assert.equal(resolveVisibleListSelection("health", lists, false), "health");
});

test("an empty collection keeps the unsorted fallback", () => {
  assert.equal(resolveVisibleListSelection("all", [], false), "all");
});

test("the technical general list is always displayed as unsorted", () => {
  const generalList = { title: "Мои желания", description: "Всё, чему я буду рад" };
  assert.equal(isGeneralList(generalList), true);
  for (const space of supportedSpaces) {
    assert.equal(
      listDisplayTitle({ ...generalList, space }),
      UNSORTED_LIST_TITLE,
      `the general list keeps its technical title in ${space}`,
    );
  }
  assert.equal(listDisplayTitle({ title: "Кофейни", description: "" }), "Кофейни");
});
