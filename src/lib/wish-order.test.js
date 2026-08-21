import test from "node:test";
import assert from "node:assert/strict";
import { moveWishToTargetPosition, moveWishWithinSubset } from "./wish-order.js";

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

test("moveWishWithinSubset keeps fulfilled wishes in the server-defined status section", () => {
  const order = ["active-first", "active-second", "fulfilled-first", "fulfilled-second"];

  assert.deepEqual(
    moveWishWithinSubset(order, ["active-first", "active-second"], "active-first", "active-second"),
    ["active-second", "active-first", "fulfilled-first", "fulfilled-second"],
  );
  assert.equal(
    moveWishWithinSubset(order, ["active-first", "active-second"], "active-first", "fulfilled-first"),
    order,
  );
});
