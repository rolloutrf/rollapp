import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isGeneralList, listDisplayTitle, shouldShowListNavigation, shouldShowUnsortedList, UNSORTED_LIST_TITLE,
} from "./list-navigation.js";

const supportedSpaces = ["products", "places", "events", "media", "food", "transport", "pets"];

test("owners can create the first list in every empty space", () => {
  for (const space of supportedSpaces) {
    assert.equal(
      shouldShowListNavigation({ space, canCreateList: true, listCount: 0 }),
      true,
      `list creation is hidden in ${space}`,
    );
  }
});

test("empty list navigation stays hidden for visitors", () => {
  assert.equal(shouldShowListNavigation({ canCreateList: false, listCount: 0 }), false);
});

test("existing and shared collections keep their navigation", () => {
  assert.equal(shouldShowListNavigation({ listCount: 1 }), true);
  assert.equal(shouldShowListNavigation({ shared: true, listCount: 0 }), true);
});

test("the unsorted list is hidden when it has no wishes", () => {
  assert.equal(shouldShowUnsortedList(0), false);
  assert.equal(shouldShowUnsortedList(1), true);
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
