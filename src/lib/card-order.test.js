import test from "node:test";
import assert from "node:assert/strict";
import {
  cardRectOverlapRatio,
  GROUP_INTENT_DELAY_MS,
  reorderCards,
  reorderCardToTarget,
  resolveCardHoverMode,
  savedOrder,
} from "./card-order.js";

test("education cards and Wishlist share the same deliberate grouping delay", () => {
  assert.equal(GROUP_INTENT_DELAY_MS, 250);
});

test("savedOrder normalizes missing and invalid positions", () => {
  assert.equal(savedOrder({ sortOrder: 3 }), 3);
  assert.equal(savedOrder({ sortOrder: "2" }), 2);
  assert.equal(savedOrder({}), 0);
  assert.equal(savedOrder({ sortOrder: "invalid" }), 0);
});

test("reorderCards moves a card and normalizes every position", () => {
  const cards = [
    { id: "first", sortOrder: 8 },
    { id: "second", sortOrder: 12 },
    { id: "third", sortOrder: 20 },
  ];

  assert.deepEqual(
    reorderCards(cards, "first", 2).map(({ id, sortOrder }) => ({ id, sortOrder })),
    [
      { id: "second", sortOrder: 0 },
      { id: "third", sortOrder: 1 },
      { id: "first", sortOrder: 2 },
    ],
  );
  assert.deepEqual(cards.map(({ id, sortOrder }) => ({ id, sortOrder })), [
    { id: "first", sortOrder: 8 },
    { id: "second", sortOrder: 12 },
    { id: "third", sortOrder: 20 },
  ]);
});

test("reorderCardToTarget uses the target card's current slot", () => {
  assert.deepEqual(
    reorderCardToTarget([{ id: "first" }, { id: "second" }, { id: "third" }], "third", "first")
      .map((card) => card.id),
    ["third", "first", "second"],
  );
});

test("reorderCards leaves invalid and no-op moves unchanged", () => {
  const cards = [{ id: "only", sortOrder: 0 }];
  assert.equal(reorderCards(cards, "only", 0), cards);
  assert.equal(reorderCards(cards, "missing", 0), cards);
  assert.equal(reorderCards(cards, "only", -1), cards);
});

test("resolveCardHoverMode reserves the center for grouping and the edges for sorting", () => {
  const rect = { left: 100, right: 300, top: 50, bottom: 250, width: 200, height: 200 };
  assert.equal(resolveCardHoverMode({ groupingEnabled: true, rect, clientX: 200, clientY: 150 }), "group");
  assert.equal(resolveCardHoverMode({ groupingEnabled: true, rect, clientX: 110, clientY: 150 }), "reorder");
  assert.equal(resolveCardHoverMode({ groupingEnabled: false, rect, clientX: 200, clientY: 150 }), "reorder");
});

test("cardRectOverlapRatio detects one education card covering another", () => {
  const dragged = { left: 180, right: 380, top: 100, bottom: 300 };
  const target = { left: 300, right: 500, top: 100, bottom: 300 };

  assert.equal(cardRectOverlapRatio(dragged, target), 0.4);
  assert.equal(cardRectOverlapRatio(dragged, { left: 400, right: 600, top: 100, bottom: 300 }), 0);
  assert.equal(cardRectOverlapRatio(null, target), 0);
});
