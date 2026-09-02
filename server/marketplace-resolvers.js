import { productScore } from "../shared/product-match.js";
import { vehicleOfferMatchesWish } from "../shared/vehicle-match.js";

const WILDBERRIES_SEARCH_URL = "https://search.wb.ru/exactmatch/ru/common/v18/search";
const YANDEX_MARKET_SEARCH_URL = "https://market.yandex.ru/search";
const SOURCE_MARKETPLACES = [
  { id: "ozon", label: "Ozon", hosts: ["ozon.ru"] },
  { id: "wildberries", label: "Wildberries", hosts: ["wildberries.ru", "global.wildberries.ru"] },
  { id: "yandex-market", label: "Яндекс Маркет", hosts: ["market.yandex.ru"] },
  { id: "tbank", label: "Т-Банк", hosts: ["tbank.ru"] },
  { id: "megamarket", label: "Мегамаркет", hosts: ["megamarket.ru"] },
  { id: "dns", label: "DNS", hosts: ["dns-shop.ru"] },
  { id: "mvideo", label: "М.Видео", hosts: ["mvideo.ru"] },
  { id: "aliexpress", label: "AliExpress", hosts: ["aliexpress.ru", "aliexpress.com"] },
  { id: "avito", label: "Авито", hosts: ["avito.ru"] },
  { id: "auto-ru", label: "Auto.ru", hosts: ["auto.ru"] },
  { id: "avito-auto", label: "Авито Авто", hosts: ["avito.ru"] },
  { id: "drom", label: "Drom", hosts: ["drom.ru"] },
  { id: "samokat", label: "Самокат", hosts: ["samokat.ru"] },
  { id: "lavka", label: "Яндекс Лавка", hosts: ["lavka.yandex.ru"] },
  { id: "lenta", label: "Лента", hosts: ["lenta.com"] },
  { id: "vkusvill", label: "ВкусВилл", hosts: ["vkusvill.ru"] },
];
export { productScore } from "../shared/product-match.js";

function safeSourceUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function sourceMarketplace(url) {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "avito.ru" || host.endsWith(".avito.ru")) {
    return url.pathname.includes("/avtomobili/")
      ? SOURCE_MARKETPLACES.find((marketplace) => marketplace.id === "avito-auto")
      : SOURCE_MARKETPLACES.find((marketplace) => marketplace.id === "avito");
  }
  return SOURCE_MARKETPLACES.find((marketplace) => marketplace.hosts.some((candidate) => (
    host === candidate || host.endsWith(`.${candidate}`)
  ))) || {
    id: "source",
    label: host,
  };
}

export function sourceOfferForWish(wish, checkedAt = new Date().toISOString()) {
  const url = safeSourceUrl(wish?.url);
  if (!url) return null;
  const marketplace = sourceMarketplace(url);
  const price = Number(wish?.price);
  return {
    id: `source:${marketplace.id}`,
    marketplaceId: marketplace.id,
    marketplace: marketplace.label,
    title: String(wish?.title || "Сохранённая карточка товара"),
    price: Number.isFinite(price) && price > 0 ? price : null,
    currency: String(wish?.currency || "RUB").toUpperCase(),
    url: url.href,
    seller: "",
    delivery: "",
    available: false,
    score: 100,
    reason: "Исходная карточка товара, которую указал пользователь.",
    checkedAt,
    exact: true,
    source: true,
    resolved: true,
  };
}

function productPrice(product) {
  const prices = (product?.sizes || [])
    .map((size) => Number(size?.price?.product || size?.price?.basic) / 100)
    .filter((price) => Number.isFinite(price) && price > 0);
  return prices.length ? Math.min(...prices) : null;
}

function priceIsPlausible(wish, price) {
  const savedPrice = Number(wish?.price);
  if (!Number.isFinite(savedPrice) || savedPrice <= 0 || price == null) return true;
  return price >= savedPrice * 0.15 && price <= savedPrice * 5;
}

export function normalizeWildberriesOffers(payload, wish, checkedAt = new Date().toISOString()) {
  return (Array.isArray(payload?.products) ? payload.products : [])
    .map((product) => ({ product, score: productScore(wish?.title, product?.name) }))
    .filter(({ product, score }) => (
      Number.isInteger(product?.id)
      && score >= 70
      && priceIsPlausible(wish, productPrice(product))
    ))
    .sort((left, right) => right.score - left.score || productPrice(left.product) - productPrice(right.product))
    .slice(0, 1)
    .map(({ product, score }) => ({
      id: `wildberries:${product.id}`,
      marketplaceId: "wildberries",
      marketplace: "Wildberries",
      title: String(product.name || wish?.title || "Товар Wildberries"),
      price: productPrice(product),
      currency: "RUB",
      url: `https://www.wildberries.ru/catalog/${product.id}/detail.aspx`,
      seller: String(product.supplier || ""),
      delivery: "",
      available: Number(product.totalQuantity) > 0,
      score,
      reason: "Конкретная карточка из актуальной выдачи Wildberries.",
      checkedAt,
      exact: true,
      resolved: true,
    }));
}

function yandexMarketProducts(html) {
  const products = [];
  const scripts = String(html || "").matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    try {
      const structured = JSON.parse(match[1]);
      const entries = structured?.["@type"] === "ItemList" ? structured.itemListElement : [];
      for (const entry of Array.isArray(entries) ? entries : []) {
        const item = entry?.item;
        if (item?.["@type"] === "Product") products.push(item);
      }
    } catch {
      // Ignore unrelated or malformed JSON-LD blocks.
    }
  }
  return products;
}

