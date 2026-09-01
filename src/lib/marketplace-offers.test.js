import assert from "node:assert/strict";
import { test } from "node:test";
import {
  marketplaceForUrl,
  marketplaceOfferMatchesWish,
  marketplaceOffersForWish,
  marketplaceSearchQuery,
  mergeMarketplaceOffers,
} from "./marketplace-offers.js";

test("recognizes supported marketplace product links", () => {
  assert.equal(marketplaceForUrl("https://www.ozon.ru/product/123")?.label, "Ozon");
  assert.equal(marketplaceForUrl("https://market.yandex.ru/product/123")?.label, "Яндекс Маркет");
  assert.equal(marketplaceForUrl("https://www.amazon.com/dp/example")?.label, "Amazon");
  assert.equal(marketplaceForUrl("javascript:alert(1)"), null);
});

test("keeps only the saved concrete product before AI research", () => {
  const offers = marketplaceOffersForWish({
    title: "Kindle Paperwhite",
    url: "https://www.ozon.ru/product/kindle-123",
    price: 10_000,
    currency: "RUB",
  });

  assert.deepEqual(offers[0], {
    id: "source",
    marketplaceId: "ozon",
    marketplace: "Ozon",
    mark: "O",
    title: "Kindle Paperwhite",
    url: "https://www.ozon.ru/product/kindle-123",
    price: 10_000,
    currency: "RUB",
    exact: true,
    source: true,
  });
  assert.equal(offers.length, 1);
});

test("keeps the original source alongside a saved search snapshot", () => {
  const source = marketplaceOffersForWish({
    title: "RIMOWA Essential Cabin",
    url: "https://rimowa-official.com.ru/product/essential-cabin/",
    price: 89_000,
    currency: "RUB",
  });
  const merged = mergeMarketplaceOffers([
    { id: "wb", marketplace: "Wildberries", url: "https://www.wildberries.ru/catalog/1/detail.aspx" },
  ], source);
  assert.equal(merged.length, 2);
  assert.equal(merged[1].url, "https://rimowa-official.com.ru/product/essential-cabin/");
  assert.equal(merged[1].source, true);
});

test("marks a matching snapshot URL as the original without duplicating it", () => {
  const url = "https://market.yandex.ru/cc/AGrBus";
  const merged = mergeMarketplaceOffers(
    [{ id: "ai", marketplace: "Яндекс Маркет", url, title: "Live title" }],
    [{ id: "source", marketplace: "Яндекс Маркет", url, title: "Saved title" }],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].title, "Live title");
  assert.equal(merged[0].source, true);
});

test("keeps only one best link per service and prioritizes its original link", () => {
  const merged = mergeMarketplaceOffers([
    { id: "wb-low", marketplaceId: "wildberries", url: "https://www.wildberries.ru/catalog/1/detail.aspx", available: true, score: 80, price: 1_000 },
    { id: "wb-best", marketplaceId: "wildberries", url: "https://www.wildberries.ru/catalog/2/detail.aspx", available: true, score: 95, price: 1_200 },
    { id: "yandex-live", marketplaceId: "yandex-market", url: "https://market.yandex.ru/card/live/1", available: true, score: 100, price: 14_000 },
  ], [{
    id: "source",
    marketplaceId: "yandex-market",
    marketplace: "Яндекс Маркет",
    url: "https://market.yandex.ru/cc/original",
    price: 16_000,
  }]);
  assert.deepEqual(merged.map((offer) => offer.id), ["wb-best", "source"]);
  assert.equal(merged[1].source, true);
});

test("does not expose marketplace search pages when the wish has no source link", () => {
  const offers = marketplaceOffersForWish({ title: "  Kindle   Paperwhite  ", url: "" });
  assert.equal(marketplaceSearchQuery("  Kindle   Paperwhite  "), "Kindle Paperwhite");
  assert.deepEqual(offers, []);
});

test("hides cached protective films when the wish is the device", () => {
  assert.equal(marketplaceOfferMatchesWish(
    { title: "Kindle Paperwhite" },
    { title: "Гидрогелевая защитная пленка на Amazon Kindle Paperwhite 12" },
  ), false);
  assert.equal(marketplaceOfferMatchesWish(
    { title: "Kindle Paperwhite" },
    { title: "Электронная книга Amazon Kindle Paperwhite 12" },
  ), true);
});
