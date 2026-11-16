import assert from "node:assert/strict";
import test from "node:test";
import { internalSpherePageUrl, spherePageUrl } from "./sphere-page-urls.js";
import { localizedPageUrl } from "./page-urls.js";
import { SPHERE_APPLICATIONS } from "./applications.js";
import { SPHERE_TABS } from "./sphere-tabs.js";

test("all sphere defaults open at the root and every tab is reachable under a short path", () => {
  for (const [application, { home }] of Object.entries(SPHERE_APPLICATIONS)) {
    assert.equal(spherePageUrl(home, application), "/");
    assert.equal(internalSpherePageUrl("/", application), home);
    for (const { id } of SPHERE_TABS[application]?.slice(1) ?? []) {
      const old = `${home}?tab=${id}`;
      const shortened = spherePageUrl(localizedPageUrl(old), application);
      assert.match(decodeURI(shortened), /^\/[а-яё-]+$/u);
      assert.equal(internalSpherePageUrl(shortened, application), old);
      assert.equal(spherePageUrl(shortened, application), shortened);
    }
  }
});

test("Wishlist navigation has distinct paths for catalog, brands and adjacent views", () => {
  for (const [long, short] of [
    ["/app/wishes?tab=products", "/"],
    ["/app/wishes?tab=places", "/места"],
    ["/app/wishes/catalog?tab=products", "/каталог"],
    ["/app/wishes/catalog?source=brands&tab=products", "/каталог-брендов"],
    ["/app/wishes/catalog?source=ohmywishes&tab=products", "/каталог-брендов"],
    ["/app/wishes/catalog/item/external%3Aitem%2Fid", "/товар/external%3Aitem%2Fid"],
    ["/app/wishes?publication=calendar&tab=products", "/календарь"],
    ["/app/classifieds", "/публикации"],
    ["/app/store?tab=products", "/магазин"],
    ["/app/orders", "/заказы"],
  ]) {
    assert.equal(decodeURI(spherePageUrl(long, "wishlist")), short);
  }
  assert.equal(internalSpherePageUrl("/каталог-брендов", "wishlist"), "/app/wishes/catalog?source=brands");
});

test("compact routes preserve references, dates and location fragments", () => {
  const long = "/app/spheres/health?tab=sleep&date=2026-11-16&owner=колосков-михаил#focus";
  const short = spherePageUrl(long, "health");
  assert.equal(decodeURI(short), "/сон?дата=2026-11-16&владелец=колосков-михаил#focus");
  const [pathname, search] = internalSpherePageUrl(short, "health").split("?");
  assert.equal(pathname, "/app/spheres/health");
  const params = new URLSearchParams(search.split("#")[0]);
  assert.deepEqual(Object.fromEntries(params), { tab: "sleep", date: "2026-11-16", owner: "колосков-михаил" });
  assert.equal(spherePageUrl("/app/spheres/contacts", "career"), encodeURI("/контакты"));
  assert.equal(decodeURI(spherePageUrl("/app/spheres/identity?tab=hogan", "identity")), "/тесты?отчёт=хоган");
  assert.equal(spherePageUrl("/api/wishes?tab=products", "wishlist"), "/api/wishes?tab=products");
  assert.equal(internalSpherePageUrl("/сон", null), "/сон");
  assert.equal(spherePageUrl("/колосков-михаил", "wishlist"), "/колосков-михаил");
});

test("the platform and Telegram use short paths without confusing public profiles with sphere tabs", () => {
  assert.equal(decodeURI(spherePageUrl("/app/planning", "platform")), "/планирование");
  assert.equal(decodeURI(spherePageUrl("/app/planning?tab=todo&date=2026-11-16")), "/дела?дата=2026-11-16");
  assert.equal(decodeURI(spherePageUrl("/app/spheres/health?tab=sleep")), "/здоровье/сон");
  assert.equal(internalSpherePageUrl("/вишлист/каталог-брендов"), "/app/wishes/catalog?source=brands");
  assert.equal(internalSpherePageUrl("/колосков-михаил"), "/колосков-михаил");
});
