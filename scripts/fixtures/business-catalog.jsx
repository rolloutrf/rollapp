import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { BusinessCatalogList, BusinessCatalogProvider } from "@/components/catalog-brands";
import { api } from "@/api";
import "../../src/styles.css";
import "../../src/index.css";

const query = new URLSearchParams(location.search);
if (query.has("light")) document.documentElement.classList.remove("dark");
const accounts = [
  { username: "example-studio", storefrontTitle: query.has("sphere") ? undefined : "Витрина студии", name: "Студия", avatarUrl: "/favicon.png", isFollowing: false },
  { username: "very-long-business-account-name-for-the-smallest-screen", name: "Независимая студия городских пространств и архитектуры", isFollowing: true },
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

function Fixture() {
  const { pathname } = useLocation();
  return <main className="app-page page-stack">
    <BusinessCatalogProvider {...(query.has("sphere") ? { sphere: "career" } : { space: "products" })}>
      <BusinessCatalogList />
    </BusinessCatalogProvider>
    <output hidden data-location>{pathname}</output>
  </main>;
}

createRoot(document.getElementById("root")).render(<MemoryRouter><Fixture /></MemoryRouter>);
