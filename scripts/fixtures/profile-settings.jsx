import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ProfileSettingsModal, SessionContext, ToastContext } from "/src/App.jsx?profile-settings-fixture";
import { MobileFormPages } from "@/components/mobile-form-pages";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import { api } from "@/api";
import "../../src/styles.css";
import "../../src/index.css";

const mode = new URLSearchParams(location.search).get("state");
// Explicit component-only transport; no API requests or database writes.
api.get = async (path) => {
  if (path === "/auth/yandex/config") return { enabled: false };
  if (path === "/me/openrouter" && mode === "error") throw new Error("Fixture settings unavailable");
  if (path === "/me/openrouter") return { available: true, configured: true, model: "fixture-model", keyHint: "…fixture" };
  if (path === "/me/openrouter/models") return { models: [{ id: "fixture-model", name: "Fixture model" }] };
  throw new Error(`Unexpected fixture read: ${path}`);
};
for (const method of ["post", "patch", "delete", "uploadImage"]) api[method] = async () => { throw new Error("Mutations forbidden in profile fixture"); };
function Fixture() {
  useVisualViewport();
  const [open, setOpen] = useState(true);
  const user = { id: "unsaved-profile", name: "Имя профиля", username: "profile", bio: "", hasYandex: mode !== "error" };
  return <SessionContext.Provider value={{ user, setSession: () => {} }}><ToastContext.Provider value={() => {}}><MobileFormPages>
    {open && <ProfileSettingsModal user={user} onClose={() => setOpen(false)} onSaved={() => { throw new Error("Save forbidden"); }} />}
  </MobileFormPages></ToastContext.Provider></SessionContext.Provider>;
}
createRoot(document.getElementById("root")).render(<BrowserRouter><Fixture /></BrowserRouter>);
