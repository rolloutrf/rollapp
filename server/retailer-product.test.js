import assert from "node:assert/strict";
import test from "node:test";
import { MetadataFetchError } from "./metadata-fetch.js";
import {
  canonicalLavkaProductUrl,
  canonicalLentaProductUrl,
  canonicalSamokatProductUrl,
  isAllowedRetailerBrowserUrl,
  isSameRetailerProduct,
  isTrustedRetailerImage,
} from "./retailer-product.js";

test("canonicalizes exact retailer product links and removes tracking data", () => {
  assert.equal(
    canonicalSamokatProductUrl("http://www.samokat.ru/product/onion/?utm_source=share#photo").href,
    "https://samokat.ru/product/onion",
  );
  assert.equal(
    canonicalLavkaProductUrl("https://lavka.yandex.ru/good/petrushka-50-gram?utm_source=share#photo").href,
    "https://lavka.yandex.ru/good/petrushka-50-gram",
  );
  assert.equal(
    canonicalLentaProductUrl("https://www.lenta.com/item/old-milk-888521/?utm_source=share#photo").href,
    "https://lenta.com/product/old-milk-888521",
  );
});

test("preserves only the required Lavka retail slug", () => {
  assert.equal(
    canonicalLavkaProductUrl("https://lavka.yandex.ru/good/item:st-rt?retail_slug=votonya_new_pt8x4&utm_source=x").href,
    "https://lavka.yandex.ru/good/item:st-rt?retail_slug=votonya_new_pt8x4",
  );
  assert.throws(
    () => canonicalLavkaProductUrl("https://lavka.yandex.ru/good/item:st-rt?utm_source=x"),
    (error) => error instanceof MetadataFetchError && error.code === "lavka_unsupported_url",
  );
});

test("rejects lookalikes, credentials, extra path segments and Lenta links without an SKU", () => {
  for (const [canonicalize, value] of [
    [canonicalSamokatProductUrl, "https://samokat.ru.evil.example/product/onion"],
    [canonicalLavkaProductUrl, "https://lavka.yandex.ru/good/onion/extra"],
    [canonicalLavkaProductUrl, "https://user:secret@lavka.yandex.ru/good/onion"],
    [canonicalLentaProductUrl, "https://lenta.com/product/coffee/"],
    [canonicalLentaProductUrl, "ftp://lenta.com/product/coffee-123456"],
  ]) assert.throws(() => canonicalize(value), MetadataFetchError, value);
});

test("allows Lenta canonical slug redirects only when the SKU stays the same", () => {
  assert.equal(
    isSameRetailerProduct(
      "lenta",
      "https://lenta.com/item/short-name-709085/",
      "https://lenta.com/product/full-canonical-name-709085/?from=redirect",
    ),
    true,
  );
  assert.equal(
    isSameRetailerProduct(
      "lenta",
      "https://lenta.com/product/milk-709085/",
      "https://lenta.com/product/milk-888521/",
    ),
    false,
  );
});

test("accepts only each retailer's product image CDN and path", () => {
  assert.equal(isTrustedRetailerImage(
    "lavka",
    "https://yastatic.net/avatars/get-grocery-goods/2998517/a/500x500?webp=true",
    "https://lavka.yandex.ru/good/onion",
  ), true);
  assert.equal(isTrustedRetailerImage(
    "lavka",
    "https://avatars.mds.yandex.net/get-eda/food/500x500",
    "https://lavka.yandex.ru/good/item:st-rt?retail_slug=store",
  ), true);
  assert.equal(isTrustedRetailerImage(
    "lenta",
    "https://cdn.api.lenta.com/resample/webp/900x900/photo/888521/catalog-image/image.png",
    "https://lenta.com/product/milk-888521/",
  ), true);
  assert.equal(isTrustedRetailerImage(
    "lenta",
    "https://cdn.api.lenta.com/resample/webp/900x900/photo/000000/catalog-image/image.png",
    "https://lenta.com/product/milk-888521/",
  ), false);
  assert.equal(isTrustedRetailerImage(
    "lavka",
    "https://yastatic.net.evil.example/avatars/get-grocery-goods/a/500x500",
    "https://lavka.yandex.ru/good/onion",
  ), false);
});

test("keeps browser network policies isolated by retailer", () => {
  assert.equal(isAllowedRetailerBrowserUrl("samokat", "https://servicepipe.tech/check.js"), true);
  assert.equal(isAllowedRetailerBrowserUrl("samokat", "https://captcha.servicepipe.tech/captcha.js"), true);
  assert.equal(isAllowedRetailerBrowserUrl("lenta", "https://servicepipe.tech/check.js"), false);
  assert.equal(isAllowedRetailerBrowserUrl("lenta", "https://sitecdn.api.lenta.com/app.js"), true);
  assert.equal(isAllowedRetailerBrowserUrl("lenta", "wss://api.lenta.com/socket"), false);
  assert.equal(isAllowedRetailerBrowserUrl("lenta", "http://lenta.com/insecure"), false);
  assert.equal(isAllowedRetailerBrowserUrl("lenta", "https://api.lenta.com:8443/private"), false);
  assert.equal(isAllowedRetailerBrowserUrl("samokat", "https://user:secret@servicepipe.tech/check"), false);
  assert.equal(isAllowedRetailerBrowserUrl("lenta", "https://lenta.com.evil.example/collect"), false);
});
