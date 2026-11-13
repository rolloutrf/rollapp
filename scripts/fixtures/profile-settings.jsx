import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App, { ProfileSettingsModal, SessionContext, ToastContext } from "/src/App.jsx?profile-settings-fixture";
import { MobileFormPages } from "@/components/mobile-form-pages";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import { api } from "@/api";
import "../../src/styles.css";
import "../../src/index.css";

const mode = new URLSearchParams(location.search).get("state");
const fixtureUser = { id: "unsaved-profile", name: "Имя профиля", username: "profile", bio: "", hasYandex: mode !== "error", canInvite: true, memberNumber: null };
sessionStorage.setItem(`rollapp:virtual-card-sandbox:${fixtureUser.id}:legacy-fund`, JSON.stringify({
  version: 1, id: "DEMO-12345678", ownerId: fixtureUser.id, fundraiserId: "legacy-fund",
  initialBalance: 200, balance: 150, purchases: [{ id: "fixture-purchase", merchant: "Магазин", amount: 50 }],
}));
let openRouter = { available: true, configured: true, model: "fixture-model", keyHint: "…fixture" };
let invites = [];
let mcpKeys = [];
let diskSync = { connected: true, hasNotes: true, enabled: false, pending: false, running: false, lastCompletedAt: null, error: null };
window.completeDiskSync = () => {
  diskSync = { ...diskSync, pending: false, running: false, lastCompletedAt: "2026-11-13T22:00:00Z" };
};
window.mcpKeyRequests = [];
// Explicit component-only transport; no API requests or database writes.
api.get = async (path) => {
  if (path === "/me" && mode === "backup-result") return { user: fixtureUser };
  if (path === "/auth/phone/config" && mode === "backup-result") return { enabled: false };
  if (path === "/me/yandex-backup/f589bf34-5586-4456-aea6-83223dbbd052" && mode === "backup-result") {
    window.backupStatusRequested = true;
    return { status: window.backupReady ? new URLSearchParams(location.search).get("result") : "pending" };
  }
  if (path === "/auth/yandex/config") return { enabled: mode !== "error", diskBackupEnabled: !["error", "disk-sync"].includes(mode),
    diskProfileEnabled: mode === "disk-profile", diskSyncEnabled: mode === "disk-sync" };
  if (mode === "disk-sync" && path === "/me/disk-sync") return diskSync;
  if (mode === "disk-profile" && path === "/me/disk-profile") return { enabled: true, connected: true, active: Boolean(window.diskProfileSaved), available: Boolean(window.diskProfileSaved) };
  if (path === "/me/openrouter" && mode === "error") throw new Error("Fixture settings unavailable");
  if (path === "/me/openrouter") return openRouter;
  if (path === "/me/openrouter/models") return { models: [{ id: "fixture-model", name: "Fixture model" }] };
  if (path === "/me/invites") return { invites };
  if (path === "/mcp/tokens") {
    if (window.rejectMcpKeyList) {
      window.rejectMcpKeyList = false;
      throw new Error("Ключи временно недоступны");
    }
    return { keys: mcpKeys };
  }
  if (path === "/rolls") {
    if (!window.finishWalletLoad) {
      await new Promise((resolve) => { window.finishWalletLoad = resolve; });
      throw new Error("Кошелёк временно недоступен");
    }
    return {
      balance: 23_999_870,
      transactions: Array.from({ length: 16 }, (_, index) => ({
        id: String(index), kind: "manual_grant", direction: "incoming",
        amount: 1_000_000_000, createdAt: "2026-09-23T10:07:00Z",
      })),
    };
  }
  if (path === "/personal-offers") return { offers: [] };
  if (path === "/rolls/gift-cards") {
    window.giftCardReads = (window.giftCardReads || 0) + 1;
    if (mode === "gifts-empty") return { cards: [] };
    if (mode === "gifts-error" && window.giftCardReads === 1) {
      await new Promise((resolve) => { window.finishGiftLoad = resolve; });
      throw new Error("Подарочные карты временно недоступны");
    }
    return { cards: [{ id: "gift-card", balance: 100, business: { id: "fixture-shop", username: "fixture-shop", name: "Магазин" } }] };
  }
  throw new Error(`Unexpected fixture read: ${path}`);
};
const avatarId = "01234567-89ab-4cde-8fab-0123456789ab";
const avatarUrl = `/api/media/${avatarId}`;
api.post = async (path, data) => {
  if (mode === "disk-sync" && path === "/me/disk-sync" && data.ownerId === fixtureUser.id) {
    window.diskSyncActions = [...(window.diskSyncActions ?? []), data.action];
    diskSync = { ...diskSync, enabled: data.action !== "disable", pending: data.action !== "disable", running: data.action !== "disable" };
    return diskSync;
  }
  if (mode === "disk-profile" && path === "/me/disk-profile" && data.ownerId === fixtureUser.id) {
    window.diskProfileAttempts = (window.diskProfileAttempts || 0) + 1;
    if (window.diskProfileAttempts === 1) throw new Error("Диск временно недоступен");
    window.diskProfileSaved = true;
    return { active: true, available: true, user: { ...fixtureUser, diskProfile: true } };
  }
  if (path === "/mcp/tokens") {
    window.mcpKeyRequests.push(data.scope);
    const id = window.mcpKeyRequests.length.toString(16).padStart(64, "0");
    const key = { id, scope: data.scope, expiresAt: "2026-12-12T12:00:00.000Z" };
    mcpKeys = [key, ...mcpKeys];
    return { ...key, token: `rwmcp_${data.scope}_${"x".repeat(43)}` };
  }
  if (path === "/me/invites") {
    window.inviteRequests = (window.inviteRequests || 0) + 1;
    if (window.inviteRequests === 1) throw new Error("Отправка временно недоступна");
    invites = [{ id: String(window.inviteRequests), email: data.email, status: "sent", expiresAt: "2026-11-17T00:00:00.000Z" }, ...invites];
    return { id: String(window.inviteRequests), email: data.email, expiresAt: invites[0].expiresAt };
  }
  if (mode === "openrouter" && path === "/me/openrouter" && openRouter.keyHint === "…fixture"
      && data.apiKey === "sk-or-v1-fixture_test_key" && data.model === "fixture-model") {
    openRouter = { ...openRouter, keyHint: "…fixture-saved" };
    return openRouter;
  }
  throw new Error("Unexpected fixture POST");
};
api.delete = async (path) => {
  if (path.startsWith("/mcp/tokens/")) {
    mcpKeys = mcpKeys.filter(({ id }) => path !== `/mcp/tokens/${id}`);
    return { ok: true };
  }
  if (mode === "avatar" && window.rejectAvatarSave && path === `/uploads/images/${avatarId}`) {
    window.rejectedAvatarReleased = true;
    return { ok: true };
  }
  if (mode === "openrouter" && path === "/me/openrouter" && openRouter.keyHint === "…fixture-saved") {
    openRouter = { available: true, configured: false };
    return openRouter;
  }
  throw new Error("Unexpected fixture DELETE");
};
api.uploadImage = async (file) => {
  if (mode !== "avatar" || file.type !== "image/png") throw new Error("Unexpected fixture upload");
  return { id: avatarId, imageUrl: avatarUrl };
};
api.patch = async (path, data) => {
  if (mode === "avatar" && path === "/me" && JSON.stringify(data) === JSON.stringify({ avatarUrl })) {
    if (window.rejectAvatarSave) throw Object.assign(new Error("Fixture rejected photo"), { status: 400 });
    return { user: { id: "unsaved-profile", name: "Имя профиля", username: "profile", bio: "", hasYandex: true, avatarUrl } };
  }
  if (mode !== "save" || path !== "/me" || JSON.stringify(data) !== '{"name":"Сохранённое имя"}') throw new Error("Unexpected fixture save");
  return { user: { ...data } };
};
function Fixture() {
  useVisualViewport();
  const [open, setOpen] = useState(true);
  const [savedName, setSavedName] = useState("");
  const [user, setUser] = useState(fixtureUser);
  return <SessionContext.Provider value={{ user, setSession: () => {} }}><ToastContext.Provider value={() => {}}><MobileFormPages>
    {savedName && <output>{savedName}</output>}
    {user.avatarUrl && <output>Фото сохранено</output>}
    {open && <ProfileSettingsModal user={user} onClose={() => setOpen(false)} onProfileUpdated={setUser} onSaved={(saved) => { setSavedName(saved.name); setOpen(false); }} />}
  </MobileFormPages></ToastContext.Provider></SessionContext.Provider>;
}
createRoot(document.getElementById("root")).render(
  <BrowserRouter>{mode === "backup-result" ? <React.StrictMode><App /></React.StrictMode> : <Fixture />}</BrowserRouter>,
);
