import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { BusinessCatalogList, BusinessCatalogProvider } from "@/modules/catalog-marketplace/catalog-brands.jsx";
import { PlaceListingsList } from "@/modules/catalog-marketplace/place-listings.jsx";
import { api } from "@/modules/runtime/api.js";
import "../../src/styles.css";
import "../../src/index.css";

const query = new URLSearchParams(location.search);
if (query.has("light")) document.documentElement.classList.remove("dark");
const accounts = [
  { username: "example-studio", storefrontTitle: query.has("sphere") ? undefined : "Витрина студии", name: "Студия", avatarUrl: "/favicon.png", isFollowing: false },
  { username: "very-long-business-account-name-for-the-smallest-screen", name: "Независимая студия городских пространств и архитектуры", isFollowing: true },
  { username: "light-workshop", name: "Мастерская света", isFollowing: false },
  { username: "read-only-shop", name: "Магазин без подписки", isFollowing: null },
];
let attempts = 0;
api.get = async (path) => {
  if (path !== (query.has("sphere") ? "/business-catalog/career" : "/wishlist-business/products/accounts")) throw Error(`Unexpected GET ${path}`);
  if (query.has("loading")) return new Promise(() => {});
  if (query.has("error") && attempts++ === 0) throw Error("Сеть недоступна");
  return { accounts: query.has("empty") ? [] : accounts };
};
const calls = [];
window.followCalls = calls;
api.post = async (path, body) => {
  if (path !== "/profile/example-studio/follow") throw Error(`Unexpected POST ${path}`);
  calls.push(body.following);
  await new Promise(resolve => { window.completeBusinessFollow = resolve; });
  if (calls.length === 1) throw Error("Не удалось изменить подписку. Попробуйте ещё раз.");
  return { following: body.following };
};
const places = [
  { slug: "hong", name: "ХОНГ", category: "restaurant", categoryLabel: "Ресторан", subcategory: "лапшичная", description: "Лапшичная в контейнере «Третьего кластера».", addresses: ["8-я Советская ул."], links: [], waitCount: 7, isWaiting: false },
  { slug: "af-brew", name: "AF Brew", category: "bar", categoryLabel: "Бар", subcategory: "пивоварня и тапрум", description: "", addresses: ["Курляндская ул., 48"], links: [], waitCount: 0, isWaiting: true },
  { slug: "no-button", name: "Место без кнопки", category: "cinema", categoryLabel: "Кино", subcategory: "", description: "", addresses: [], links: [], waitCount: 3, isWaiting: null },
];
api.get = ((originalGet) => async (path) => {
  if (path === "/wishlist-business/products/places") return { places: query.has("empty") ? [] : places };
  return originalGet(path);
})(api.get);
const waitCalls = [];
window.waitCalls = waitCalls;
api.post = ((originalPost) => async (path, body) => {
  const match = /^\/wishlist-business\/products\/places\/([a-z-]+)\/wait$/.exec(path);
  if (!match) return originalPost(path, body);
  waitCalls.push(body.waiting);
  await new Promise(resolve => { window.completePlaceWait = resolve; });
  if (waitCalls.length === 1) throw Error("Не удалось сохранить ожидание. Попробуйте ещё раз.");
  const place = places.find(item => item.slug === match[1]);
  place.waitCount = Math.max(0, place.waitCount + (body.waiting ? 1 : -1));
  place.isWaiting = body.waiting;
  return { waiting: body.waiting, waitCount: place.waitCount };
})(api.post);

function Fixture() {
  const { pathname } = useLocation();
  return <div className="app-layout app-layout--dark">
    <main className="app-main">
      <section className="app-page app-page--collection page-stack">
        <BusinessCatalogProvider {...(query.has("sphere") ? { sphere: "career" } : { space: "products" })}>
          <BusinessCatalogList />
          {!query.has("sphere") && <PlaceListingsList />}
        </BusinessCatalogProvider>
        <output hidden data-location>{pathname}</output>
      </section>
    </main>
  </div>;
}

createRoot(document.getElementById("root")).render(<MemoryRouter><Fixture /></MemoryRouter>);