function yandexMarketUrl(value) {
  try {
    const url = new URL(String(value || ""), "https://market.yandex.ru");
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:" || host !== "market.yandex.ru" || !url.pathname.startsWith("/card/")) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

export function normalizeYandexMarketOffers(html, wish, checkedAt = new Date().toISOString()) {
  return yandexMarketProducts(html)
    .map((product) => ({
      product,
      url: yandexMarketUrl(product?.offers?.url || product?.url || product?.["@id"]),
      score: productScore(wish?.title, product?.name),
    }))
    .filter(({ product, url, score }) => (
      url
      && score >= 70
      && priceIsPlausible(wish, Number(product?.offers?.price) || null)
    ))
    .sort((left, right) => (
      right.score - left.score
      || Number(left.product?.offers?.price || Number.POSITIVE_INFINITY) - Number(right.product?.offers?.price || Number.POSITIVE_INFINITY)
    ))
    .slice(0, 1)
    .map(({ product, url, score }, index) => {
      const price = Number(product?.offers?.price);
      return {
        id: `yandex-market:${product?.sku || index + 1}`,
        marketplaceId: "yandex-market",
        marketplace: "Яндекс Маркет",
        title: String(product?.name || wish?.title || "Товар Яндекс Маркета"),
        price: Number.isFinite(price) && price > 0 ? price : null,
        currency: String(product?.offers?.priceCurrency || "RUB").toUpperCase(),
        url,
        seller: "",
        delivery: "",
        available: /InStock$/i.test(String(product?.offers?.availability || "")),
        score,
        reason: "Конкретная карточка из актуальной выдачи Яндекс Маркета.",
        checkedAt,
        exact: true,
        resolved: true,
      };
    });
}

async function fetchWildberriesOffers(wish, { fetchImpl, signal, checkedAt }) {
  const url = new URL(WILDBERRIES_SEARCH_URL);
  url.search = new URLSearchParams({
    ab_testing: "false",
    appType: "1",
    curr: "rub",
    dest: "-1257786",
    query: wish.title,
    resultset: "catalog",
    spp: "30",
    suppressSpellcheck: "false",
  }).toString();
  const response = await fetchImpl(url, {
    headers: { Accept: "application/json", "User-Agent": "Rollapp marketplace resolver/1.0" },
    signal,
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => ({}));
  return normalizeWildberriesOffers(payload, wish, checkedAt);
}

async function fetchYandexMarketOffers(wish, { fetchImpl, signal, checkedAt }) {
  const url = new URL(YANDEX_MARKET_SEARCH_URL);
  url.searchParams.set("text", wish.title);
  const response = await fetchImpl(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ru-RU,ru;q=0.9",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
    },
    signal,
  });
  if (!response.ok) return [];
  return normalizeYandexMarketOffers(await response.text(), wish, checkedAt);
}

export async function fetchMarketplaceResolvedOffers(wish, {
  fetchImpl = fetch,
  signal,
  now = () => new Date(),
} = {}) {
  const query = String(wish?.title || "").trim();
  const checkedAt = now().toISOString();
  const source = sourceOfferForWish(wish, checkedAt);
  if (!query) return source ? [source] : [];
  if (["food", "transport"].includes(wish?.space)) return source ? [source] : [];
  const results = await Promise.allSettled([
    fetchWildberriesOffers({ ...wish, title: query }, { fetchImpl, signal, checkedAt }),
    fetchYandexMarketOffers({ ...wish, title: query }, { fetchImpl, signal, checkedAt }),
  ]);
  return mergeDirectOffers(
    ...results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []),
    source ? [source] : [],
  );
}

export function filterDirectOffersForWish(wish, offers) {
  if (wish?.space === "transport") {
    return (Array.isArray(offers) ? offers : []).filter((offer) => vehicleOfferMatchesWish(wish, offer));
  }
  return (Array.isArray(offers) ? offers : []).filter((offer) => (
    offer?.source || (
      productScore(wish?.title, offer?.title) >= 70
      && priceIsPlausible(wish, offer?.price)
    )
  ));
}

export function mergeDirectOffers(...collections) {
  const seen = new Set();
  const unique = collections.flat().filter((offer) => {
    if (!offer?.url || seen.has(offer.url)) return false;
    seen.add(offer.url);
    return true;
  });
  const compare = (left, right) => (
    Number(Boolean(right.source)) - Number(Boolean(left.source))
    || Number(right.available) - Number(left.available)
    || Number(right.score || 0) - Number(left.score || 0)
    || (left.price ?? Number.POSITIVE_INFINITY) - (right.price ?? Number.POSITIVE_INFINITY)
  );
  const serviceKey = (offer) => {
    if (offer?.marketplaceId) return offer.marketplaceId;
    try {
      return new URL(offer.url).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return String(offer?.marketplace || "source").toLowerCase();
    }
  };
  const bestByService = new Map();
  for (const offer of unique) {
    const key = serviceKey(offer);
    const current = bestByService.get(key);
    if (!current || (offer.source && !current.source) || (Boolean(offer.source) === Boolean(current.source) && compare(offer, current) < 0)) {
      bestByService.set(key, offer);
    }
  }
  return [...bestByService.values()].sort(compare).slice(0, 8);
}
