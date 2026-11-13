import { XMLParser, XMLValidator } from "fast-xml-parser";
import { marketplaceProductQuery, marketplaceProductScore } from "../shared/product-match.js";
import { buildOpenRouterMarketplaceRequest, directProductUrl } from "./openrouter-marketplace-offers.js";
import { canonicalCatalogUrl } from "./wish-catalog.js";
import { loadYandexAiToken, yandexAiConfig, YandexAiError } from "./yandex-ai.js";

const SEARCH_URL = "https://searchapi.api.cloud.yandex.net/v2/web/search";
const parser = new XMLParser({
  parseTagValue: false,
  ignoreAttributes: false,
  isArray: (name, path) => [
    "yandexsearch.response.results.grouping.group",
    "yandexsearch.response.results.grouping.group.doc",
  ].includes(path),
});

function indexedCards(xml, wish, marketplaceIds, checkedAt) {
  const invalidResponse = () => new YandexAiError("Поисковый индекс вернул неполный ответ.", { code: "yandex_search_invalid_response" });
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw invalidResponse();
  const response = parser.parse(xml.replace(/<\/?hlword>/g, "")).yandexsearch?.response;
  if (!response) throw invalidResponse();
  if (response.error != null) {
    // Search API reports "no matches" as XML error 15.
    if (response.error["@_code"] === "15") return [];
    throw invalidResponse();
  }
  const groups = response.results?.grouping?.group;
  if (groups != null && !Array.isArray(groups)) throw invalidResponse();
  const sourceKey = canonicalCatalogUrl(wish.url);
  return (groups || []).flatMap(group => Array.isArray(group.doc) ? group.doc : []).flatMap((doc, index) => {
    const direct = directProductUrl(doc.url, marketplaceIds);
    const title = typeof doc.title === "string" ? doc.title.split(/\s+[—–]\s+купить/iu, 1)[0].slice(0, 300) : "";
    const score = marketplaceProductScore(wish, title);
    if (!direct || score < 70 || canonicalCatalogUrl(direct.url) === sourceKey) return [];
    return [{
      id: `index:${direct.marketplace.id}:${index}`,
      marketplaceId: direct.marketplace.id,
      marketplace: direct.marketplace.label,
      title,
      price: null,
      currency: wish.currency || "RUB",
      url: direct.url,
      seller: "",
      delivery: "",
      available: false,
      score,
      reason: "Карточка найдена в поисковом индексе. Цену и наличие можно проверить в магазине.",
      checkedAt,
      exact: true,
    }];
  });
}

export async function fetchIndexedMarketplaceOffers(wish, {
  env = process.env, signal, marketplaceIds, fetchImpl = fetch,
  tokenLoader = loadYandexAiToken, now = () => new Date(),
} = {}) {
  const config = yandexAiConfig(env);
  if (!config.enabled || wish?.space !== "products") return [];
  const title = marketplaceProductQuery(wish.title).replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 280);
  if (!title) return [];
  const { body } = buildOpenRouterMarketplaceRequest(wish, { marketplaceIds });
  const domains = body.tools[0].parameters.allowed_domains.map(domain => `site:${domain}`).join(" | ");
  const timeout = AbortSignal.timeout(12_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  requestSignal.throwIfAborted();
  const token = await tokenLoader(env);
  requestSignal.throwIfAborted();
  const response = await fetchImpl(SEARCH_URL, {
    method: "POST",
    redirect: "error",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: { searchType: "SEARCH_TYPE_RU", queryText: `${title} (${domains})` },
      groupSpec: { groupMode: "GROUP_MODE_DEEP", groupsOnPage: "10", docsInGroup: "3" },
      region: "225",
      folderId: config.folderId,
      responseFormat: "FORMAT_XML",
    }),
    signal: requestSignal,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new YandexAiError("Поисковый индекс временно недоступен.", {
      code: response.status === 429 ? "yandex_search_rate_limited" : "yandex_search_unavailable",
    });
  }
  const payload = await response.json();
  if (typeof payload.rawData !== "string" || payload.rawData.length > 1_000_000) {
    throw new YandexAiError("Поисковый индекс вернул неполный ответ.", { code: "yandex_search_invalid_response" });
  }
  return indexedCards(Buffer.from(payload.rawData, "base64").toString("utf8"), wish, marketplaceIds, now().toISOString());
}
