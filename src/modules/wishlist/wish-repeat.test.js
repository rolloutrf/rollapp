import assert from "node:assert/strict";
import test from "node:test";
import { buildRepeatWishPayload } from "./wish-repeat.js";

test("repeating an unsorted wish preserves its non-product space", () => {
  for (const space of ["places", "events", "media", "food", "transport"]) {
    const payload = buildRepeatWishPayload({ title: "Снова", space, listIds: [] }, space);
    assert.equal(payload.space, space);
    assert.deepEqual(payload.listIds, []);
  }
});

test("repeating an event keeps its date and creates an active independent wish", () => {
  const wish = {
    id: "fulfilled-event",
    title: "Концерт",
    status: "fulfilled",
    eventDate: "2026-12-15",
    space: "events",
    listIds: ["concerts"],
    reservedByMe: true,
    reservationCount: 1,
  };
  const payload = buildRepeatWishPayload(wish, "events");
  assert.equal(payload.eventDate, "2026-12-15");
  assert.equal(payload.space, "events");
  for (const key of ["id", "status", "reservedByMe", "reservationCount"]) {
    assert.equal(Object.hasOwn(payload, key), false);
  }
  payload.listIds.push("another-list");
  assert.deepEqual(wish.listIds, ["concerts"]);
});

test("repeating a legacy wish uses the space resolved from its lists", () => {
  const payload = buildRepeatWishPayload({ title: "Автомобиль", space: null, listIds: ["cars"] }, "transport");
  assert.equal(payload.space, "transport");
  assert.equal(payload.eventDate, null);
});
