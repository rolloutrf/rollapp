import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MobileFormPages } from "@/components/mobile-form-pages";
import { BusinessGiftAction, ProfileGiftCards } from "@/components/gift-cards";
import App from "@/App";
import { BusinessMarketplacePage } from "@/components/business-marketplace-page";
import { api } from "@/api";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import "../../src/styles.css";
import "../../src/index.css";

const business = { id: "business", name: "Мастерская подарков и хорошего настроения", username: "studio", bio: "Делаем подарки для особых случаев." };
const user = { id: "owner", name: "Владелец" };
const friend = { id: "friend", name: "Получатель подарочной карты", username: "friend" };
const params = new URLSearchParams(location.search);
const state = { balance: 100, cards: params.has("offers") ? [{id:"card", balance:25, business}, {id:"other-card", balance:100, business:{id:"other",name:"Другой бизнес",username:"other"}}] : params.has("cards") ? [{id:"first-card",balance:25,business},{id:"second-card",balance:50,business}] : [], calls: [], requests: new Map(), lost: false };
state.reads = [];
state.sellerItems = (params.has("empty") || params.has("owner-empty")) ? [] : [{ id: "seller-item", space: "products", title: "Товар мастерской", description: "Описание товара", brand: "Мастерская", active: true, price: "1 000 ₽", business }];
const personal = { ...user, username: "owner", accountType: "personal" };
const wishes = [
  { id: "fulfilled", title: "Кофемолка", description: "Ручная кофемолка", status: "fulfilled", space: "products", listIds: [], userId: user.id },
  { id: "active", title: "Кофеварка", price: 3500, currency: "RUB", status: "active", space: "products", listIds: [], userId: user.id },
];
state.sales = params.has("sale-buyer")
  ? [{ id: "wish-sale:peer", space: "products", title: "Товар участника", active: true, personalSale: true,
    business: params.get("sale-buyer") === "owner" ? personal : friend }]
  : [];
