import React, { useState } from "react";
import { api } from "../../src/api.js";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MobileFormPages } from "../../src/components/mobile-form-pages.jsx";
import { ProfilePublications } from "../../src/components/profile-publications.jsx";
import { useVisualViewport } from "../../src/hooks/use-visual-viewport.js";
import App from "../../src/App.jsx";
import "../../src/styles.css";
import "../../src/index.css";

const params = new URLSearchParams(location.search);
const routing = params.get("routing");
const section = params.get("section");
const mode = params.get("mode");
const owner = mode === "owner";
const guest = mode === "guest";
const empty = mode === "empty";
const loading = mode === "loading";
const failed = mode === "error";
const profile = { username: "host", name: "Участник" };
const future = new Date();
future.setUTCDate(future.getUTCDate() + 2);
const date = future.toISOString().slice(0, 10);
const baseSlot = { startsAt: `${date}T09:00:00Z`, endsAt: `${date}T10:00:00Z` };
const open = { ...baseSlot, id: "open", title: "Первая встреча" };
const booked = {
  startsAt: `${date}T10:00:00Z`, endsAt: `${date}T11:00:00Z`, id: "booked", bookingId: "booking", title: "Встреча по итогам недели",
  bookedByMe: !owner, ...(owner && { guestName: "Светлана" }),
};
const announcement = {
  id: "announcement", createdAt: baseSlot.startsAt, title: "Открыта запись на ноябрь",
  body: `Доступные даты\n${"длинноесловобезпробелов".repeat(35)}`,
};
let snapshot = loading || failed ? null : {
  profile,
  isOwner: owner,
  slots: empty ? [] : guest ? [open] : [open, booked],
  announcements: empty ? [] : [announcement],
};

// Simulate UI responses through the fixture transport. The browser forbids all
// network API requests, and the PostgreSQL lifecycle has a separate test.
const transport = window.publicationTransport = { calls: [], conflictNextBooking: false, loseNextAnnouncementResponse: false, loseNextSlotResponse: false };
const endpoint = `/profile/host/${section}`;
const openBooking = `${endpoint}/open/bookings/open-booking`;
if (routing) {
  const account = { ...profile, id: "owner", accountType: "personal" };
  const collection = {
    profile: account,
    lists: [
      { id: "archive", title: "Архив", space: "media", privacy: "public" },
      { id: "media-list", title: "Медиатека", space: "media", privacy: "public" },
    ],
    wishes: [{ id: "film", title: "Фильм для вечера", space: "media", listIds: ["media-list"], status: "active", userId: account.id }],
    groups: [], isOwner: true, followersCount: 0, followingCount: 0,
  };
  api.get = async path => {
    if (path === "/me") return { user: routing === "booking" ? null : account };
    if (path === "/sphere-shares/incoming") return { shares: [] };
    if (path === "/dashboard" || path === "/profile/host") return collection;
    if (path === "/gift-suggestions") return { items: [] };
    if (path === "/profile/host/calendar" || path === "/profile/host/announcements") return { ...snapshot, isOwner: routing !== "booking" };
    throw new Error(`Unexpected GET ${path}`);
  };
  const path = { wishlist: "/app/wishes?tab=media", public: "/host/lists/media-list", booking: "/host/calendar/book?slot=open&zone=UTC" };
  history.replaceState({}, "", path[routing]);
}
api.post = async (path, body) => {
  if (routing && path === "/wishes/backfill-previews") return { updated: 0 };
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
    const newSlots = body.slots.filter(slot => !snapshot.slots.some(saved => saved.id === slot.id)).map(slot => ({
      ...slot,
      endsAt: new Date(Date.parse(slot.startsAt) + slot.duration * 60_000).toISOString(),
    }));
    snapshot = { ...snapshot, slots: [...snapshot.slots, ...newSlots] };
    if (transport.loseNextSlotResponse) {
      transport.loseNextSlotResponse = false;
      throw new Error("Ответ сервера потерян");
    }
    return { ids: body.slots.map(slot => slot.id) };
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
        user={guest ? null : { id: owner ? "owner" : "visitor", name: owner ? "Организатор" : "Алексей", email: "member@example.test" }}
        data={data}
        loading={loading}
        error={failed ? new Error("Раздел пока недоступен") : null}
        reload={async () => { setData(snapshot); return snapshot; }}
      />
    </main>
  </div>;
}

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    {routing ? <App /> : <MobileFormPages><Fixture /></MobileFormPages>}
  </BrowserRouter>,
);
