import { useState } from "react";
import { CatalogWishDetailsContent, CatalogWishDetailsDrawer } from "@/modules/catalog-marketplace/wish-catalog.jsx";
import { ContentPage } from "@/components/content-page";
import { Button } from "@/components/ui/button";
import { StorePage } from "@/modules/checkout/store-page.jsx";
import { PlaceListingDetailsPage, PlaceListingsList } from "@/modules/catalog-marketplace/place-listings.jsx";
import { BusinessCatalogContext } from "@/modules/catalog-marketplace/catalog-brands.jsx";
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

const samplePlaces = [
  { id: "p1", slug: "shozhu-0050", name: "«Ателье» (Atelier TAPAS & BAR)", category: "restaurant", categoryLabel: "Ресторан",
    subcategory: "ресторан", description: "Тапас-бар у Петроградской. Живая музыка по четвергам, винная карта — два листа.",
    addresses: ["Большой пр. В.О., 24"], links: [{ url: "https://t.me/atelier.tapas.bar", type: "telegram" }, { url: "https://atelier.example", type: "site" }],
    waitCount: 3, isWaiting: false },
  { id: "p2", slug: "shozhu-0188", name: "«Академия»", category: "shop", categoryLabel: "Магазин и шоурум",
    subcategory: "книжный + кафе", description: "Книжный + кафе. (упомянуто в канале «Схожу, пожалуй»)",
    addresses: [], links: [], waitCount: 1, isWaiting: true },
];

function Places({ detail }) {
  const routes = {
    "GET /wishlist-business/wishlist/places": { places: samplePlaces },
    "POST /wishlist-business/wishlist/places/shozhu-0050/wait": { waiting: true, waitCount: 4 },
  };
  return <Scenario routes={routes} path="/app/wishes">{detail
    ? <PlaceListingDetailsPage space="wishlist" slug="shozhu-0050" />
    : <BusinessCatalogContext.Provider value={{ space: "wishlist" }}><PlaceListingsList /></BusinessCatalogContext.Provider>}</Scenario>;
}
export const PlacesGrid = { name: "Места рядом — сетка", render: Places, args: { detail: false } };
export const PlaceDetail = { ...PlacesGrid, name: "Карточка места", args: { detail: true } };
