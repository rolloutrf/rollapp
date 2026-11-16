import { useState } from "react";
import { CatalogWishDetailsContent, CatalogWishDetailsDrawer } from "@/modules/catalog-marketplace/wish-catalog.jsx";
import { CatalogPageHeader } from "@/modules/catalog-marketplace/catalog-page-header.jsx";
import { ContentPage } from "@/components/content-page";
import { Button } from "@/components/ui/button";
import { StorePage } from "@/modules/checkout/store-page.jsx";
import { Page, Scenario, owner, noop } from "../support.jsx";
import { sampleWish, seller, wallet, cities, points } from "../samples.js";

export default { id: "rollapp-catalog-marketplace", title: "РОЛЛАПП/Модули/16 Каталог и витрины" };

function Catalog({ state, drawer }) {
  const [active, setActive] = useState(state === "added");
  const [open, setOpen] = useState(true);
  const item = { ...sampleWish, description: "Описание товара и информация о продавце.", brand: seller.name, business: seller, addedByMe: active,
    participantCount: 4, participants: [owner] };
  const props = { item, wishlistDisabled: state === "pending", wishlistPending: state === "pending", onToggleWishlist: () => setActive(value => !value) };
  return <Scenario>{drawer ? <Page>
    <CatalogPageHeader selectedSpace="products" source="community" title="Каталог желаний" />
    <Button onClick={() => setOpen(true)}>Открыть товар</Button>
    {open && <CatalogWishDetailsDrawer {...props} onClose={() => setOpen(false)} />}
  </Page> : <ContentPage title="Каталог желаний" className="catalog-item-page" onBack={noop}>
    <CatalogWishDetailsContent {...props} screen />
  </ContentPage>}</Scenario>;
}
export const Detail = { name: "Товар в каталоге", render: Catalog, args: { state: "ready" } };
export const Added = { ...Detail, name: "Товар уже в вишлисте", args: { state: "added" } };
export const Pending = { ...Detail, name: "Товар добавляется", args: { state: "pending" } };
export const Drawer = { ...Detail, name: "Детали в панели", args: { state: "ready", drawer: true } };
export const Store = { name: "Магазин котов", render: () => <Scenario path="/app/store" routes={{
  "GET /rolls": wallet, "GET /delivery/cdek/cities": { cities }, "GET /delivery/cdek/points": { points, total: points.length },
}}><Page><StorePage user={owner} selectedSpace="products" /></Page></Scenario> };
