import test from "node:test";
import assert from "node:assert/strict";
import { publicSessionSlot } from "./profile-publications.js";

test("only the owner and the booked participant can see a taken slot", () => {
  const row = {
    id: "slot", title: "Сессия", starts_at: "2026-11-07T09:00:00Z", ends_at: "2026-11-07T10:00:00Z",
    booking_id: "booking", guest_id: "guest", guest_name: "Участник",
  };
  assert.equal(publicSessionSlot(row, { isOwner: false }), null);
  assert.equal(publicSessionSlot(row, { viewerId: "other", isOwner: false }), null);
  const guest = publicSessionSlot(row, { viewerId: "guest", isOwner: false });
  assert.equal(guest.bookingId, "booking");
  assert.equal(guest.bookedByMe, true);
  assert.equal(guest.guestName, undefined);
  const owner = publicSessionSlot(row, { viewerId: "host", isOwner: true });
  assert.equal(owner.guestName, "Участник");
  assert.equal(owner.guest_id, undefined);
  const free = publicSessionSlot({ ...row, booking_id: null, guest_id: null }, { isOwner: false });
  assert.equal(free.bookedByMe, false);
  assert.equal(free.bookingId, null);
  assert.equal(free.title, row.title);
});
