// The runner rejects API requests. The marketplace scenario emits an in-page stream.
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes, useNavigate } from "react-router-dom";
import { CatalogWishDetailsContent, CatalogWishDetailsDrawer, SharedWishes, WishDetailsModal, SessionContext, ToastContext } from "@/App.jsx?detail-actions-smoke";
import { ContentPage } from "@/components/content-page";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import "../../src/styles.css";
import "../../src/index.css";

const lists = [];
const viewer = { id: "owner", username: "owner" };
const sharedBy = { id: "creator", name: "Автор желания", username: "creator" };
const wishTitle = "Длинное название желания для проверки меню";
const marketplaceTitle = "Осветитель Ulanzi L024 40W RGB / Светодиодный осветитель / Видеосвет для съемки контента";

if (new URLSearchParams(location.search).has("marketplaceSearch")) {
  const originalFetch = window.fetch.bind(window);
  const offer = { id: "offer", marketplaceId: "yandex-market", marketplace: "Яндекс Маркет", title: "Осветитель Ulanzi L024 40W RGB", url: "https://market.yandex.ru/card/ulanzi-l024/123", price: null, exact: true };
  window.fetch = (url, options) => {
    if (url === "/api/wishes/fixture/marketplace-offers") {
      return new Promise(resolve => {
        window.finishMarketplaceRead = () => resolve(Response.json({ aiConfigured: true, snapshot: null }));
      });
    }
    if (url === "/api/wishes/fixture/marketplace-offers/refresh") {
      return Promise.resolve(new Response(new ReadableStream({
        start(controller) {
          const emit = (event, data) => controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          emit("offers", { offers: [offer] });
          window.finishMarketplaceSearch = (empty = false) => {
            if (options.signal.aborted) return;
            if (empty) emit("error", { error: "Новые карточки товара не найдены", code: "marketplace_offers_not_found" });
            else emit("done", { snapshot: { offers: [offer] } });
            controller.close();
          };
        },
      }), { headers: { "Content-Type": "text/event-stream" } }));
    }
    return originalFetch(url, options);
  };
}

function Board() {
  const navigate = useNavigate();
  const to = `/__detail-actions/item${location.search}`;
  if (!new URLSearchParams(location.search).has("board")) return <Link to={to}>Открыть карточку</Link>;
  const wishes = [{ id: "fixture", title: wishTitle, space: "places", status: "active", listIds: [], sharedBy }];
  return <SessionContext.Provider value={{ user: viewer }}><ToastContext.Provider value={() => {}}>
    <div className="app-layout app-layout--dark"><main className="app-main app-main--wishes"><div className="app-page wishes-page">
      <SharedWishes wishes={wishes} profile={viewer} onOpen={() => navigate(to)} />
    </div></main></div>
  </ToastContext.Provider></SessionContext.Provider>;
}

function Detail() {
  useVisualViewport();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const kind = params.get("kind");
  const drawer = params.has("drawer");
  const item = { id: "fixture", title: params.has("marketplaceSearch") ? marketplaceTitle : wishTitle, space: kind === "product" ? "products" : "places", status: params.get("fulfilled") ? "fulfilled" : "active", description: Array(40).fill("Описание карточки с обычной прокруткой документа.").join(" "), listIds: [], owners: [], price: 100, currency: "RUB", reservationCount: params.has("reserved") ? 1 : 0, reservedByMe: params.has("mine"), addedByMe: params.has("added") };
  if (kind === "shared") item.sharedBy = sharedBy;
  return <SessionContext.Provider value={{ user: viewer }}><ToastContext.Provider value={() => {}}>
    {kind === "catalog" ? drawer
      ? <CatalogWishDetailsDrawer item={item} onClose={() => navigate(-1)} />
      : <ContentPage title="Каталог" onBack={() => navigate(-1)} className="catalog-item-page"><CatalogWishDetailsContent screen item={item} wishlistDisabled={params.has("pending")} wishlistPending={params.has("pending")} onToggleWishlist={() => {}} /></ContentPage>
      : <WishDetailsModal screen={!drawer} wish={item} lists={lists} owner={kind !== "guest" && kind !== "shared"} profile={{ username: "owner" }} onClose={() => navigate(-1)} onEdit={() => {}} />}
  </ToastContext.Provider></SessionContext.Provider>;
}

createRoot(document.getElementById("root")).render(<React.StrictMode><BrowserRouter><Routes>
  <Route path="/__detail-actions" element={<Board />} />
  <Route path="/__detail-actions/item" element={<Detail />} />
</Routes></BrowserRouter></React.StrictMode>);
