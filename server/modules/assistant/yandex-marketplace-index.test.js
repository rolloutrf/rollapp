import assert from "node:assert/strict";
import test from "node:test";
import { fetchIndexedMarketplaceOffers } from "./yandex-marketplace-index.js";

const wish = {
  title: "Осветитель Ulanzi L024 40W RGB / Светодиодный осветитель / Видеосвет для съемки контента",
  space: "products",
};
const matchingUrl = "https://market.yandex.ru/card/ulanzi-l024/123";
const xml = `<yandexsearch><response><results><grouping><group>
  <doc><url>https://market.yandex.ru/search?text=ulanzi</url><title>Осветитель Ulanzi L024 40W RGB</title></doc>
  <doc><url>${matchingUrl}</url><title>Осветитель <hlword>Ulanzi</hlword> <hlword>L</hlword><hlword>024</hlword> 40W RGB — купить в магазине</title></doc>
  <doc><url>https://market.yandex.ru/card/ulanzi-l023/456</url><title>Осветитель Ulanzi L023 40W RGB</title></doc>
  <doc><url>https://market.yandex.ru/card/ulanzi-accessory/789</url><title>Адаптер Ulanzi L024 40W RGB</title></doc>
  <doc><url>https://example.org/product/123</url><title>Осветитель Ulanzi L024 40W RGB</title></doc>
</group></grouping></results></response></yandexsearch>`;
const responseFor = text => Response.json({ rawData: Buffer.from(text).toString("base64") });
const options = {
  env: { YC_FOLDER_ID: "folder", YANDEX_AI_MODEL: "aliceai-llm-flash" },
  tokenLoader: async () => "test-token",
  marketplaceIds: ["yandex-market"],
};

test("searches a shortened model title and returns relevant direct cards without invented stock or price", async () => {
  const offers = await fetchIndexedMarketplaceOffers(wish, {
    ...options,
    fetchImpl: async (url, request) => {
      assert.equal(url, "https://searchapi.api.cloud.yandex.net/v2/web/search");
      assert.equal(request.redirect, "error");
      assert.equal(request.headers.Authorization, "Bearer test-token");
      const { query, folderId } = JSON.parse(request.body);
      assert.equal(folderId, "folder");
      assert.equal(query.queryText, "Осветитель Ulanzi L024 40W RGB (site:market.yandex.ru)");
      return responseFor(xml);
    },
  });
  assert.deepEqual(offers.map(({ url, title, price, available }) => ({ url, title, price, available })), [
    { url: matchingUrl, title: "Осветитель Ulanzi L024 40W RGB", price: null, available: false },
  ]);
});

test("distinguishes no matches from upstream errors and honors cancellation", async () => {
  assert.deepEqual(await fetchIndexedMarketplaceOffers(wish, {
    ...options, fetchImpl: async () => responseFor('<yandexsearch><response><error code="15">No results</error></response></yandexsearch>'),
  }), []);
  await assert.rejects(fetchIndexedMarketplaceOffers(wish, {
    ...options, fetchImpl: async () => new Response(null, { status: 429 }),
  }), { code: "yandex_search_rate_limited" });
  await assert.rejects(fetchIndexedMarketplaceOffers(wish, {
    ...options, fetchImpl: async () => responseFor("<!DOCTYPE yandexsearch><yandexsearch/>"),
  }), { code: "yandex_search_invalid_response" });
  await assert.rejects(fetchIndexedMarketplaceOffers(wish, {
    ...options, signal: AbortSignal.abort(), tokenLoader: async () => assert.fail("Cancelled before authentication"),
  }), { name: "AbortError" });
});
