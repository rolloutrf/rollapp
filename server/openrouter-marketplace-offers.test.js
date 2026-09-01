import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildOpenRouterMarketplaceRequest,
  fetchOpenRouterMarketplaceOffers,
  normalizeOpenRouterOffers,
} from "./openrouter-marketplace-offers.js";

function responsePayload(offers) {
  return {
    model: "mistralai/mistral-small-2603",
    choices: [{ message: { content: JSON.stringify({ offers, summary: "Сравнили предложения" }) } }],
  };
}

const validOffer = {
  marketplace: "Ozon",
  title: "Kindle Paperwhite 16 GB",
  price: 18_990,
  currency: "RUB",
  url: "https://www.ozon.ru/product/kindle-paperwhite-123/",
  seller: "Ozon",
  delivery: "Завтра",
  available: true,
  score: 96,
  reason: "Точная модель и объём памяти",
};

test("builds a constrained realtime marketplace research request", () => {
  const request = buildOpenRouterMarketplaceRequest({ title: "Kindle Paperwhite", price: 10_000, currency: "RUB" });
  assert.equal(request.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(request.model, "mistralai/mistral-small-2603");
  assert.equal(request.body.tools[0].type, "openrouter:web_search");
  assert.equal(request.body.tools[0].parameters.max_uses, 6);
  assert.ok(request.body.tools[0].parameters.allowed_domains.includes("ozon.ru"));
  assert.equal(request.body.response_format.type, "json_schema");
  assert.equal(request.body.provider.require_parameters, true);
});

test("can target Ozon with a dedicated direct-card search", () => {
  const request = buildOpenRouterMarketplaceRequest({ title: "Shokz OpenSwim Pro Grey" }, {
    marketplaceIds: ["ozon"],
  });
  assert.deepEqual(request.body.tools[0].parameters.allowed_domains, ["ozon.ru"]);
  assert.equal(request.body.tools[0].parameters.engine, "parallel");
  assert.match(request.body.messages[0].content, /ozon\.ru\/product\//);
  assert.doesNotMatch(request.body.messages[0].content, /wildberries\.ru\/catalog/);
});

test("uses direct product citations returned by marketplace web search", () => {
  const payload = responsePayload([]);
  payload.choices[0].message.annotations = [
    {
      type: "url_citation",
      url_citation: {
        url: "https://www.ozon.ru/product/shokz-openswim-pro-s710-gray-1662095408/reviews/",
        title: "Наушники Shokz OpenSwim Pro S710 Gray",
        content: "Отзывы покупателей. Цена 16 361 ₽.",
      },
    },
    {
      type: "url_citation",
      url_citation: {
        url: "https://www.ozon.ru/category/shokz-openswim/",
        title: "Категория Shokz OpenSwim",
        content: "Каталог товаров",
      },
    },
  ];
  const result = normalizeOpenRouterOffers(payload);
  assert.equal(result.offers.length, 1);
  assert.equal(result.offers[0].url, "https://www.ozon.ru/product/shokz-openswim-pro-s710-gray-1662095408/");
  assert.equal(result.offers[0].price, 16_361);
});

test("normalizes direct product offers and rejects search pages", () => {
  const result = normalizeOpenRouterOffers(responsePayload([
    validOffer,
    { ...validOffer, url: "https://www.ozon.ru/search/?text=kindle", price: 17_000 },
    { ...validOffer, marketplace: "DNS", url: "https://www.dns-shop.ru/product/kindle-456/", price: 20_000, score: 90 },
  ]), "2026-09-01T18:00:00.000Z");
  assert.equal(result.offers.length, 2);
  assert.equal(result.offers[0].marketplaceId, "ozon");
  assert.equal(result.offers[0].checkedAt, "2026-09-01T18:00:00.000Z");
});

test("keeps only the best direct card from each marketplace", () => {
  const result = normalizeOpenRouterOffers(responsePayload([
    { ...validOffer, url: "https://www.ozon.ru/product/kindle-expensive-1/", price: 21_000, score: 90 },
    { ...validOffer, url: "https://www.ozon.ru/product/kindle-best-2/", price: 18_500, score: 98 },
    { ...validOffer, marketplace: "DNS", url: "https://www.dns-shop.ru/product/kindle-3/", price: 19_000, score: 95 },
  ]));
  assert.deepEqual(result.offers.map((offer) => offer.url), [
    "https://www.ozon.ru/product/kindle-best-2/",
    "https://www.dns-shop.ru/product/kindle-3/",
  ]);
});

test("accepts an offers array returned by Mistral structured output", () => {
  const result = normalizeOpenRouterOffers({
    model: "mistralai/mistral-small-2603",
    choices: [{ message: { content: JSON.stringify([validOffer]) } }],
  }, "2026-09-01T18:00:00.000Z");
  assert.equal(result.offers.length, 1);
  assert.match(result.summary, /отсортированы/);
});

test("flattens marketplace groups returned by a web-search model", () => {
  const result = normalizeOpenRouterOffers({
    choices: [{ message: { content: JSON.stringify([
      { marketplace: "Ozon", offers: [{ ...validOffer, marketplace: undefined }] },
    ]) } }],
  });
  assert.equal(result.offers.length, 1);
  assert.equal(result.offers[0].marketplace, "Ozon");
});

test("adapts Mistral field names and drops category links", () => {
  const result = normalizeOpenRouterOffers({
    choices: [{ message: { content: JSON.stringify([
      {
        platform: "Ozon",
        model_match: "Kindle Paperwhite 16 GB",
        price: "18 990 ₽",
        url: "https://www.ozon.ru/product/kindle-paperwhite-123/",
        availability: "есть",
        accuracy: 0.94,
        notes: "Точное совпадение модели",
      },
      {
        platform: "Wildberries",
        model_match: "Kindle Paperwhite 32 GB",
        price: "19 480 ₽",
        url: "https://global.wildberries.ru/catalog/elektronika/elektronnye-knigi",
        availability: "есть",
        accuracy: 0.9,
        notes: "Цена найдена только в категории",
      },
    ]) } }],
  });
  assert.equal(result.offers.length, 1);
  assert.equal(result.offers[0].price, 18_990);
  assert.equal(result.offers[0].score, 94);
});

test("keeps a verified direct product page when its live price is hidden", () => {
  const result = normalizeOpenRouterOffers({
    choices: [{ message: { content: JSON.stringify([{
      platform: "Яндекс Маркет",
      model_match: "Kindle Paperwhite 2024 16 ГБ",
      price: null,
      url: "https://market.yandex.ru/product--kindle-paperwhite/123",
      availability: null,
      accuracy: 0.95,
      notes: "Прямая карточка найдена, цена в источнике не видна",
    }]) } }],
  });
  assert.equal(result.offers.length, 1);
  assert.equal(result.offers[0].price, null);
  assert.equal(result.offers[0].available, false);
});

test("accepts current Yandex Market card URLs", () => {
  const result = normalizeOpenRouterOffers(responsePayload([{
    ...validOffer,
    marketplace: "Яндекс Маркет",
    url: "https://market.yandex.ru/card/kindle-paperwhite-16-gb/123456",
  }]));
  assert.equal(result.offers.length, 1);
  assert.equal(result.offers[0].marketplaceId, "yandex-market");
});

test("calls OpenRouter without exposing the API key in the request body", async () => {
  let captured;
  const result = await fetchOpenRouterMarketplaceOffers({ title: "Kindle Paperwhite" }, {
    apiKey: "test-secret",
    now: () => new Date("2026-09-01T18:00:00.000Z"),
    fetchImpl: async (_url, options) => {
      captured = options;
      return { ok: true, json: async () => responsePayload([validOffer]) };
    },
  });
  assert.equal(captured.headers.Authorization, "Bearer test-secret");
  assert.equal(captured.body.includes("test-secret"), false);
  assert.equal(result.offers.length, 1);
});

test("uses the saved direct product as a neutral fallback when research finds nothing", async () => {
  const result = await fetchOpenRouterMarketplaceOffers({
    title: "Bobber Tumbler 350 мл",
    url: "https://ozon.ru/t/Z2qY2yP?utm_source=ohmywishes",
    price: 4_000,
    currency: "RUB",
  }, {
    apiKey: "test-secret",
    now: () => new Date("2026-09-01T18:00:00.000Z"),
    fetchImpl: async () => ({ ok: true, json: async () => responsePayload([]) }),
  });
  assert.equal(result.offers.length, 1);
  assert.equal(result.offers[0].source, true);
  assert.equal(result.offers[0].price, 4_000);
  assert.equal(result.offers[0].available, false);
  assert.match(result.summary, /сохранённую карточку/);
});

test("recognizes a saved Yandex Market short link as a concrete item", async () => {
  const result = await fetchOpenRouterMarketplaceOffers({
    title: "Shokz OpenSwim Pro Grey",
    url: "https://market.yandex.ru/cc/AGrBus",
    price: 16_000,
    currency: "RUB",
  }, {
    apiKey: "test-secret",
    fetchImpl: async () => ({ ok: true, json: async () => responsePayload([]) }),
  });
  assert.equal(result.offers.length, 1);
  assert.equal(result.offers[0].marketplaceId, "yandex-market");
  assert.equal(result.offers[0].url, "https://market.yandex.ru/cc/AGrBus");
});
