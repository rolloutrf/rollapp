import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MobileFormPages } from "@/components/mobile-form-pages";
import { api } from "@/api";
import App, { PersistentProfileHero, ProfileEditorProvider, SessionProvider, ToastContext, useSession } from "@/App.jsx?profile-mood-smoke";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import "../../src/styles.css";
import "../../src/index.css";

const params = new URLSearchParams(location.search);
const guest = params.has("guest");
const userBase = {
  id: "mood-owner", name: "Александра", username: "mood-owner",
  ...(params.has("photo") && { avatarUrl: "/art/plant.svg" }),
};
if (guest) history.replaceState({}, "", "/mood-owner");
let entries = params.has("history") ? Array.from({ length: 24 }, (_, i) => ({ id: String(24 - i), level: 1 + i % 5, recordedAt: "2026-11-13T10:15:00Z" })) : [];
let published = false;
if (!guest) {
  const saved = JSON.parse(sessionStorage.getItem("profile-mood-fixture") || "null");
  if (saved) ({ entries, published } = saved);
}
let errorOnRead = params.has("history");
let errorOnSave = true;
let previousId = entries.length;
function snapshot(before = null) {
  const page = before ? entries.filter((entry) => Number(entry.id) < Number(before)) : entries;
  return { level: entries[0]?.level ?? null, published, publicMood: published ? entries[0]?.level : null,
    entries: page.slice(0, 20), nextBefore: page.length > 20 ? page[19].id : null };
}
window.__moodSaves = [];
api.get = async (path) => {
  if (path === "/auth/yandex/config") return { enabled: false };
  if (path === "/me") {
    const { level, publicMood } = snapshot();
    return { user: guest ? null : { ...userBase, moodLevel: level, publicMood } };
  }
  if (guest && path === "/profile/mood-owner") return {
    profile: { ...userBase, publicMood: params.has("published") ? 5 : null },
    lists: [], wishes: [], groups: [], isOwner: false, followersCount: 0, followingCount: 0,
  };
  const url = new URL(path, location.origin);
  if (guest || url.pathname !== "/me/mood") throw new Error(`Unexpected fixture read: ${path}`);
  if (errorOnRead) { errorOnRead = false; throw new Error("Не удалось загрузить журнал"); }
  return snapshot(url.searchParams.get("before"));
};
api.patch = async (path, payload) => {
  if (guest || path !== "/me/mood") throw new Error(`Unexpected fixture save: ${path}`);
  window.__moodSaves.push(payload);
  if (errorOnSave) { errorOnSave = false; throw new Error("Не удалось сохранить отметку"); }
  if (payload.entry) entries = [{ id: String(++previousId), level: payload.entry.level, recordedAt: "2026-11-13T10:30:00Z" }, ...entries];
  published = payload.published;
  sessionStorage.setItem("profile-mood-fixture", JSON.stringify({ entries, published }));
  return snapshot();
};

function Fixture() {
  useVisualViewport();
  const { user } = useSession();
  if (!user) return null;
  return <div className="app-layout app-layout--dark">
    <main className="app-main app-main--with-profile">
      <PersistentProfileHero user={user} wishlistChrome />
    </main>
  </div>;
}

createRoot(document.getElementById("root")).render(<BrowserRouter>{guest ? <App /> : (
  <SessionProvider><ToastContext.Provider value={() => {}}><MobileFormPages><ProfileEditorProvider><Fixture /></ProfileEditorProvider></MobileFormPages></ToastContext.Provider></SessionProvider>
)}</BrowserRouter>);
