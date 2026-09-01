import { z } from "zod";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "mistralai/mistral-small-2603";
const MARKETPLACES = [
  { id: "ozon", label: "Ozon", hosts: ["ozon.ru"] },
  { id: "wildberries", label: "Wildberries", hosts: ["wildberries.ru", "global.wildberries.ru"] },
  { id: "yandex-market", label: "Яндекс Маркет", hosts: ["market.yandex.ru"] },
  { id: "megamarket", label: "Мегамаркет", hosts: ["megamarket.ru"] },
  { id: "dns", label: "DNS", hosts: ["dns-shop.ru"] },
];
const ALLOWED_DOMAINS = MARKETPLACES.flatMap((marketplace) => marketplace.hosts);

const rawOfferSchema = z.object({
  marketplace: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(300),
  price: z.coerce.number().positive().max(999_999_999).nullable(),
  currency: z.string().trim().min(1).max(8),
  url: z.string().url().max(2_000),
  seller: z.string().trim().max(160),
  delivery: z.string().trim().max(160),
  available: z.boolean(),
  score: z.coerce.number().int().min(0).max(100),
  reason: z.string().trim().min(1).max(300),
});

const rawResponseSchema = z.object({
  offers: z.array(rawOfferSchema).max(12),
  summary: z.string().trim().max(500),
});

const responseFormat = {
  type: "json_schema",
  json_schema: {
    name: "rollapp_marketplace_offers",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        offers: {
          type: "array",
          maxItems: 12,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              marketplace: { type: "string", description: "Название маркетплейса" },
              title: { type: "string", description: "Полное название найденного товара и варианта" },
              price: {
                anyOf: [{ type: "number" }, { type: "null" }],
                description: "Текущая цена без разделителей и символа валюты; null, если цена на прямой карточке не видна",
              },
              currency: { type: "string", description: "Трёхбуквенный код валюты, обычно RUB" },
              url: { type: "string", description: "Прямая HTTPS-ссылка на карточку товара" },
              seller: { type: "string", description: "Продавец, если указан; иначе пустая строка" },
              delivery: { type: "string", description: "Условия доставки, если указаны; иначе пустая строка" },
              available: { type: "boolean", description: "Есть ли явное подтверждение наличия" },
              score: { type: "integer", minimum: 0, maximum: 100, description: "Уверенность в точном совпадении товара" },
              reason: { type: "string", description: "Короткое объяснение позиции в рейтинге" },
            },
            required: ["marketplace", "title", "price", "currency", "url", "seller", "delivery", "available", "score", "reason"],
          },
        },
        summary: { type: "string", description: "Краткий итог сравнения на русском языке" },
      },
      required: ["offers", "summary"],
    },
  },
};

function marketplaceForHost(host) {
  const normalized = host.toLowerCase().replace(/^www\./, "");
  return MARKETPLACES.find((marketplace) => marketplace.hosts.some((candidate) => (
    normalized === candidate || normalized.endsWith(`.${candidate}`)
  ))) || null;
}

function directProductUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const marketplace = marketplaceForHost(url.hostname);
    if (!marketplace) return null;
    const productPage = (marketplace.id === "ozon" && (url.pathname.startsWith("/product/") || /^\/t\/[a-z0-9_-]+\/?$/i.test(url.pathname)))
      || (marketplace.id === "wildberries" && (/\/catalog\/\d+\/detail\.aspx$/i.test(url.pathname) || url.pathname.startsWith("/product/")))
      || (marketplace.id === "yandex-market" && (url.pathname.startsWith("/card/") || url.pathname.startsWith("/product--") || url.pathname.startsWith("/product/") || /^\/cc\/[a-z0-9_-]+\/?$/i.test(url.pathname)))
      || (marketplace.id === "megamarket" && (url.pathname.startsWith("/catalog/details/") || url.pathname.startsWith("/product/")))
      || (marketplace.id === "dns" && url.pathname.startsWith("/product/"));
    if (!productPage) return null;
    if (marketplace.id === "ozon") {
      const primaryProductPath = url.pathname.match(/^(\/product\/[^/]+)(?:\/reviews)?\/?$/i);
      if (primaryProductPath) url.pathname = `${primaryProductPath[1]}/`;
    }
    url.hash = "";
    return { url: url.href, marketplace };
  } catch {
    return null;
  }
}

