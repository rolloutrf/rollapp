import test from "node:test";
import assert from "node:assert/strict";
import {
  moveWishToTargetPosition,
  moveWishWithinSubset,
  reorderScopeWishIds,
  resolveWishHoverMode,
  wishRectOverlapRatio,
} from "./wish-order.js";

test("moveWishToTargetPosition moves a wish into a later target's original slot", () => {
  const order = ["first", "second", "third", "fourth"];

  assert.deepEqual(
    moveWishToTargetPosition(order, "first", "second"),
    ["second", "first", "third", "fourth"],
  );
  assert.deepEqual(
    moveWishToTargetPosition(order, "first", "third"),
    ["second", "third", "first", "fourth"],
  );
  assert.deepEqual(order, ["first", "second", "third", "fourth"]);
});

test("moveWishToTargetPosition moves a wish into an earlier target's original slot", () => {
  assert.deepEqual(
    moveWishToTargetPosition(["first", "second", "third", "fourth"], "fourth", "second"),
    ["first", "fourth", "second", "third"],
  );
});

test("moveWishToTargetPosition keeps the order when either wish is not movable", () => {
  const order = ["first", "second"];

  assert.equal(moveWishToTargetPosition(order, "first", "first"), order);
  assert.equal(moveWishToTargetPosition(order, "missing", "second"), order);
  assert.equal(moveWishToTargetPosition(order, "first", "missing"), order);
});

test("moveWishWithinSubset reorders group wishes without moving wishes outside the group", () => {
  const order = ["group-first", "outside-first", "group-second", "outside-second", "group-third"];

  assert.deepEqual(
    moveWishWithinSubset(order, ["group-first", "group-second", "group-third"], "group-first", "group-third"),
    ["group-second", "outside-first", "group-third", "outside-second", "group-first"],
  );
  assert.deepEqual(order, ["group-first", "outside-first", "group-second", "outside-second", "group-third"]);
});

test("moveWishWithinSubset rejects targets outside the group", () => {
  const order = ["group-first", "outside", "group-second"];

  assert.equal(moveWishWithinSubset(order, ["group-first", "group-second"], "group-first", "outside"), order);
  assert.equal(moveWishWithinSubset(order, ["group-first", "group-second"], "outside", "group-second"), order);
});

test("reorderScopeWishIds includes every visible status in the current list", () => {
  assert.deepEqual(
    [...reorderScopeWishIds([
      { id: "active", status: "active" },
      { id: "fulfilled", status: "fulfilled" },
    ])],
    ["active", "fulfilled"],
  );
});

test("reorderScopeWishIds limits an open group to its visible wishes", () => {
  assert.deepEqual(
    [...reorderScopeWishIds(
      [{ id: "active" }, { id: "fulfilled" }, { id: "outside" }],
      ["active", "fulfilled", "hidden"],
    )],
    ["active", "fulfilled"],
  );
});

test("moveWishWithinSubset can swap visible active and fulfilled wishes", () => {
  assert.deepEqual(
    moveWishWithinSubset(
      ["active", "outside", "fulfilled"],
      reorderScopeWishIds([{ id: "active" }, { id: "fulfilled" }]),
      "active",
      "fulfilled",
    ),
    ["fulfilled", "outside", "active"],
  );
});

test("resolveWishHoverMode reserves the center of a wish for grouping", () => {
  const rect = { left: 100, right: 300, top: 50, bottom: 250, width: 200, height: 200 };

  assert.equal(resolveWishHoverMode({ groupingEnabled: true, rect, clientX: 200, clientY: 150 }), "group");
  assert.equal(resolveWishHoverMode({ groupingEnabled: true, rect, clientX: 140, clientY: 90 }), "group");
});

test("resolveWishHoverMode keeps the edges available for reordering", () => {
  const rect = { left: 100, right: 300, top: 50, bottom: 250, width: 200, height: 200 };

  assert.equal(resolveWishHoverMode({ groupingEnabled: true, rect, clientX: 110, clientY: 150 }), "reorder");
  assert.equal(resolveWishHoverMode({ groupingEnabled: true, rect, clientX: 200, clientY: 240 }), "reorder");
  assert.equal(resolveWishHoverMode({ groupingEnabled: false, rect, clientX: 200, clientY: 150 }), "reorder");
});

test("wishRectOverlapRatio detects a card visibly covering its neighbour", () => {
  const dragged = { left: 180, right: 380, top: 100, bottom: 300 };
  const target = { left: 300, right: 500, top: 100, bottom: 300 };

  assert.equal(wishRectOverlapRatio(dragged, target), 0.4);
  assert.equal(wishRectOverlapRatio(dragged, { left: 400, right: 600, top: 100, bottom: 300 }), 0);
  assert.equal(wishRectOverlapRatio(null, target), 0);
});
