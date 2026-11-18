// Presentation fixture only. The browser runner rejects all real API requests.
import React from "react";
import { BrowserRouter } from "react-router-dom";
import { BusinessAccessPage, SessionContext, ToastContext } from "../../src/App.jsx?personal-offers-test-export";
import App from "../../src/App.jsx";
import { MobileFormPages } from "../../src/components/mobile-form-pages";
import { WishlistBusinessManager, WishlistBusinessListing } from "../../src/modules/wishlist/wishlist-business.jsx";
import { RollsWallet } from "../../src/modules/payments/rolls-wallet.jsx";
import { api } from "../../src/modules/runtime/api.js";
import { createRoot } from "react-dom/client";
import { PersonalOfferComposer, PersonalOffers, BusinessPersonalOffers } from "../../src/components/personal-offers";
import "../../src/styles.css";
import "../../src/index.css";
const item = { id: "item", title: "Персональная консультация по развитию бизнеса", priceRolls: 50 };
const base = { ...item, priceRolls: 50, business: { id: "seller", name: "Бизнес" }, recipient: { id: "buyer", name: "Получатель" }, expiresAt: new Date(Date.now()+86400000).toISOString() };
const params = new URLSearchParams(location.search);
const scenario = params.get("case");
const catalog = scenario === "sphere-catalog";
const sphere = params.get("sphere") || "health";
const section = { health: "sport", career: "contacts", identity: "identity-reports", education: "courses" }[sphere];
let subscribed = false;
let followFailed = false;
let createdItem = null;
let itemFailed = false;
let paid = false;
let creationFailed = false;
let paymentFailed = false;
let refunded = false;
let refundFailed = false;
const recording = ["payment-recorded", "payment-archived", "seller-recorded", "wishlist-recorded"].includes(scenario);
const sellerScenario = scenario === "seller" || scenario === "seller-recorded";
const wishlistBuyerScenario = scenario === "wishlist-buyer" || scenario === "wishlist-recorded";
const fixtureKey = `test-offer-recording:${scenario}`;
const savedFixture = recording ? JSON.parse(sessionStorage.getItem(fixtureKey)) : null;
if (savedFixture) ({ paid, refunded } = savedFixture);
window.offerCalls = savedFixture?.calls ?? [];
window.offerChecks = savedFixture?.checks ?? [];
function persistFixture() {
  if (recording) sessionStorage.setItem(fixtureKey, JSON.stringify({ paid, refunded, calls: window.offerCalls, checks: window.offerChecks }));
}
const rollbackError = (message, code) => Object.assign(new Error(message), { status: 409, code });
const wishlistItem = { id:"wishlist-item",title:"Wishlist товар",description:"Описание товара",price:"999 RUB",active:true,brand:"Бренд",business:{id:"seller",name:"Продавец",username:"seller",pageTitle:"Магазин"} };
const client = {
  async get(path) {
    const statusPath = /^\/personal-offers\/([^/]+)\/(pay|refund)\/status$/.exec(path);
    if (statusPath) {
      const [, offerId, action] = statusPath;
      window.offerChecks.push(path);
      const recorded = action === "refund" ? refunded : paid;
      return { purchase: recorded ? { id: "purchase", offerId, priceRolls: offerId === "wishlist-invoice" ? 75 : 50,
        businessId: "seller", recipientId: "buyer", refundedAt: action === "refund" ? base.expiresAt : null } : null };
    }
    if (catalog) {
      if (path === "/me") return { user: { ...user, canDiscoverSpheres: true } };
      if (path.startsWith("/sphere-shares/context?")) return { isOwner: true, owner: user, requests: [], people: [] };
      if (path === `/business-catalog/${sphere}`) return { accounts: [{ username: "brand", name: "Партнёр сферы", isFollowing: subscribed }] };
      if (path === `/personal-offers?sphere=${sphere}`) return { offers: subscribed ? [{ ...base, id: "brand-offer", title: "Предложение партнёра", status: "active" }] : [] };
      if (path === "/health/workouts") return { workouts: [], lists: [] };
      if (path === "/education/courses") return { courses: [], lists: [], groups: [] };
      if (path === "/identity/reports") return { tests: [] };
      if (path === "/identity/reports/gallup") return { mode: "empty" };
      return { contacts: [], items: [], requests: [] };
    }
    if(path.endsWith("/buyers"))return {buyers:[{id:"buyer",name:"Получатель",username:"buyer"}]};
    if(path.startsWith("/wishlist-business/")) return path.endsWith("/page")?{page:{title:"Магазин",description:"",published:true},items:[wishlistItem]}:{items:[{...wishlistItem,personalOffer:{id:"wishlist-invoice",title:wishlistItem.title,priceRolls:75,expiresAt:base.expiresAt,status:paid?"paid":"active",business:wishlistItem.business}}]};
    if (scenario === "pagination" && path.startsWith("/personal-offers")) {
      const first = { ...base, id: "first-page", title: "Первый счёт", status: "paid" };
      const older = { ...base, id: "older-offer", title: "Ранний счёт", status: paid ? "paid" : "active" };
      return path.includes("offset=100") ? { offers: [first, older], nextOffset: null } : { offers: [first], nextOffset: 100 };
    }
    if (path === "/rolls/gift-cards") return { cards: [] };
    if (path === "/dashboard/purchases") return { purchasePlans: [], wishes: [], subscriptions: [], purchaseCollaborations: [] };
    if (path.startsWith("/dashboard/purchase-month?")) return { totals: [], openTotals: [], limits: [] };
    if (path === "/rolls") return { balance: 100, transactions: scenario === "wallet-page" ? [
      { id: "purchase:shop", kind: "purchase", direction: "outgoing", amount: 50, productTitle: "Товар магазина", createdAt: base.expiresAt },
      { id: "refund:shop", kind: "refund", direction: "incoming", amount: 50, productTitle: "Товар магазина", createdAt: base.expiresAt },
    ] : [], balances: { giftCards: "300", reservedRewards: "70" }, features: {}, nextOffset: null, orderAttention: scenario === "wallet-page" ? [
      { kind: "review", count: 2, amount: "50", reviewUntil: "2026-11-19T10:00:00Z" },
      { kind: "claim", count: 1, amount: "70", reviewUntil: null },
      { kind: "dispute", count: 1, amount: "20", reviewUntil: null },
      { kind: "fulfill", count: 1, amount: "40", reviewUntil: null },
    ] : [] };
    if (path === "/business-access/requests") return { requests: [] };
    if (path === "/personal-offers/items") return { items: scenario === "business-page" ? [item] : createdItem ? [createdItem] : [] };
    if (path.startsWith("/business-access/users") || path.startsWith("/personal-offers/recipients")) return { people: [{ id: "buyer", name: scenario === "long-recipient" ? "И".repeat(80) : "Получатель", username: scenario === "long-recipient" ? "w".repeat(32) : "buyer" }] };
    if (scenario === "empty" || (scenario === "payment-archived" && paid)) return { offers: [] };
    if (scenario === "unavailable") return { offers: [{ ...base, id: "unavailable", title: "Счёт с закрытым доступом", status: "unavailable" }] };
    if (scenario === "error") throw new Error("Не удалось загрузить счета");
    if (scenario === "loading") return new Promise(() => {});
    return { offers: [ { ...base, id: "active", title: "Активный оффер", status: paid ? "paid" : "active" }, { ...base, id: "expired", title: "Истёкший оффер", status: "expired", expiresAt: new Date(0).toISOString() }, { ...base, id: "paid", title: "Оплаченный оффер", status: refunded ? "refunded" : "paid" } ] };
  },
  async post(path, body) {
    window.offerCalls.push({ path, body });
    if (catalog && path === "/profile/brand/follow") {
      if (!followFailed) { followFailed = true; throw new Error("Повторите подписку"); }
      subscribed = body.following;
      return { following: subscribed };
    }
    if(path.startsWith("/wishlist-business/")){if(!creationFailed){creationFailed=true;throw new Error("Повторите рекомендацию");}return{sent:true,personalOfferId:"wishlist-invoice"};}
    if (path === "/personal-offers/items") { if (!itemFailed) { itemFailed = true; throw new Error("Повторите сохранение"); } createdItem = { id: "new-item", title: body.title }; return { item: createdItem }; }
    if (path === "/personal-offers") { if (!creationFailed) { creationFailed = true; throw new Error("Повторите создание"); } return { offer: { id: "created" } }; }
    if (path.endsWith("/refund")) {
      if (!refundFailed) {
        refundFailed = true;
        if (recording) { refunded = true; persistFixture(); }
        throw new Error("Ответ о возврате потерян");
      }
      refunded = true;
      persistFixture();
      return { purchase: { id: "purchase", refundedAt: base.expiresAt } };
    }
    if (scenario === "payment-conflict" && path.endsWith("/pay")) {
      throw rollbackError("Этот запрос уже использован для другой операции", "IDEMPOTENCY_CONFLICT");
    }
    if (!paymentFailed) {
      paymentFailed = true;
      if (recording) { paid = true; persistFixture(); throw new Error("Ответ об оплате потерян"); }
      throw rollbackError("Недостаточно роллов", "INSUFFICIENT_ROLLS");
    }
    paid = true;
    persistFixture();
    return { purchase: { id: "purchase" } };
  },
};
// Real page compositions use this same presentation-only client; actual API
// network requests remain forbidden by the runner.
api.get = client.get;
api.post = client.post;
const user = { id: scenario === "business-page" ? "seller" : "buyer", name: "Пользователь", username: "fixture", accountType: scenario === "business-page" ? "business" : "personal" };
const showToast = () => {};
const content = scenario === "wishlist-manager" ? <main className="app-page rollapp-body"><WishlistBusinessManager user={{id:"seller",accountType:"business",businessCategory:"seller",sellerSpace:"products"}} space="products" /></main> : wishlistBuyerScenario ? <main className="app-page rollapp-body"><WishlistBusinessListing space="products" offers viewerId={user.id} /></main> : scenario === "business-page" ? <BusinessAccessPage /> : scenario === "wallet-page" ? <RollsWallet user={user} /> : <main className="app-page rollapp-body page-stack">{scenario === "business" ? <BusinessPersonalOffers client={client} /> : <>{(!scenario || scenario === "long-recipient") && <PersonalOfferComposer item={item} client={client} />}<PersonalOffers user={{ id: sellerScenario ? "seller" : "buyer" }} client={client} /></>}</main>;
if (catalog) history.replaceState({}, "", `/app/spheres/${sphere}?tab=${section}`);
createRoot(document.getElementById("root")).render(<BrowserRouter>{catalog ? <App /> : <SessionContext.Provider value={{ user }}><ToastContext.Provider value={showToast}><MobileFormPages>{content}</MobileFormPages></ToastContext.Provider></SessionContext.Provider>}</BrowserRouter>);