function responseText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => typeof part === "string" ? part : part?.text || "").join("");
}

function parseJsonText(value) {
  const trimmed = String(value || "").trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(unfenced);
}

function responseEnvelope(raw) {
  const groups = Array.isArray(raw) ? raw : raw?.offers;
  if (!Array.isArray(groups)) return raw;
  const offers = groups.flatMap((entry) => {
    const nested = entry?.offers || entry?.products || entry?.items;
    if (!Array.isArray(nested)) return [entry];
    return nested.map((offer) => ({
      ...offer,
      marketplace: offer?.marketplace || entry?.marketplace,
    }));
  });
  return {
    offers,
    summary: typeof raw?.summary === "string"
      ? raw.summary
      : "Предложения найдены и отсортированы по точности, наличию и цене.",
  };
}

function numericPrice(value) {
  if (typeof value === "number") return value;
  const normalized = String(value || "").replace(/[^\d.,]/g, "").replace(",", ".");
  return normalized ? Number(normalized) : Number.NaN;
}

function citationPrice(value) {
  const match = String(value || "").match(/(\d{1,3}(?:[\s\u00a0]\d{3})+|\d+)\s*[₽Р]/i);
  if (!match) return null;
  const price = Number(match[1].replace(/[\s\u00a0]/g, ""));
  return Number.isFinite(price) && price > 0 ? price : null;
}

function annotationCandidates(payload) {
  const annotations = payload?.choices?.[0]?.message?.annotations;
  if (!Array.isArray(annotations)) return [];
  return annotations.flatMap((annotation) => {
    const citation = annotation?.url_citation;
    if (annotation?.type !== "url_citation" || !citation?.url || !citation?.title) return [];
    const title = String(citation.title)
      .replace(/^\d+\s+отзыв(?:а|ов)?\s+на\s+/i, "")
      .replace(/\s*\.{3}\s*$/, "")
      .trim();
    return [{
      marketplace: "Источник",
      title,
      price: citationPrice(`${citation.title} ${citation.content || ""}`),
      currency: "RUB",
      url: citation.url,
      seller: "",
      delivery: "",
      available: /в наличии|in stock/i.test(String(citation.content || "")),
      score: 90,
      reason: "Прямая карточка найдена адресным поиском маркетплейса.",
    }];
  });
}

function canonicalOffer(candidate) {
  const availability = candidate?.available ?? candidate?.availability;
  const accuracy = Number(candidate?.score ?? candidate?.accuracy);
  const price = numericPrice(candidate?.price);
  return {
    marketplace: candidate?.marketplace || candidate?.platform,
    title: candidate?.title || candidate?.model_match || candidate?.name,
    price: candidate?.price == null ? null : price,
    currency: candidate?.currency || "RUB",
    url: candidate?.url || candidate?.link,
    seller: candidate?.seller || "",
    delivery: candidate?.delivery || "",
    available: typeof availability === "boolean" ? availability : /есть|available|in stock/i.test(String(availability || "")),
    score: Number.isFinite(accuracy) ? (accuracy <= 1 ? Math.round(accuracy * 100) : Math.round(accuracy)) : 0,
    reason: candidate?.reason || candidate?.notes || "Совпадает с искомой моделью.",
  };
}

function savedOfferForWish(wish, checkedAt) {
  const direct = directProductUrl(wish?.url);
  if (!direct) return null;
  const savedPrice = Number(wish?.price);
  return {
    id: `source:${direct.marketplace.id}`,
    marketplaceId: direct.marketplace.id,
    marketplace: direct.marketplace.label,
    title: String(wish?.title || "Сохранённое предложение"),
    price: Number.isFinite(savedPrice) && savedPrice > 0 ? savedPrice : null,
    currency: String(wish?.currency || "RUB").toUpperCase(),
    url: direct.url,
    seller: "",
    delivery: "",
    available: false,
    score: 100,
    reason: "Сохранённая карточка товара; цену и наличие нужно проверить на сайте.",
    checkedAt,
    exact: true,
    source: true,
  };
}

