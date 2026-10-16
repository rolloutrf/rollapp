// Presentation props only. The runner rejects every API request.
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes, useNavigate } from "react-router-dom";
import { CatalogWishDetailsContent, WishDetailsModal, SessionContext, ToastContext } from "@/App.jsx?detail-actions-smoke";
import { ContentPage } from "@/components/content-page";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import "../../src/styles.css";
import "../../src/index.css";

const lists = [];
function Detail() {
  useVisualViewport();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const kind = params.get("kind");
  const item = { id: "fixture", title: "Длинное название желания для проверки меню", space: kind === "product" ? "products" : "places", status: params.get("fulfilled") ? "fulfilled" : "active", description: Array(40).fill("Описание карточки с обычной прокруткой документа.").join(" "), listIds: [], owners: [], price: 100, currency: "RUB", reservationCount: params.has("reserved") ? 1 : 0, reservedByMe: params.has("mine"), addedByMe: params.has("added") };
  return <SessionContext.Provider value={{ user: { id: "owner", username: "owner" } }}><ToastContext.Provider value={() => {}}>
    {kind === "catalog" ? <ContentPage title="Каталог" onBack={() => navigate(-1)} className="catalog-item-page"><CatalogWishDetailsContent screen item={item} wishlistDisabled={params.has("pending")} wishlistPending={params.has("pending")} onToggleWishlist={() => {}} /></ContentPage>
      : <WishDetailsModal screen wish={item} lists={lists} owner={kind !== "guest"} profile={{ username: "owner" }} onClose={() => navigate(-1)} onEdit={() => {}} />}
  </ToastContext.Provider></SessionContext.Provider>;
}

createRoot(document.getElementById("root")).render(<React.StrictMode><BrowserRouter><Routes>
  <Route path="/__detail-actions" element={<Link to={`/__detail-actions/item${location.search}`}>Открыть карточку</Link>} />
  <Route path="/__detail-actions/item" element={<Detail />} />
</Routes></BrowserRouter></React.StrictMode>);