window.giftHarness = state;
const sellerPage = { title: "Старое название витрины", description: "Старое описание витрины.", published: params.has("owner") || !params.has("dashboard") };
const clone = (value) => JSON.parse(JSON.stringify(value));
// Explicit UI transport. Real API and production writes are forbidden here.
api.get = async (path) => {
  state.reads.push(path);
  if (params.has("error")) throw new Error("Не удалось загрузить карты");
  const seller = params.has("seller");
  const owner = params.has("owner") || params.has("dashboard");
  if (path === "/me") return { user: params.has("guest") ? null : owner ? { ...business, accountType: "business", businessCategory: seller ? "seller" : null, sellerSpace: seller ? "products" : null } : { ...user, username: "owner", accountType: "personal" } };
  if (path === "/sphere-shares/incoming") return { shares: [] };
  if (params.has("brand-certificates") && path === "/catalog/brands?space=products") {
    return { brands: [{ id: "brand", label: "BORK", slug: "bork.ru" }] };
  }
  if (params.has("brand-certificates") && path.startsWith("/catalog?")) {
    const query = new URL(path, location.origin).searchParams;
    if (query.get("sections") !== "certificates" || query.get("brand") !== "bork.ru") throw new Error("Expected certificate section request");
    const brand = { id: "brand", label: "BORK", slug: "bork.ru" };
    return { brand, items: [{ id: "product", title: "Товар бренда", space: "products", brand }], total: 1,
      certificates: [{ id: "certificate", title: "Подарочный сертификат", price: 2700, currency: "RUB", space: "products", brand }] };
  }
  if (path === "/dashboard" && params.has("sales")) return { profile: personal, lists: [], wishes, groups: [] };
  if (path === "/dashboard" && params.has("classifieds")) return { profile: personal, lists: [], wishes: [], groups: [] };
  if (path === "/gift-suggestions" && params.has("classifieds")) return { items: [] };
  if (params.has("classifieds") && (path === "/profile/owner/announcements" || path === "/profile/studio/announcements")) {
    return { profile: owner ? business : personal, isOwner: true, announcements: [
      { id: "profile-announcement", createdAt: "2026-11-14T10:00:00Z", title: "Объявление профиля", body: "Текст объявления" },
    ] };
  }
  if (path === "/profile/owner" && params.has("sales")) return { profile: personal, lists: [], wishes, groups: [], isOwner: true };
  if (path.startsWith("/wishlist-business/products/sales")) {
    const wishId = new URL(path, location.origin).searchParams.get("wish");
    const editor = wishId ? state.sales.find(item => item.id === `wish-sale:${wishId}`) || { ...wishes[0], id: undefined, active: false } : null;
    return clone({ items: state.sales, editor, published: true });
  }
  if (/^\/wishlist-business\/[^/]+\/store(?:\?|$)/.test(path) && params.has("store-only")) {
    return { items: [...state.sellerItems, { id: "wish-sale:peer", title: "Товар участника", active: true, personalSale: true, business: friend }], pages: [{ title: "Витрина продавца", username: "studio" }] };
  }
  if (path === "/wishlist-business/products/store" && (params.has("sales") || params.has("sale-buyer"))) {
    return clone({ items: state.sales.filter(item => item.active), pages: [] });
  }
  if (path === "/profile/studio") return { profile: { ...business, accountType: params.has("personal") ? "personal" : "business", businessCategory: seller ? "seller" : null, sellerSpace: seller ? "products" : null }, lists: [], wishes: [], groups: [], isOwner:owner, followersCount:0, followingCount:0 };
  if (path === "/business-profiles/studio/offers" && params.has("empty")) return { items: [] };
  if (path === "/business-profiles/studio/offers") return { items: [{ id:"offer", sphere:"career", kind:"store", itemType:"service", title:"Консультация", description:"Описание услуги", priceRolls:20, business }] };
  if (path === "/wishlist-business/products/profiles/studio") {
    if (params.has("listing-error")) throw new Error("Товары временно недоступны");
    return { items: sellerPage.published ? state.sellerItems.filter(item => item.active) : [], pages: sellerPage.published ? [{ ...sellerPage, username: "studio" }] : [] };
  }
  if (path === "/wishlist-business/products/page") {
    if (!owner || !seller) throw new Error("Запрос владельца недоступен");
    return clone({ items: state.sellerItems, page: sellerPage });
  }
  if (path === "/wishlist-business/places/profiles/studio") return { items: [], pages: [] };
  if (path === "/wishlist-business/products/buyers") return { buyers: [] };
  if (params.has("sale-buyer") && path === "/messenger/conversations") return { conversations: [{ id: "sale-chat", peer: friend, unread: 0 }] };
  if (params.has("sale-buyer") && path.startsWith("/messenger/conversations/sale-chat/messages")) return { peer: friend, messages: [], hasMore: false };
  if (params.has("sale-buyer") && path === "/messenger/subscriptions") return { users: [] };
  if (path === "/rolls/gift-cards") {
    const cards = clone(state.cards);
    if (params.has("missing-card")) state.cards = state.cards.filter((card) => card.id !== "second-card");
    return { cards };
  }
  if (path === "/rolls") return { balance: state.balance };
  if (params.has("store-only") && path === "/rolls/orders") return { orders: [] };
  if (params.has("store-only") && path === "/delivery/cdek/cities") return { cities: [] };
  if (path.startsWith("/rolls/recipients?q=")) return { people: [friend] };
  throw new Error(`Unexpected fixture read: ${path}`);
};
api.uploadImage = async (file) => {
  state.calls.push({ path: "/uploads/images", name: file.name, size: file.size });
  if (!state.photoFailed) {
    state.photoFailed = true;
    throw new Error("Фото временно недоступно");
  }
  return { imageUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWOo6D6IFTEMpAQAyI5UwfdZU4cAAAAASUVORK5CYII=" };
};
api.patch = async (path, payload) => {
  state.calls.push({ path, payload: clone(payload) });
  if (path === "/me") {
    Object.assign(business, payload);
    return { user: { ...business, accountType: "business", businessCategory: "seller", sellerSpace: "products" } };
  }
  const item = state.sellerItems.find((item) => path === `/wishlist-business/products/items/${item.id}`)
    || state.sales.find((item) => path === `/wishlist-business/products/sales/${encodeURIComponent(item.id)}`);
  if (!item) throw new Error(`Unexpected fixture mutation: ${path}`);
  Object.assign(item, payload);
  return { id: item.id, item: clone(item) };
};
api.post = async (path, payload) => {
  // Read-only suggestions do not belong to the authored mutation history.
  if (path === "/catalog/product-suggestions") return { items: [], source: "Wikidata" };
  if (path === "/wishes/backfill-previews" && (params.has("sales") || params.has("classifieds"))) return { updated: 0 };
  state.calls.push({ path, payload: clone(payload) });
  if (path === "/messenger/conversations" && params.has("sale-buyer")) return { conversation: { id: "sale-chat", peer: friend } };
  if (path === "/wishlist-business/products/sales") {
    const { wishId, requestId, ...fields } = payload;
    const id = wishId ? `wish-sale:${wishId}` : `wish-sale:manual:${requestId}`;
    const existing = state.sales.find((item) => item.id === id);
    if (existing) return { id, item: clone(existing), replayed: true };
    state.sales.push({ ...fields, id, space: "products", personalSale: true, business: personal });
    throw new Error("Ответ сервера потерян");
  }
  if (path === "/wishlist-business/products/page") {
    Object.assign(sellerPage, payload);
    return { saved: true };
  }
  if (path === "/wishlist-business/products/items") {
    const { requestId, ...fields } = payload;
    const existing = state.sellerItems.find((item) => item.id === requestId);
    if (existing) return { id: requestId, item: clone(existing), replayed: true };
    state.sellerItems.unshift({ ...fields, id: requestId, space: "products", business });
    await new Promise((resolve) => { state.completeItemSave = resolve; });
    throw new Error("Ответ сервера потерян");
  }
  if (state.requests.has(payload.idempotencyKey)) return clone(state.requests.get(payload.idempotencyKey));
  let card = state.cards[0];
  if (path.includes("/purchases")) { state.cards.find((entry) => entry.id === payload.giftCardId).balance -= 20; }
  else if (path === "/rolls/gift-cards") {
    card = { id: crypto.randomUUID(), balance: 0, business };
    state.cards.unshift(card);
  } else if (path.endsWith("/topup")) {
    card.balance += payload.amount; state.balance -= payload.amount;
  } else if (path.endsWith("/send")) state.cards = [];
  else throw new Error(`Unexpected fixture mutation: ${path}`);
  const result = { card: { id: card.id } };
  state.requests.set(payload.idempotencyKey, result);
  if ((path.endsWith("/topup") || path.includes("/purchases")) && !state.lost) { state.lost = true; throw new Error("Simulated lost response"); }
  return clone(result);
};
function Fixture() {
  useVisualViewport();
  return <div className="app-layout app-layout--dark"><main className="app-main app-main--wishes"><div className="app-page page-stack rollapp-body">
    {params.has("offers") ? <BusinessMarketplacePage businessUsername="studio" kind="store" user={user} /> : <section className="flex flex-col items-center gap-4"><div className="size-24 rounded-full bg-muted" aria-label="Аватар бизнеса" /><BusinessGiftAction business={business} user={params.has("guest") ? null : user} /><h1>{business.name}</h1></section>}
    {!params.has("guest") && <ProfileGiftCards user={user} />}
  </div></main></div>;
}
if (params.has("public")) history.replaceState({}, "", params.has("legacy-storefront") ? "/app/wishes/business?tab=products" : params.has("other-space") ? "/studio/places" : params.has("dashboard") ? "/app/wishes?tab=products" : "/studio/products");
if (params.has("sales")) history.replaceState({}, "", params.get("sales") === "direct" ? "/app/wishes/sales?tab=products" : "/app/wishes?tab=products");
if (params.has("sale-buyer")) history.replaceState({}, "", "/app/wishes/listings?tab=products");
if (params.has("store-only")) {
  const search = new URLSearchParams({ tab: params.get("store-only") || "products" });
  if (params.has("business")) search.set("business", params.get("business"));
  history.replaceState({}, "", `/app/store?${search}`);
}
if (params.has("classifieds")) {
  const start = params.get("classifieds") === "home" ? "/app/wishes" : "/app/classifieds";
  const space = params.get("space");
  history.replaceState({}, "", space ? `${start}?${new URLSearchParams({ tab: space })}` : start);
}
if (params.has("brand-certificates")) history.replaceState({}, "", "/app/wishes/catalog?source=brands&brand=bork.ru");
const fullApp = ["public", "sales", "sale-buyer", "store-only", "classifieds", "brand-certificates"].some((mode) => params.has(mode));
createRoot(document.getElementById("root")).render(<BrowserRouter>{fullApp ? <App /> : <MobileFormPages><Fixture /></MobileFormPages>}</BrowserRouter>);
