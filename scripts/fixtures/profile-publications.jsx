import React, { useState } from "react";
import { api } from "../../src/api.js";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MobileFormPages } from "../../src/components/mobile-form-pages.jsx";
import { ProfilePublications } from "../../src/components/profile-publications.jsx";
import { useVisualViewport } from "../../src/hooks/use-visual-viewport.js";
import "../../src/styles.css";
import "../../src/index.css";

const params = new URLSearchParams(location.search);
const section = params.get("section");
const mode = params.get("mode");
const owner = mode === "owner";
const guest = mode === "guest";
const empty = mode === "empty";
const loading = mode === "loading";
const profile = { username: "host", name: "Участник" };
const baseSlot = { startsAt: "2026-11-15T09:00:00Z", endsAt: "2026-11-15T10:00:00Z" };
const open = { ...baseSlot, id: "open", title: "Первая встреча" };
const booked = {
  ...baseSlot, id: "booked", bookingId: "booking", title: "Встреча по итогам недели",
  bookedByMe: !owner, ...(owner && { guestName: "Светлана" }),
};
const announcement = {
  id: "announcement", createdAt: baseSlot.startsAt, title: "Открыта запись на ноябрь",
  body: `Доступные даты\n${"длинноесловобезпробелов".repeat(35)}`,
};
let snapshot = loading ? null : {
  profile,
  isOwner: owner,
  slots: empty ? [] : guest ? [open] : [open, booked],
  announcements: empty ? [] : [announcement],
};

// Simulate UI responses through the fixture transport. The browser forbids all
// network API requests, and the PostgreSQL lifecycle has a separate test.
const transport = window.publicationTransport = { calls: [], conflictNextBooking: false, loseNextAnnouncementResponse: false };
const endpoint = `/profile/host/${section}`;
const openBooking = `${endpoint}/open/bookings/open-booking`;
api.post = async (path, body) => {
  transport.calls.push(["POST", path, body]);
  if (!owner && !guest && section === "calendar" && path === `${endpoint}/open/book`) {
    if (transport.conflictNextBooking) {
      snapshot = { ...snapshot, slots: snapshot.slots.filter(slot => slot.id !== "open") };
      throw Object.assign(new Error("Это время больше недоступно. Выберите другой слот."), { status: 409 });
    }
    snapshot = {
      ...snapshot,
      slots: snapshot.slots.map(slot => slot.id === "open"
        ? { ...slot, bookingId: "open-booking", bookedByMe: true } : slot),
    };
    return { bookingId: "open-booking" };
  }
  if (owner && path === endpoint && section === "calendar") {
    const endsAt = new Date(Date.parse(body.startsAt) + body.duration * 60_000).toISOString();
    snapshot = { ...snapshot, slots: [...snapshot.slots, { ...body, endsAt }] };
    return { id: body.id };
  }
  if (owner && path === endpoint && section === "announcements") {
    if (!snapshot.announcements.some(item => item.id === body.id)) {
      snapshot = { ...snapshot, announcements: [{ ...body, createdAt: baseSlot.startsAt }, ...snapshot.announcements] };
    }
    if (transport.loseNextAnnouncementResponse) {
      transport.loseNextAnnouncementResponse = false;
      throw new Error("Ответ сервера потерян");
    }
    return { id: body.id };
  }
  throw new Error(`Unexpected POST ${path}`);
};
api.patch = async (path, body) => {
  transport.calls.push(["PATCH", path, body]);
  if (!owner || section !== "announcements" || path !== `${endpoint}/announcement`) throw new Error(`Unexpected PATCH ${path}`);
  snapshot = { ...snapshot, announcements: snapshot.announcements.map(item => item.id === announcement.id ? { ...item, ...body } : item) };
  return { ok: true };
};
api.delete = async path => {
  transport.calls.push(["DELETE", path]);
  if (!owner && !guest && section === "calendar" && path === openBooking) {
    snapshot = { ...snapshot, slots: snapshot.slots.map(slot => slot.id === "open" ? open : slot) };
    return { ok: true };
  }
  if (owner && section === "announcements" && path === `${endpoint}/announcement`) {
    snapshot = { ...snapshot, announcements: snapshot.announcements.filter(item => item.id !== announcement.id) };
    return { ok: true };
  }
  throw new Error(`Unexpected DELETE ${path}`);
};

function Fixture() {
  useVisualViewport();
  const [data, setData] = useState(snapshot);
  return <div className="app-layout app-layout--dark">
    <main className="app-main app-main--with-profile">
      <ProfilePublications
        section={section}
        username="host"
        endpoint={endpoint}
        user={guest ? null : { id: owner ? "owner" : "visitor" }}
        data={data}
        loading={loading}
        reload={async () => { setData(snapshot); return snapshot; }}
      />
    </main>
  </div>;
}

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <MobileFormPages><Fixture /></MobileFormPages>
  </BrowserRouter>,
);
