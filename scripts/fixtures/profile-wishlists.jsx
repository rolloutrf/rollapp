import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { api } from "../../src/api.js";
import App from "../../src/App.jsx";
import "../../src/styles.css";
import "../../src/index.css";

const sharedLinks = {
  ohmywishes: "https://ohmywishes.com/users/example/lists/example",
  ozon: "https://ozon.ru/t/example?share=1",
  wb: "https://www.wildberries.ru/wishlist/example",
  "yandex-market": "https://market.yandex.ru/cc/example?share=1",
};
const guest = new URLSearchParams(location.search).has("guest");
let profile = { id: "fixture", name: "Профиль", username: "fixture", wishlistLinks: guest || location.pathname === "/app/wishes" ? sharedLinks : {} };
window.profilePatches = [];
window.unexpectedRequests = [];

function unexpected(path) {
  window.unexpectedRequests.push(path);
  throw new Error(`Unexpected fixture request ${path}`);
}

api.get = async (path) => {
  if (path === "/me") return { user: guest ? null : profile };
  if (path === "/auth/yandex/config") return { enabled: false };
  if (path === "/me/openrouter") return { configured: false, available: true };
  if (path === "/me/openrouter/models") return { models: [] };
  if (path === "/dashboard") return { profile, lists: [], wishes: [], groups: [] };
  if (path === "/gift-suggestions") return { items: [] };
  if (["/profile/fixture", "/profile/fixture-renamed"].includes(path)) {
    return { profile, isOwner: !guest, lists: [], wishes: [], followingCount: 0, followersCount: 0 };
  }
  return unexpected(path);
};
api.post = async (path) => {
  if (!guest && path === "/wishes/backfill-previews") return { updated: 0 };
  return unexpected(path);
};
api.patch = async (path, patch) => {
  if (guest || path !== "/me") return unexpected(path);
  window.profilePatches.push(patch);
  if (window.rejectProfileSave) throw new Error("Сохранение недоступно");
  const wishlistLinks = { ...profile.wishlistLinks };
  for (const [provider, url] of Object.entries(patch.wishlistLinks || {})) {
    if (url) wishlistLinks[provider] = url;
    else delete wishlistLinks[provider];
  }
  profile = { ...profile, ...patch, wishlistLinks };
  return { user: profile };
};

createRoot(document.getElementById("root")).render(<BrowserRouter><App /></BrowserRouter>);
