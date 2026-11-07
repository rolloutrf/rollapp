import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MobileFormPages } from "../../src/components/mobile-form-pages.jsx";
import { ProfilePublications } from "../../src/components/profile-publications.jsx";
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
const data = loading ? null : {
  profile,
  isOwner: owner,
  slots: empty ? [] : guest ? [open] : [open, booked],
  announcements: empty ? [] : [announcement],
};

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <MobileFormPages>
      <div className="app-layout app-layout--dark">
        <main className="app-main app-main--with-profile">
          <ProfilePublications
            section={section}
            username="host"
            endpoint={`/profile/host/${section}`}
            user={guest ? null : { id: owner ? "owner" : "visitor" }}
            data={data}
            loading={loading}
          />
        </main>
      </div>
    </MobileFormPages>
  </BrowserRouter>,
);
