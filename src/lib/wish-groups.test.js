import assert from "node:assert/strict";
import { test } from "node:test";
import { disbandWishGroupFromDashboard, filterWishGroups } from "./wish-groups.js";

test("general-list groups are visible only in their own space", () => {
  const groups = [
    { id: "products-group", listId: "general", space: "products", wishIds: ["shared", "product-1"] },
    { id: "events-group", listId: "general", space: "events", wishIds: ["shared", "event-1"] },
  ];

  assert.deepEqual(filterWishGroups({
    groups,
    listId: "general",
    selectedSpace: "products",
    scopeBySpace: true,
    visibleWishIds: new Set(["shared", "product-1"]),
  }).map((group) => group.id), ["products-group"]);

  assert.deepEqual(filterWishGroups({
    groups,
    listId: "general",
    selectedSpace: "events",
    scopeBySpace: true,
    visibleWishIds: new Set(["shared", "event-1"]),
  }).map((group) => group.id), ["events-group"]);
});

test("empty group tiles are not rendered for the current collection", () => {
  const groups = [{ id: "products-group", listId: "general", space: "products", wishIds: ["product-1"] }];
  assert.deepEqual(filterWishGroups({
    groups,
    listId: "general",
    selectedSpace: "products",
    scopeBySpace: true,
    visibleWishIds: new Set(["unrelated-product"]),
  }), []);
});

test("a selected category list is scoped by list id while legacy groups fall back to visible members", () => {
  const categoryGroup = { id: "category-group", listId: "events-list", space: "products", wishIds: ["event-1"] };
  assert.deepEqual(filterWishGroups({
    groups: [categoryGroup],
    listId: "events-list",
    selectedSpace: "events",
    scopeBySpace: false,
    visibleWishIds: ["event-1"],
  }), [categoryGroup]);

  const legacyGroup = { id: "legacy", listId: "general", wishIds: ["product-1"] };
  assert.deepEqual(filterWishGroups({
    groups: [legacyGroup],
    listId: "general",
    selectedSpace: "events",
    scopeBySpace: true,
    visibleWishIds: ["event-1"],
  }), []);
});

test("disbanding a group reveals its wishes without removing them from the dashboard", () => {
  const wishes = [{ id: "first" }, { id: "second" }, { id: "third" }];
  const dashboard = {
    wishes,
    groups: [
      { id: "target", wishIds: ["first", "second"] },
      { id: "other", wishIds: ["third"] },
    ],
  };

  const nextDashboard = disbandWishGroupFromDashboard(dashboard, "target");

  assert.deepEqual(nextDashboard.groups, [{ id: "other", wishIds: ["third"] }]);
  assert.equal(nextDashboard.wishes, wishes);
  assert.equal(disbandWishGroupFromDashboard(nextDashboard, "missing"), nextDashboard);
});
