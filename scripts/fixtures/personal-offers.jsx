// Presentation fixture only. The browser runner rejects all real API requests.
import React from "react";
import { BrowserRouter } from "react-router-dom";
import { BusinessAccessPage, SessionContext, ToastContext } from "../../src/App.jsx?personal-offers-test-export";
import { MobileFormPages } from "../../src/components/mobile-form-pages";
import { WishlistBusinessManager, WishlistBusinessListing } from "../../src/components/wishlist-business";
import { RollsWallet } from "../../src/components/rolls-wallet";
import { api } from "../../src/api.js";
import { createRoot } from "react-dom/client";
import { PersonalOfferComposer, PersonalOffers, BusinessPersonalOffers } from "../../src/components/personal-offers";
import "../../src/styles.css";
import "../../src/index.css";
const item = { id: "item", title: "Персональная консультация по развитию бизнеса", priceRolls: 50 };
const base = { ...item, priceRolls: 50, business: { id: "seller", name: "Бизнес" }, recipient: { id: "buyer", name: "Получатель" }, expiresAt: new Date(Date.now()+86400000).toISOString() };
const scenario = new URLSearchParams(location.search).get("case");
let createdItem = null;
let itemFailed = false;
let paid = false;
let creationFailed = false;
let paymentFailed = false;
window.offerCalls = [];
const wishlistItem = { id:"wishlist-item",title:"Wishlist товар",description:"Описание товара",price:"999 RUB",active:true,brand:"Бренд",business:{id:"seller",name:"Продавец",username:"seller",pageTitle:"Магазин"} };
const client = {
  async get(path) {
    if(path.endsWith("/buyers"))return {buyers:[{id:"buyer",name:"Получатель",username:"buyer"}]};
    if(path.startsWith("/wishlist-business/")) return path.endsWith("/page")?{page:{title:"Магазин",description:"",published:true},items:[wishlistItem]}:{items:[{...wishlistItem,personalOffer:{id:"wishlist-invoice",title:wishlistItem.title,priceRolls:75,expiresAt:base.expiresAt,status:paid?"paid":"active",business:wishlistItem.business}}]};
    if (scenario === "pagination" && path.startsWith("/personal-offers")) {
      const first = { ...base, id: "first-page", title: "Первый счёт", status: "paid" };
      const older = { ...base, id: "older-offer", title: "Ранний счёт", status: paid ? "paid" : "active" };
      return path.includes("offset=100") ? { offers: [first, older], nextOffset: null } : { offers: [first], nextOffset: 100 };
    }
    if (path === "/rolls/gift-cards") return { cards: [] };
    if (path === "/rolls") return { balance: 100, transactions: [], features: {}, nextOffset: null };
    if (path === "/business-access/requests") return { requests: [] };
    if (path === "/personal-offers/items") return { items: scenario === "business-page" ? [item] : createdItem ? [createdItem] : [] };
    if (path.startsWith("/business-access/users")) return { people: [{ id: "buyer", name: scenario === "long-recipient" ? "И".repeat(80) : "Получатель", username: scenario === "long-recipient" ? "w".repeat(32) : "buyer" }] };
    if (scenario === "empty") return { offers: [] };
    if (scenario === "error") throw new Error("Не удалось загрузить счета");
    if (scenario === "loading") return new Promise(() => {});
    return { offers: [ { ...base, id: "active", title: "Активный оффер", status: paid ? "paid" : "active" }, { ...base, id: "expired", title: "Истёкший оффер", status: "expired", expiresAt: new Date(0).toISOString() }, { ...base, id: "paid", title: "Оплаченный оффер", status: "paid" } ] };
  },
  async post(path, body) {
    window.offerCalls.push({ path, body });
    if(path.startsWith("/wishlist-business/")){if(!creationFailed){creationFailed=true;throw new Error("Повторите рекомендацию");}return{sent:true,personalOfferId:"wishlist-invoice"};}
    if (path === "/personal-offers/items") { if (!itemFailed) { itemFailed = true; throw new Error("Повторите сохранение"); } createdItem = { id: "new-item", title: body.title }; return { item: createdItem }; }
    if (path === "/personal-offers") { if (!creationFailed) { creationFailed = true; throw new Error("Повторите создание"); } return { offer: { id: "created" } }; }
    if (!paymentFailed) { paymentFailed = true; throw new Error("Недостаточно роллов"); }
    paid = true; return { purchase: { id: "purchase" } };
  },
};
// Real page compositions use this same presentation-only client; actual API
// network requests remain forbidden by the runner.
api.get = client.get;
api.post = client.post;
const user = { id: scenario === "business-page" ? "seller" : "buyer", name: "Пользователь", username: "fixture", accountType: scenario === "business-page" ? "business" : "personal" };
const showToast = () => {};
const content = scenario === "wishlist-manager" ? <main className="app-page rollapp-body"><WishlistBusinessManager user={{id:"seller",accountType:"business",businessCategory:"seller",sellerSpace:"products"}} space="products" /></main> : scenario === "wishlist-buyer" ? <main className="app-page rollapp-body"><WishlistBusinessListing space="products" offers /></main> : scenario === "business-page" ? <BusinessAccessPage /> : scenario === "wallet-page" ? <RollsWallet user={user} /> : <main className="app-page rollapp-body page-stack">{scenario === "business" ? <BusinessPersonalOffers client={client} /> : <>{(!scenario || scenario === "long-recipient") && <PersonalOfferComposer item={item} client={client} />}<PersonalOffers user={{ id: scenario === "seller" ? "seller" : "buyer" }} client={client} /></>}</main>;
createRoot(document.getElementById("root")).render(<BrowserRouter><SessionContext.Provider value={{ user }}><ToastContext.Provider value={showToast}><MobileFormPages>{content}</MobileFormPages></ToastContext.Provider></SessionContext.Provider></BrowserRouter>);
