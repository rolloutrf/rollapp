import test from "node:test";
import assert from "node:assert/strict";
import { publicSpacePath, publicProfileRoute, renamedProfileLocation } from "./profile-links.js";
import { merchantProductUrl } from "./product-links.js";

test("shared space links preserve every space and default safely", () => {
  for (const space of ["products", "places", "events", "media", "food", "transport"]) {
    const path = publicSpacePath("mikhail", space);
    assert.equal(path, `/mikhail/${space}`);
    assert.deepEqual(publicProfileRoute(path), { username: "mikhail", space });
  }
  assert.equal(publicSpacePath("mikhail", "bad"), "/mikhail/products");
  assert.equal(publicProfileRoute("/app/wishes"), null);
  assert.equal(publicProfileRoute("/s/token"), null);
  assert.equal(publicProfileRoute("/mikhail/not-a-space"), null);
  assert.equal(publicProfileRoute("/%ZZ"), null);
});

test("renaming preserves list, wish, space, query and hash context", () => {
  for (const suffix of ["", "/media", "/lists/list-1", "/wishes/wish-1"]) {
    assert.equal(renamedProfileLocation({ pathname: `/old${suffix}`, search: "?tab=media", hash: "#card" }, "old", "new"), `/new${suffix}?tab=media#card`);
  }
  assert.equal(renamedProfileLocation({ pathname: "/app/spheres/career", search: "?owner=old&tab=cv" }, "old", "new"), "/app/spheres/career?owner=new&tab=cv");
  assert.equal(renamedProfileLocation({ pathname: "/another/media" }, "old", "new"), "/another/media");
  assert.equal(renamedProfileLocation({ pathname: "/s/token/wishes/wish-1" }, "old", "new"), "/s/token/wishes/wish-1");
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
