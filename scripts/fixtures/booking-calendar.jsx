import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { api } from "../../src/modules/runtime/api.js";
import { SessionContext } from "../../src/modules/auth/session.jsx";
import { BookingPlanningCalendar } from "../../src/modules/calendar/booking-planning-calendar.jsx";
import { PlanningSpacesProvider, PlanningSpaceSwitcher } from "../../src/modules/planning/planning-space-switcher.jsx";
import { useVisualViewport } from "../../src/hooks/use-visual-viewport.js";
import { Toaster } from "../../src/components/ui/sonner.jsx";
import { localDateKey } from "../../shared/modules/planning/planning.js";
import "../../src/styles.css";
import "../../src/index.css";

const user = { id: "owner", username: "host", profileSlug: "host", name: "Организатор", accountType: "business" };
const date = new Date();
date.setDate(date.getDate() + 7);
date.setHours(10, 0, 0, 0);
const day = localDateKey(date);
const iso = (hour) => {
  const value = new Date(date);
  value.setHours(hour, 0, 0, 0);
  return value.toISOString();
};
let slots = [
  { id: "booked", title: "Знакомство", startsAt: iso(10), endsAt: iso(11), bookingId: "reservation", bookingStatus: "confirmed", guestName: "Светлана" },
  { id: "open", title: "Консультация", startsAt: iso(12), endsAt: iso(13), bookingId: null },
  { id: "requested", title: "Разбор", startsAt: iso(16), endsAt: iso(17), bookingId: "request", bookingStatus: "pending", guestName: "Алексей" },
];
const transport = window.bookingCalendarTransport = { calls: [], day };

api.get = async (path) => {
  if (path === "/planning/spaces?kind=calendar") return { spaces: [{ id: "main", kind: "calendar", title: "Основной календарь" }] };
  if (path === "/profile/host/calendar") return { profile: user, isOwner: true, slots };
  throw new Error(`Unexpected GET ${path}`);
};
api.post = async (path, body) => {
  transport.calls.push(["POST", path, body]);
  if (path !== "/profile/host/calendar") throw new Error(`Unexpected POST ${path}`);
  const additions = body.slots.map((slot) => ({
    ...slot,
    endsAt: new Date(Date.parse(slot.startsAt) + slot.duration * 60_000).toISOString(),
    bookingId: null,
  }));
  slots = [...slots, ...additions];
  return { ids: additions.map(({ id }) => id) };
};
api.patch = async (path, body) => {
  transport.calls.push(["PATCH", path, body]);
  if (path !== "/profile-bookings/request" || body.decision !== "confirm") throw new Error(`Unexpected PATCH ${path}`);
  slots = slots.map((slot) => slot.id === "requested" ? { ...slot, bookingStatus: "confirmed" } : slot);
  return { bookingId: "request", bookingStatus: "confirmed" };
};
api.delete = async (path) => {
  transport.calls.push(["DELETE", path]);
  if (path === "/profile/host/calendar/booked/bookings/reservation") {
    slots = slots.map((slot) => slot.id === "booked" ? { ...slot, bookingId: null, bookingStatus: null, guestName: undefined } : slot);
    return { ok: true };
  }
  const match = path.match(/^\/profile\/host\/calendar\/([^/]+)$/);
  if (!match) throw new Error(`Unexpected DELETE ${path}`);
  slots = slots.filter((slot) => slot.id !== match[1]);
  return { ok: true };
};

function Fixture() {
  useVisualViewport();
  return <SessionContext.Provider value={{ user, loading: false }}>
    <PlanningSpacesProvider>
      <div className="app-layout app-layout--dark app-layout--planning">
        <header><PlanningSpaceSwitcher /></header>
        <main className="app-main"><BookingPlanningCalendar /></main>
      </div>
    </PlanningSpacesProvider>
    <Toaster />
  </SessionContext.Provider>;
}

createRoot(document.getElementById("root")).render(<BrowserRouter><Fixture /></BrowserRouter>);
