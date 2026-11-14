import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRetailerBrowserMetadata, requestBrowserWishlist, RetailerBrowserImportError } from "./retailer-browser-import.js";

test("normalizes trusted browser metadata for supported food retailers", () => {
  const cases = [
    ["samokat", "https://damcdn.samokat.ru/dam-storage-ext-env-prod/2026/02/product-id"],
    ["lavka", "https://yastatic.net/avatars/get-grocery-goods/2998517/product/500x500?webp=true"],
    ["lavka", "https://avatars.mds.yandex.net/get-eda/123/product/orig"],
    ["lenta", "https://cdn.api.lenta.com/resample/webp/900x900/photo/709085/catalog-image/image.png"],
  ];
  for (const [retailerId, imageUrl] of cases) {
    assert.deepEqual(normalizeRetailerBrowserMetadata(retailerId, {
      title: "  Товар  ", description: "  Описание  ", imageUrl, price: "199", currency: "rub",
    }), {
      title: "Товар", description: "Описание", imageUrl, price: 199, currency: "RUB", previewFallback: false,
    });
  }
});
test("rejects an image outside the selected retailer CDN", () => {
  for (const retailerId of ["samokat", "lavka", "lenta"]) {
    assert.throws(
      () => normalizeRetailerBrowserMetadata(retailerId, { imageUrl: "https://tracking.example/pixel.jpg" }),
      (error) => error instanceof RetailerBrowserImportError && error.code === "image_missing",
    );
  }
});

test("an older extension cannot silently substitute all favorites for a saved link", async () => {
  const target = new EventTarget();
  target.location = { origin: "https://роллапп.рф" };
  const posted = [];
  target.postMessage = (message, origin) => {
    posted.push(message.type);
    const response = new Event("message");
    Object.assign(response, { source: target, origin, data: {
      source: "rollapp-retailer-helper", type: "ROLLAPP_WISHLIST_PONG",
      requestId: message.requestId, result: { ok: true },
    } });
    target.dispatchEvent(response);
  };
  await assert.rejects(
    requestBrowserWishlist("ozon", { target, url: "https://ozon.ru/t/example" }),
    { code: "helper_upgrade_required" },
  );
  assert.deepEqual(posted, ["ROLLAPP_WISHLIST_PING"]);
});
