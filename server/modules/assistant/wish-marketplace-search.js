import { hasAiCredential } from "../../ai-provider.js";
import {
  fetchMarketplaceResolvedOffers, filterDirectOffersForWish, mergeDirectOffers, sourceOfferForWish,
} from "./marketplace-resolvers.js";
import { OpenRouterOffersError } from "./openrouter-marketplace-offers.js";
import { fetchIndexedMarketplaceOffers } from "./yandex-marketplace-index.js";
import { fetchMarketplaceAiOffers } from "./yandex-marketplace-offers.js";

const AI_SEARCH_TIMEOUT_MS = 60_000;
const EMPTY_AI_RESULT = { offers: [], summary: "", model: "", usage: null };

export async function findWishMarketplaceOffers(wish, {
  credential, marketplaceIds, signal, onPreview, onIndexError,
  aiSearch: searchWithAi = fetchMarketplaceAiOffers,
  searchCatalogs = fetchMarketplaceResolvedOffers,
  searchIndex = fetchIndexedMarketplaceOffers,
  aiTimeoutMs = AI_SEARCH_TIMEOUT_MS,
}) {
  const search = { marketplaceIds, signal };
  let sentPreview = false;
  function showOffers(offers) {
    if (sentPreview || signal.aborted || !offers.some((offer) => !offer.source)) return;
    sentPreview = true;
    onPreview(offers);
  }

  async function searchAi() {
    if (!hasAiCredential(credential)) return EMPTY_AI_RESULT;
    // Leave time to finish catalog lookup and save usable offers when the model stalls.
    const deadline = AbortSignal.timeout(aiTimeoutMs);
    const aiSignal = AbortSignal.any([signal, deadline]);
    try {
      const result = await searchWithAi(wish, credential, { ...search, signal: aiSignal });
      aiSignal.throwIfAborted();
      const offers = filterDirectOffersForWish(wish, result.offers);
      showOffers(mergeDirectOffers(offers, [sourceOfferForWish(wish)]));
      return { ...result, offers };
    } catch (error) {
      signal.throwIfAborted();
      if (deadline.aborted) {
        throw new OpenRouterOffersError("Нейропоиск не ответил вовремя", { status: 504, code: "marketplace_ai_timeout" });
      }
      throw error;
    }
  }

  async function searchDirect() {
    const offers = await searchCatalogs(wish, search);
    if (offers.some((offer) => !offer.source) || sentPreview || signal.aborted) {
      showOffers(offers);
      return offers;
    }
    try {
      const indexed = await searchIndex(wish, search);
      const results = mergeDirectOffers(offers, indexed);
      showOffers(results);
      return results;
    } catch (error) {
      if (!signal.aborted) onIndexError(error);
      return offers;
    }
  }

  const [aiSearch, marketplaceSearch] = await Promise.allSettled([searchAi(), searchDirect()]);
  signal.throwIfAborted();
  const aiResult = aiSearch.status === "fulfilled" ? aiSearch.value : EMPTY_AI_RESULT;
  const resolvedOffers = marketplaceSearch.status === "fulfilled" ? marketplaceSearch.value : [];
  return {
    result: { ...aiResult, offers: mergeDirectOffers(resolvedOffers, aiResult.offers) },
    aiSearch,
    resolvedOffers,
  };
}
