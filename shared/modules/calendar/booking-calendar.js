import { localDateKey } from "../planning/planning.js";
import { minutesTime, timeMinutes } from "./planning-calendar.js";

export const BOOKING_CALENDAR_ID = "booking";
export const BOOKING_CALENDAR_TITLE = "Календарь для бронирования";
export const BOOKING_SLOT_TITLE = "Встреча";
export const BOOKING_CALENDAR_PATH = `/app/planning?tab=calendar&space=${BOOKING_CALENDAR_ID}`;

export function bookingSlotSchedule(slot) {
  const start = new Date(slot.startsAt);
  const end = new Date(slot.endsAt);
  return {
    id: slot.id,
    title: slot.title,
    dueOn: localDateKey(start),
    startTime: minutesTime(start.getHours() * 60 + start.getMinutes()),
    durationMinutes: Math.max(15, Math.round((end.getTime() - start.getTime()) / 60_000)),
    bookingSlot: true,
    bookingId: slot.bookingId,
    bookingStatus: slot.bookingStatus,
    requestedAt: slot.requestedAt,
    guestName: slot.guestName,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
  };
}

export function bookingSlotPayload(schedule, { id, title = BOOKING_SLOT_TITLE } = {}) {
  const startMinutes = timeMinutes(schedule.startTime);
  if (!schedule.dueOn || startMinutes === null) return null;
  const [year, month, day] = schedule.dueOn.split("-").map(Number);
  const start = new Date(year, month - 1, day, Math.floor(startMinutes / 60), startMinutes % 60);
  if (localDateKey(start) !== schedule.dueOn
    || start.getHours() * 60 + start.getMinutes() !== startMinutes) return null;
  return {
    id,
    title,
    startsAt: start.toISOString(),
    duration: schedule.durationMinutes || 60,
  };
}

export function bookingSlotOverlaps(slots, schedule) {
  const proposed = bookingSlotPayload(schedule, { id: "overlap-check" });
  if (!proposed) return false;
  const start = Date.parse(proposed.startsAt);
  const end = start + proposed.duration * 60_000;
  return slots.some((slot) => Date.parse(slot.startsAt) < end && Date.parse(slot.endsAt) > start);
}
