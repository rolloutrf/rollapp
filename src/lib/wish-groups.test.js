import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildWishGroupGridItems,
  disbandWishGroupFromDashboard,
  filterWishGroups,
  moveWishGroupInDashboard,
  moveWishGroupToTarget,
} from "./wish-groups.js";

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

test("wish group grid items keep groups in the first member's visible position", () => {
  const wishes = [
    { id: "first" },
    { id: "group-second" },
    { id: "single" },
    { id: "group-first" },
  ];
  const groups = [{ id: "group", wishIds: ["group-first", "group-second"] }];

  assert.deepEqual(
    buildWishGroupGridItems({ wishes, groups }).map((item) => [item.type, item.id, item.wishes?.map((wish) => wish.id)]),
    [
      ["wish", "first", undefined],
      ["group", "group", ["group-second", "group-first"]],
      ["wish", "single", undefined],
    ],
  );
});

test("moveWishGroupToTarget moves all group members as one block", () => {
  const order = ["group-first", "outside-first", "group-second", "outside-second", "target"];

  assert.deepEqual(
    moveWishGroupToTarget(order, ["group-first", "group-second"], ["target"]),
    ["outside-first", "outside-second", "target", "group-first", "group-second"],
  );
  assert.deepEqual(order, ["group-first", "outside-first", "group-second", "outside-second", "target"]);
});

test("moveWishGroupToTarget can move a later group into an earlier card slot", () => {
  assert.deepEqual(
    moveWishGroupToTarget(
      ["target", "outside", "group-first", "group-second"],
      ["group-first", "group-second"],
      ["target"],
    ),
    ["group-first", "group-second", "target", "outside"],
  );
});

test("moveWishGroupToTarget does not split the target group", () => {
  assert.deepEqual(
    moveWishGroupToTarget(
      ["moving", "outside", "target-first", "target-second"],
      ["moving"],
      ["target-first", "target-second"],
    ),
    ["outside", "target-first", "target-second", "moving"],
  );
});

test("moveWishGroupToTarget keeps order for missing or overlapping targets", () => {
  const order = ["first", "second", "third"];

  assert.equal(moveWishGroupToTarget(order, ["first"], ["first"]), order);
  assert.equal(moveWishGroupToTarget(order, ["missing"], ["second"]), order);
  assert.equal(moveWishGroupToTarget(order, ["first"], ["missing"]), order);
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

test("moving a group updates its list, wish memberships, and list counters", () => {
  const dashboard = {
    lists: [
      { id: "source", wishCount: 3 },
      { id: "target", wishCount: 1 },
    ],
    wishes: [
      { id: "first", status: "active", listIds: ["source"] },
      { id: "second", status: "active", listIds: ["source", "target"] },
      { id: "outside", status: "active", listIds: ["source"] },
    ],
    groups: [
      { id: "moving", listId: "source", space: "products", title: "Группа", wishIds: ["first", "second"] },
      { id: "other", listId: "source", space: "products", wishIds: ["outside"] },
    ],
  };
  const movedGroup = { ...dashboard.groups[0], listId: "target" };

  const nextDashboard = moveWishGroupInDashboard(dashboard, {
    group: movedGroup,
    sourceListId: "source",
    targetListId: "target",
    removedFromSourceWishIds: ["first", "second"],
  });

  assert.deepEqual(nextDashboard.groups, [movedGroup, dashboard.groups[1]]);
  assert.deepEqual(nextDashboard.wishes[0].listIds, ["target"]);
  assert.deepEqual(nextDashboard.wishes[1].listIds, ["target"]);
  assert.equal(nextDashboard.wishes[2], dashboard.wishes[2]);
  assert.deepEqual(nextDashboard.lists, [
    { id: "source", wishCount: 1 },
    { id: "target", wishCount: 2 },
  ]);
});