export function normalizeOpenRouterOffers(payload, checkedAt = new Date().toISOString()) {
  const raw = parseJsonText(responseText(payload));
  const envelope = responseEnvelope(raw);
  const candidates = [
    ...(Array.isArray(envelope?.offers) ? envelope.offers : []),
    ...annotationCandidates(payload),
  ];
  const parsed = rawResponseSchema.parse({
    offers: candidates.map(canonicalOffer).flatMap((candidate) => {
      const result = rawOfferSchema.safeParse(candidate);
      return result.success ? [result.data] : [];
    }).slice(0, 12),
    summary: typeof envelope?.summary === "string" && envelope.summary.trim()
      ? envelope.summary
      : "Найдены прямые карточки товара и проверены на совпадение модели.",
  });
  const seenUrls = new Set();
  const offers = [];

  for (const candidate of parsed.offers) {
    const direct = directProductUrl(candidate.url);
    if (!direct || seenUrls.has(direct.url)) continue;
    seenUrls.add(direct.url);
    offers.push({
      id: `${direct.marketplace.id}:${offers.length + 1}`,
      marketplaceId: direct.marketplace.id,
      marketplace: direct.marketplace.label,
      title: candidate.title,
      price: candidate.price == null ? null : Number(candidate.price),
      currency: candidate.currency.toUpperCase() === "RUR" ? "RUB" : candidate.currency.toUpperCase(),
      url: direct.url,
      seller: candidate.seller,
      delivery: candidate.delivery,
      available: candidate.available,
      score: Number(candidate.score),
      reason: candidate.reason,
      checkedAt,
      exact: true,
    });
  }

  offers.sort((left, right) => (
    Number(right.available) - Number(left.available)
    || right.score - left.score
    || (left.price ?? Number.POSITIVE_INFINITY) - (right.price ?? Number.POSITIVE_INFINITY)
  ));

  const seenMarketplaces = new Set();
  return {
    offers: offers.filter((offer) => {
      if (seenMarketplaces.has(offer.marketplaceId)) return false;
      seenMarketplaces.add(offer.marketplaceId);
      return true;
    }).slice(0, 8),
    summary: parsed.summary,
  };
}

export function buildOpenRouterMarketplaceRequest(wish, {
  model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
  origin = process.env.PUBLIC_APP_URL || "https://rollapp.app",
  marketplaceIds = MARKETPLACES.map((marketplace) => marketplace.id),
} = {}) {
  const requestedMarketplaces = MARKETPLACES.filter((marketplace) => marketplaceIds.includes(marketplace.id));
  const marketplaces = requestedMarketplaces.length ? requestedMarketplaces : MARKETPLACES;
  const marketplaceNames = marketplaces.map((marketplace) => marketplace.label).join(", ");
  const marketplacePaths = marketplaces.map((marketplace) => {
    if (marketplace.id === "ozon") return "ozon.ru/product/ или ozon.ru/t/";
    if (marketplace.id === "wildberries") return "wildberries.ru/catalog/<id>/detail.aspx";
    if (marketplace.id === "yandex-market") return "market.yandex.ru/card/ или market.yandex.ru/product--";
    if (marketplace.id === "megamarket") return "megamarket.ru/catalog/details/";
    return "dns-shop.ru/product/";
  }).join(", ");
  const product = {
    title: String(wish?.title || "").trim(),
    description: String(wish?.description || "").trim().slice(0, 1_000),
    sourceUrl: String(wish?.url || "").trim(),
    savedPrice: wish?.price == null ? null : Number(wish.price),
    savedCurrency: String(wish?.currency || "RUB"),
  };
  return {
    url: OPENROUTER_URL,
    model,
    headers: {
      "Content-Type": "application/json",
      "HTTP-Referer": origin,
      "X-Title": "Rollapp",
    },
    body: {
      model,
      messages: [
        {
          role: "system",
          content: `Ты исследователь товарных предложений для России. Ищи только точное совпадение модели и варианта товара на площадках: ${marketplaceNames}. Не придумывай цены, наличие, продавцов или ссылки. Добавляй только прямые карточки товара; если карточка найдена, но цена в источнике не видна, укажи price=null. Выполняй адресные site-поиски по шаблонам прямых карточек: ${marketplacePaths}. Не возвращай /search, страницы категорий, подборки, обзоры и рекламные статьи. Сначала оцени точность модели, затем наличие, цену и надёжность продавца. Ответ дай на русском языке по JSON-схеме.`,
        },
        {
          role: "user",
          content: `Найди актуальные прямые карточки товара на площадках: ${marketplaceNames}. Не более двух карточек с одной площадки. Данные товара: ${JSON.stringify(product)}`,
        },
      ],
      tools: [{
        type: "openrouter:web_search",
        parameters: {
          engine: marketplaces.length === 1 && marketplaces[0].id === "ozon" ? "parallel" : "exa",
          mode: "fast",
          max_results: 10,
          max_total_results: 30,
          max_uses: 6,
          search_context_size: "medium",
          allowed_domains: marketplaces.flatMap((marketplace) => marketplace.hosts),
          user_location: { country: "RU" },
        },
      }],
      response_format: responseFormat,
      provider: { require_parameters: true },
      temperature: 0.1,
      max_tokens: 2_000,
    },
  };
}

