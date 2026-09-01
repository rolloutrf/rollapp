import { productScore } from "../../shared/product-match.js";

const MARKETPLACES = [
  {
    id: "ozon",
    label: "Ozon",
    mark: "O",
    hosts: ["ozon.ru"],
  },
  {
    id: "wildberries",
    label: "Wildberries",
    mark: "WB",
    hosts: ["wildberries.ru", "global.wildberries.ru"],
  },
  {
    id: "yandex-market",
    label: "Яндекс Маркет",
    mark: "Я",
    hosts: ["market.yandex.ru"],
  },
  {
    id: "megamarket",
    label: "Мегамаркет",
    mark: "М",
    hosts: ["megamarket.ru"],
  },
  {
    id: "dns",
    label: "DNS",
    mark: "DNS",
    hosts: ["dns-shop.ru"],
  },
];

const SOURCE_MARKETPLACES = [
  ...MARKETPLACES,
  { id: "amazon", label: "Amazon", mark: "A", hosts: ["amazon.com", "amazon.de", "amazon.co.uk"] },
  { id: "aliexpress", label: "AliExpress", mark: "A", hosts: ["aliexpress.ru", "aliexpress.com"] },
  { id: "avito", label: "Авито", mark: "А", hosts: ["avito.ru"] },
  { id: "mvideo", label: "М.Видео", mark: "М", hosts: ["mvideo.ru"] },
];

function normalizedHost(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.hostname.toLowerCase().replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

function matchesHost(host, candidate) {
  return host === candidate || host.endsWith(`.${candidate}`);
}

export function marketplaceForUrl(value) {
  const host = normalizedHost(value);
  if (!host) return null;
  return SOURCE_MARKETPLACES.find((marketplace) => (
    marketplace.hosts.some((candidate) => matchesHost(host, candidate))
  )) || null;
}

export function marketplaceSearchQuery(title) {
  return String(title || "").replace(/\s+/g, " ").trim().slice(0, 160);
}

export function marketplaceOffersForWish(wish) {
  const query = marketplaceSearchQuery(wish?.title);
  if (!query) return [];

  const sourceMarketplace = marketplaceForUrl(wish?.url);
  const sourceHost = normalizedHost(wish?.url);
  const offers = [];

  if (sourceHost) {
    offers.push({
      id: "source",
      marketplaceId: sourceMarketplace?.id || "source",
      marketplace: sourceMarketplace?.label || sourceHost,
      mark: sourceMarketplace?.mark || sourceHost.slice(0, 1).toUpperCase(),
      title: wish.title,
      url: wish.url,
      price: wish.price ?? null,
      currency: wish.currency || "RUB",
      exact: true,
      source: true,
    });
  }

  return offers;
}

export function marketplaceOfferMatchesWish(wish, offer) {
  return Boolean(offer?.source) || productScore(wish?.title, offer?.title) >= 70;
}

export function mergeMarketplaceOffers(snapshotOffers, savedOffers) {
  const merged = (Array.isArray(snapshotOffers) ? snapshotOffers : []).map((offer) => ({ ...offer }));
  const indexes = new Map(merged.map((offer, index) => [offer?.url, index]).filter(([url]) => url));

  for (const saved of Array.isArray(savedOffers) ? savedOffers : []) {
    if (!saved?.url) continue;
    const source = { ...saved, source: true };
    const existingIndex = indexes.get(source.url);
    if (existingIndex == null) {
      indexes.set(source.url, merged.length);
      merged.push(source);
      continue;
    }
    merged[existingIndex] = {
      ...source,
      ...merged[existingIndex],
      source: true,
    };
  }

  const serviceKey = (offer) => {
    if (offer?.marketplaceId) return offer.marketplaceId;
    try {
      return new URL(offer.url).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return String(offer?.marketplace || "source").toLowerCase();
    }
  };
  const compare = (left, right) => (
    Number(right.available) - Number(left.available)
    || Number(right.score || 0) - Number(left.score || 0)
    || (left.price ?? Number.POSITIVE_INFINITY) - (right.price ?? Number.POSITIVE_INFINITY)
  );
  const selected = [];
  const serviceIndexes = new Map();
  for (const offer of merged) {
    const key = serviceKey(offer);
    const currentIndex = serviceIndexes.get(key);
    if (currentIndex == null) {
      serviceIndexes.set(key, selected.length);
      selected.push(offer);
      continue;
    }
    const current = selected[currentIndex];
    if ((offer.source && !current.source) || (Boolean(offer.source) === Boolean(current.source) && compare(offer, current) < 0)) {
      selected[currentIndex] = offer;
    }
  }
  return selected;
}
