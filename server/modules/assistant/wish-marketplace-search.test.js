import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { findWishMarketplaceOffers } from "./wish-marketplace-search.js";

const wish = { title: "Ulanzi L024", space: "products" };
const offer = {
  title: "Ulanzi L024",
  marketplaceId: "ozon",
  url: "https://www.ozon.ru/product/12345/",
};
const credential = { provider: "openrouter", apiKey: "test" };

test("direct search results survive an AI timeout and are returned for the saved snapshot", async () => {
  const previews = [];
  const signal = new AbortController().signal;
  const { result, aiSearch, resolvedOffers } = await findWishMarketplaceOffers(wish, {
    credential,
    marketplaceIds: ["ozon"],
    signal,
    aiTimeoutMs: 10,
    aiSearch: async (_wish, _credential, { signal: providerSignal }) => {
      await delay(1_000, null, { signal: providerSignal });
      assert.fail("The AI request should have been cancelled");
    },
    searchCatalogs: async (_wish, options) => {
      assert.equal(options.signal, signal);
      return [];
    },
    searchIndex: async (_wish, options) => {
      assert.equal(options.signal, signal);
      return [offer];
    },
    onPreview: (offers) => previews.push(offers),
    onIndexError: assert.fail,
  });

  assert.equal(signal.aborted, false);
  assert.equal(aiSearch.status, "rejected");
  assert.equal(aiSearch.reason.code, "marketplace_ai_timeout");
  assert.deepEqual(previews, [[offer]]);
  assert.deepEqual(resolvedOffers, [offer]);
  assert.deepEqual(result.offers, [offer]);
});

test("closing the request still cancels the search after it previews a usable offer", async () => {
  const controller = new AbortController();
  const reason = new Error("Request closed");
  await assert.rejects(findWishMarketplaceOffers(wish, {
    credential,
    marketplaceIds: ["ozon"],
    signal: controller.signal,
    aiSearch: async (_wish, _credential, { signal }) => {
      await delay(1_000, null, { signal });
      assert.fail("The AI request should have been cancelled");
    },
    searchCatalogs: async () => [offer],
    searchIndex: assert.fail,
    onPreview: () => controller.abort(reason),
    onIndexError: assert.fail,
  }), (error) => error === reason);
});
