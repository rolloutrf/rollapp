import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalRetailerProductUrl,
  retailerPreview,
  retailerPreviewImageUrl,
  retailerSupportsAutomaticMetadata,
} from "./retailer-previews.js";

test("matches product links from the supported food retailers", () => {
  const cases = [
    ["https://lenta.com/product/desert-kokosovyjj-170g-709085/", "lenta"],
    ["https://www.lenta.com/item/desert-kokosovyjj-709085/", "lenta"],
    ["https://samokat.ru/product/ketchup-heinz-320-g", "samokat"],
    ["https://www.samokat.ru/product/ketchup-heinz-320-g?utm_source=share", "samokat"],
    ["https://lavka.yandex.ru/good/petrushka-50-gram", "lavka"],
    ["https://vkusvill.ru/goods/yaytso-kurinoe-s0-22658/", "vkusvill"],
    ["https://www.vkusvill.ru/goods/yaytso-kurinoe-varaksino-92801.html", "vkusvill"],
    ["https://bushe.ru/products/xleb-laplandskii-320-g-a4fb88?pointId=5", "bushe"],
  ];

  for (const [url, id] of cases) assert.equal(retailerPreview(url)?.id, id, url);
});

test("rejects retailer lookalikes, catalog pages, credentials, and non-web URLs", () => {
  const invalid = [
    "https://lenta.com.evil.example/product/coffee/",
    "https://not-samokat.ru/product/coffee/",
    "https://evil.lavka.yandex.ru/good/coffee/",
    "https://bushe.ru/products?category=xleb",
    "https://lenta.com/product/coffee/reviews",
    "https://samokat.ru/product/coffee/nutrition/",
    "https://lavka.yandex.ru/good/coffee/reviews",
    "https://bushe.ru/products/coffee/details",
    "https://vkusvill.ru/goods/molochnye-produkty-yaytso/yaytso/",
    "https://user:secret@lenta.com/product/coffee/",
    "https://lenta.com:8443/product/coffee/",
    "ftp://samokat.ru/product/coffee/",
    "not a url",
    "",
  ];

  for (const url of invalid) {
    assert.equal(retailerPreview(url), null, url);
    assert.equal(retailerPreviewImageUrl(url), "", url);
  }
});

test("canonicalizes exact retailer product links for stable cache keys", () => {
  const cases = [
    [
      "http://www.lenta.com/product/desert-kokosovyjj-170g-709085/?utm_source=share#details",
      "https://lenta.com/product/desert-kokosovyjj-170g-709085",
    ],
    [
      "https://www.samokat.ru/product/ketchup-heinz-320-g/?utm_source=share",
      "https://samokat.ru/product/ketchup-heinz-320-g",
    ],
    [
      "https://lavka.yandex.ru/good/petrushka-50-gram/?from=search#composition",
      "https://lavka.yandex.ru/good/petrushka-50-gram",
    ],
    [
      "http://www.bushe.ru/products/xleb-laplandskii-320-g-a4fb88/?pointId=5",
      "https://bushe.ru/products/xleb-laplandskii-320-g-a4fb88?pointId=5",
    ],
    [
      "https://www.vkusvill.ru/goods/yaytso-kurinoe-s0-22658/?utm_source=share#details",
      "https://vkusvill.ru/goods/yaytso-kurinoe-s0-22658",
    ],
  ];

  for (const [source, expected] of cases) {
    assert.equal(canonicalRetailerProductUrl(source)?.href, expected, source);
  }
  assert.equal(canonicalRetailerProductUrl("https://lenta.com/product/coffee/reviews"), null);
  assert.equal(canonicalRetailerProductUrl("https://example.com/product/coffee"), null);
  assert.equal(
    canonicalRetailerProductUrl("https://www.lenta.com/item/milk-888521/?utm_source=share")?.href,
    "https://lenta.com/product/milk-888521",
  );
  assert.equal(
    canonicalRetailerProductUrl("https://lavka.yandex.ru/good/item:st-rt?utm_source=x&retail_slug=votonya_new_pt8x4")?.href,
    "https://lavka.yandex.ru/good/item:st-rt?retail_slug=votonya_new_pt8x4",
  );
  assert.equal(canonicalRetailerProductUrl("https://lavka.yandex.ru/good/item:st-rt?utm_source=x"), null);
});

test("returns a local preview asset for every supported retailer", () => {
  assert.equal(retailerPreviewImageUrl("https://lenta.com/product/coffee/"), "/retailer-previews/lenta.svg");
  assert.equal(retailerPreviewImageUrl("https://samokat.ru/product/coffee/"), "/retailer-previews/samokat.svg");
  assert.equal(retailerPreviewImageUrl("https://lavka.yandex.ru/good/coffee"), "/retailer-previews/lavka.svg");
  assert.equal(retailerPreviewImageUrl("https://bushe.ru/products/coffee"), "/retailer-previews/bushe.svg");
  assert.equal(retailerPreviewImageUrl("https://vkusvill.ru/goods/coffee-123"), "/retailer-previews/vkusvill.svg");
});

test("automatically fetches only retailers with stable public product metadata", () => {
  assert.equal(retailerSupportsAutomaticMetadata("https://lavka.yandex.ru/good/coffee"), true);
  assert.equal(retailerSupportsAutomaticMetadata("https://bushe.ru/products/coffee"), true);
  assert.equal(retailerSupportsAutomaticMetadata("https://lenta.com/product/coffee/"), false);
  assert.equal(retailerSupportsAutomaticMetadata("https://samokat.ru/product/coffee/"), false);
  assert.equal(retailerSupportsAutomaticMetadata("https://vkusvill.ru/goods/coffee-123/"), true);
});
