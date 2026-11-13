import test from "node:test";
import assert from "node:assert/strict";
import { publicBookingPath, publicPublicationPath, publicSpacePath, publicProfileRoute, renamedProfileLocation } from "./profile-links.js";
import { merchantProductUrl } from "./product-links.js";

test("shared space links preserve every space and default safely", () => {
  for (const space of ["products", "places", "events", "media", "food", "transport"]) {
    const path = publicSpacePath("synthetic-user", space);
    assert.equal(path, `/synthetic-user/${space}`);
    assert.deepEqual(publicProfileRoute(path), { username: "synthetic-user", space });
  }
  assert.equal(publicSpacePath("synthetic-user", "bad"), "/synthetic-user/products");
  assert.equal(publicProfileRoute("/app/wishes"), null);
  assert.equal(publicProfileRoute("/s/token"), null);
  assert.equal(publicProfileRoute("/synthetic-user/not-a-space"), null);
  assert.equal(publicProfileRoute("/%ZZ"), null);
});

test("renaming preserves list, wish, space, query and hash context", () => {
  for (const suffix of ["", "/media", "/lists/list-1", "/wishes/wish-1", "/calendar", "/calendar/book", "/announcements"]) {
    assert.equal(renamedProfileLocation({ pathname: `/old${suffix}`, search: "?tab=media", hash: "#card" }, "old", "new"), `/new${suffix}?tab=media#card`);
  }
  assert.equal(renamedProfileLocation({ pathname: "/app/spheres/career", search: "?owner=old&tab=cv" }, "old", "new"), "/app/spheres/career?owner=new&tab=cv");
  assert.equal(renamedProfileLocation({ pathname: "/another/media" }, "old", "new"), "/another/media");
  assert.equal(renamedProfileLocation({ pathname: "/s/token/wishes/wish-1" }, "old", "new"), "/s/token/wishes/wish-1");
});

test("publication addresses preserve the owner and have no Wishlist space", () => {
  for (const publication of ["calendar", "announcements"]) {
    const path = publicPublicationPath("иван", publication);
    assert.equal(path, `/%D0%B8%D0%B2%D0%B0%D0%BD/${publication}`);
    assert.deepEqual(publicProfileRoute(path), { username: "иван", space: null, publication });
  }
  assert.deepEqual(publicProfileRoute(publicBookingPath("иван")), { username: "иван", space: null, publication: "calendar" });
  assert.equal(publicProfileRoute("/app/calendar"), null);
});

test("merchant URLs remove provider links and tracking without losing product parameters", () => {
  assert.equal(merchantProductUrl("https://ohmywishes.com/item/1"), "");
  assert.equal(merchantProductUrl("https://www.ohmywishes.com/item/1"), "");
  assert.equal(merchantProductUrl("https://shop.ru/item?id=1&utm_source=ohmywishes&color=red"), "https://shop.ru/item?id=1&color=red");
  assert.equal(merchantProductUrl("https://shop.ru/item?id=1"), "https://shop.ru/item?id=1");
  assert.equal(merchantProductUrl("javascript:alert(1)"), "");
  assert.equal(merchantProductUrl(""), "");
});


test("brand catalog bookmarks accept legacy addresses and the neutral source", async () => {
  const { isBrandCatalogSearch } = await import("./catalog-links.js");
  assert.equal(isBrandCatalogSearch("?source=brands&brand=bork"), true);
  assert.equal(isBrandCatalogSearch("?source=ohmywishes"), true);
  assert.equal(isBrandCatalogSearch("?source=community"), false);
});
