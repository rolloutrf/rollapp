import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchMarketplaceResolvedOffers,
  filterDirectOffersForWish,
  mergeDirectOffers,
  normalizeYandexMarketOffers,
  normalizeWildberriesOffers,
  sourceOfferForWish,
} from "./marketplace-resolvers.js";

const headphones = {
  id: 1344303174,
  name: "Shokz OpenSwim Pro S710 Беспроводные Наушники Серый, Grey",
  supplier: "Находки из Китая",
  totalQuantity: 41,
  sizes: [{ price: { product: 1_434_100 } }],
};

test("turns Wildberries search products into direct item links", () => {
  const offers = normalizeWildberriesOffers({ products: [
    headphones,
    { ...headphones, id: 2, name: "Адаптер для зарядки Shokz OpenSwim Pro Grey" },
    { ...headphones, id: 3, name: "Зарядка Shokz OpenSwim Pro Grey" },
    { ...headphones, id: 4, name: "Shokz OpenSwim Pro S710 оранжевые беспроводные наушники" },
    { ...headphones, id: 5, name: "Shokz OpenSwim Pro S710 красно-серые беспроводные наушники" },
  ] }, { title: "Shokz OpenSwim Pro Grey" }, "2026-09-01T18:00:00.000Z");
  assert.equal(offers.length, 1);
  assert.equal(offers[0].url, "https://www.wildberries.ru/catalog/1344303174/detail.aspx");
  assert.equal(offers[0].price, 14_341);
  assert.equal(offers[0].available, true);
});

test("rejects implausibly cheap matches relative to the saved item", () => {
  const offers = normalizeWildberriesOffers({ products: [{
    ...headphones,
    id: 9,
    name: "Чемодан дорожный Rimowa Essential Cabin",
    sizes: [{ price: { product: 58_300 } }],
  }] }, { title: "RIMOWA Essential Cabin", price: 89_000 });
  assert.equal(offers.length, 0);
});

test("rejects protective films when searching for the device itself", () => {
  const offers = normalizeWildberriesOffers({ products: [{
    ...headphones,
    id: 92_262_0208,
    name: "Гидрогелевая защитная пленка на Amazon Kindle Paperwhite 12",
    sizes: [{ price: { product: 45_000 } }],
  }] }, { title: "Kindle Paperwhite" });
  assert.equal(offers.length, 0);
});

test("fetches the marketplace catalogue without returning its search URL", async () => {
  const requestedUrls = [];
  const offers = await fetchMarketplaceResolvedOffers({ title: "Shokz OpenSwim Pro Grey" }, {
    fetchImpl: async (url) => {
      requestedUrls.push(String(url));
      if (String(url).includes("search.wb.ru")) {
        return { ok: true, json: async () => ({ products: [headphones] }) };
      }
      return { ok: true, text: async () => "<html></html>" };
    },
  });
  assert.equal(requestedUrls.some((url) => url.includes("search.wb.ru")), true);
  assert.equal(requestedUrls.some((url) => url.includes("market.yandex.ru/search")), true);
  assert.equal(offers[0].url.includes("/catalog/1344303174/detail.aspx"), true);
  assert.equal(offers[0].url.includes("search"), false);
});

const yandexMarketHtml = `<html><head><script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "ItemList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      item: {
        "@type": "Product",
        name: "Беспроводные наушники Shokz OpenSwim Pro S710 Gray, серый",
        sku: "4811464608",
        url: "https://market.yandex.ru/card/shokz-openswim-pro-s710-gray/4811464608",
        offers: {
          "@type": "Offer",
          availability: "https://schema.org/InStock",
          price: 18_290,
          priceCurrency: "RUB",
          url: "https://market.yandex.ru/card/shokz-openswim-pro-s710-gray/4811464608",
        },
      },
    },
    {
      "@type": "ListItem",
      position: 2,
      item: {
        "@type": "Product",
        name: "Зарядное устройство Shokz OpenSwim Pro Grey",
        sku: "charger",
        url: "https://market.yandex.ru/card/charger/2",
        offers: { price: 400, priceCurrency: "RUB", url: "https://market.yandex.ru/card/charger/2" },
      },
    },
  ],
})}</script></head></html>`;

test("turns Yandex Market JSON-LD into direct item links", () => {
  const offers = normalizeYandexMarketOffers(
    yandexMarketHtml,
    { title: "Shokz OpenSwim Pro Grey" },
    "2026-09-01T18:00:00.000Z",
  );
  assert.equal(offers.length, 1);
  assert.equal(offers[0].marketplaceId, "yandex-market");
  assert.equal(offers[0].price, 18_290);
  assert.equal(offers[0].available, true);
  assert.equal(offers[0].url, "https://market.yandex.ru/card/shokz-openswim-pro-s710-gray/4811464608");
});

test("always keeps the explicitly saved source service", () => {
  const offer = sourceOfferForWish({
    title: "Shokz OpenSwim Pro Grey",
    url: "https://www.tbank.ru/cf/7yb8jqPoUqI#details",
    price: 16_000,
    currency: "RUB",
  }, "2026-09-01T18:00:00.000Z");
  assert.equal(offer.marketplace, "Т-Банк");
  assert.equal(offer.url, "https://www.tbank.ru/cf/7yb8jqPoUqI");
  assert.equal(offer.source, true);
});

test("filters accessories from AI-resolved offers", () => {
  const offers = filterDirectOffersForWish({ title: "Shokz OpenSwim Pro Grey" }, [
    { title: "Shokz OpenSwim Pro S710 Gray", url: "https://www.ozon.ru/product/one/" },
    { title: "Зарядка Shokz OpenSwim Pro Grey", url: "https://www.ozon.ru/product/two/" },
    { title: "Explicit source", url: "https://example.com/item", source: true },
  ]);
  assert.deepEqual(offers.map((offer) => offer.url), [
    "https://www.ozon.ru/product/one/",
    "https://example.com/item",
  ]);
});

test("deduplicates and ranks direct offers", () => {
  const saved = { id: "saved", marketplaceId: "yandex-market", url: "https://market.yandex.ru/cc/one", available: false, score: 100, price: 16_000, source: true };
  const yandexLive = { id: "yandex-live", marketplaceId: "yandex-market", url: "https://market.yandex.ru/card/one/1", available: true, score: 100, price: 14_000 };
  const live = { id: "live", marketplaceId: "wildberries", url: "https://www.wildberries.ru/catalog/1/detail.aspx", available: true, score: 90, price: 14_000 };
  const worseLive = { ...live, id: "worse", url: "https://www.wildberries.ru/catalog/2/detail.aspx", score: 80, price: 13_000 };
  assert.deepEqual(
    mergeDirectOffers([saved, yandexLive], [live, worseLive, live]).map((offer) => offer.id),
    ["live", "saved"],
  );
});