export class OpenRouterOffersError extends Error {
  constructor(message, { status = 502, code = "openrouter_offers_failed", cause } = {}) {
    super(message, { cause });
    this.name = "OpenRouterOffersError";
    this.status = status;
    this.code = code;
  }
}

export async function fetchOpenRouterMarketplaceOffers(wish, {
  apiKey = process.env.OPENROUTER_API_KEY,
  fetchImpl = fetch,
  signal,
  model,
  now = () => new Date(),
  allowEmpty = false,
  marketplaceIds,
} = {}) {
  if (!apiKey) {
    throw new OpenRouterOffersError("OpenRouter пока не настроен", {
      status: 503,
      code: "openrouter_not_configured",
    });
  }
  const request = buildOpenRouterMarketplaceRequest(wish, { model, marketplaceIds });
  let response;
  try {
    response = await fetchImpl(request.url, {
      method: "POST",
      headers: { ...request.headers, Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(request.body),
      signal,
    });
  } catch (cause) {
    throw new OpenRouterOffersError("Не удалось связаться с OpenRouter", { cause });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const upstreamMessage = String(payload?.error?.message || "").toLowerCase();
    const authFailed = response.status === 401;
    const providerRestricted = response.status === 403 && /terms of service|prohibited|restricted/.test(upstreamMessage);
    const creditsMissing = /credit|balance|quota/.test(upstreamMessage);
    throw new OpenRouterOffersError(
      authFailed
        ? "OpenRouter отклонил API-ключ"
        : providerRestricted
          ? "Выбранная модель недоступна для региона запроса"
          : creditsMissing
            ? "На балансе OpenRouter недостаточно средств"
            : "OpenRouter не смог выполнить поиск",
      {
        status: authFailed || providerRestricted ? 503 : response.status === 429 ? 429 : 502,
        code: authFailed
          ? "openrouter_auth_failed"
          : providerRestricted
            ? "openrouter_provider_restricted"
            : creditsMissing
              ? "openrouter_credits_missing"
              : "openrouter_request_failed",
      },
    );
  }
  let normalized;
  const checkedAt = now().toISOString();
  try {
    normalized = normalizeOpenRouterOffers(payload, checkedAt);
  } catch (cause) {
    throw new OpenRouterOffersError("OpenRouter вернул неполный список предложений", {
      code: "openrouter_invalid_response",
      cause,
    });
  }
  const liveOffers = normalized.offers;
  const savedOffer = savedOfferForWish(wish, checkedAt);
  const offers = [...liveOffers];
  if (savedOffer && !offers.some((offer) => offer.url === savedOffer.url)) offers.push(savedOffer);
  if (!offers.length && !allowEmpty) {
    throw new OpenRouterOffersError("Не удалось найти предложения с подтверждённой ценой и прямой ссылкой", {
      status: 422,
      code: "marketplace_offers_not_found",
    });
  }
  return {
    ...normalized,
    offers,
    summary: liveOffers.length
      ? normalized.summary
      : "Новых проверенных предложений не найдено. Показываем сохранённую карточку товара.",
    model: payload.model || request.model,
    usage: payload.usage || null,
  };
}
