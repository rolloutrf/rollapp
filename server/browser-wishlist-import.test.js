import assert from "node:assert/strict";
import test from "node:test";
import { marketplaceWishlistKey, parseBrowserWishlist } from "./browser-wishlist-import.js";

test("Browser and public Yandex wishlist imports use the same product ID, including legacy links", () => {
  const url = "https://market.yandex.ru/card/monitor/1234?uniqueId=5678";
  const legacy = "https://market.yandex.ru/product--monitor/1234";
  const result = parseBrowserWishlist("yandex-market", { ownerId: "owner", items: [
    { url, title: "Монитор", imageUrl: "https://avatars.mds.yandex.net/get-mpic/1/orig", price: 19999 },
    { url: legacy, title: "Монитор в другом списке" },
  ] }, "owner");
  assert.deepEqual(result, [{
    key: "wishlist-import:yandex-market:1234",
    url: "https://market.yandex.ru/card/monitor/1234",
    title: "Монитор",
    image_url: "https://avatars.mds.yandex.net/get-mpic/1/orig",
    price: 19999,
    currency: "RUB",
  }]);
  assert.equal(marketplaceWishlistKey("yandex-market", legacy), result[0].key);
});

test("Browser imports validate the whole batch before saving and drop third-party images", () => {
  const item = { url: "https://www.ozon.ru/product/svitshot-1234/", title: "Свитшот", imageUrl: "https://tracking.example/image" };
  assert.equal(parseBrowserWishlist("ozon", { ownerId: "owner", items: [item] }, "owner")[0].image_url, "");
  assert.equal(parseBrowserWishlist("ozon", { ownerId: "owner", items: [item, { ...item, url: "https://ozon.ru.example/product/1234/" }] }, "owner"), null);
  assert.equal(parseBrowserWishlist("ozon", { ownerId: "owner", items: [{ ...item, token: "unexpected" }] }, "owner"), null);
  assert.equal(parseBrowserWishlist("wb", { ownerId: "owner", items: [item] }, "owner"), null);
  assert.equal(parseBrowserWishlist("ozon", { ownerId: "owner", items: [item] }, "switched"), null);
  assert.equal(marketplaceWishlistKey("wb", "https://www.wildberries.ru/catalog/1234/detail.aspx?targetUrl=GP"), "wishlist-import:wb:1234");
  assert.equal(marketplaceWishlistKey("ozon", "https://ozon.ru/product/1234/"), "wishlist-import:ozon:1234");
});
