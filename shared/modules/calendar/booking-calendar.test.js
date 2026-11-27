import test from "node:test";
import assert from "node:assert/strict";
import {
  BOOKING_CALENDAR_PATH, bookingSlotOverlaps, bookingSlotPayload, bookingSlotSchedule,
} from "./booking-calendar.js";

test("booking slots round-trip through the local calendar schedule", () => {
  const schedule = { dueOn: "2026-02-03", startTime: "10:30", durationMinutes: 45 };
  const payload = bookingSlotPayload(schedule, { id: "slot", title: "Консультация" });
  const slot = {
    ...payload,
    endsAt: new Date(Date.parse(payload.startsAt) + payload.duration * 60_000).toISOString(),
    bookingId: null,
  };
  assert.deepEqual(bookingSlotSchedule(slot), {
    id: "slot",
    title: "Консультация",
    dueOn: schedule.dueOn,
    startTime: schedule.startTime,
    durationMinutes: schedule.durationMinutes,
    bookingSlot: true,
    bookingId: null,
    bookingStatus: undefined,
    requestedAt: undefined,
    guestName: undefined,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
  });
  assert.equal(BOOKING_CALENDAR_PATH, "/app/planning?tab=calendar&space=booking");
});

test("booking calendar rejects invalid local times and detects interval overlap", () => {
  assert.equal(bookingSlotPayload({ dueOn: "", startTime: "10:00", durationMinutes: 30 }, { id: "slot" }), null);
  const existing = bookingSlotPayload({ dueOn: "2026-02-03", startTime: "10:00", durationMinutes: 60 }, { id: "saved" });
  const slots = [{ ...existing, endsAt: new Date(Date.parse(existing.startsAt) + 60 * 60_000).toISOString() }];
  assert.equal(bookingSlotOverlaps(slots, { dueOn: "2026-02-03", startTime: "10:45", durationMinutes: 30 }), true);
  assert.equal(bookingSlotOverlaps(slots, { dueOn: "2026-02-03", startTime: "11:00", durationMinutes: 30 }), false);
});
