import { productScore } from "../../shared/product-match.js";
import { isVehicleMarketplaceId, vehicleOfferMatchesWish } from "../../shared/vehicle-match.js";

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
  { id: "samokat", label: "Самокат", mark: "С", hosts: ["samokat.ru"] },
  { id: "lavka", label: "Яндекс Лавка", mark: "Я", hosts: ["lavka.yandex.ru"] },
  { id: "lenta", label: "Лента", mark: "Л", hosts: ["lenta.com"] },
  { id: "vkusvill", label: "ВкусВилл", mark: "ВВ", hosts: ["vkusvill.ru"] },
  { id: "auto-ru", label: "Auto.ru", mark: "A", hosts: ["auto.ru"] },
  { id: "avito-auto", label: "Авито Авто", mark: "A", hosts: ["avito.ru"] },
  { id: "drom", label: "Drom", mark: "D", hosts: ["drom.ru"] },
];

const FOOD_MARKETPLACE_IDS = new Set(["samokat", "lavka", "lenta", "vkusvill"]);

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
  if ((host === "avito.ru" || host.endsWith(".avito.ru"))) {
    try {
      if (new URL(String(value)).pathname.includes("/avtomobili/")) {
        return SOURCE_MARKETPLACES.find((marketplace) => marketplace.id === "avito-auto") || null;
      }
    } catch {
      return null;
    }
  }
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
  if (offer?.source) return true;
  if (wish?.space === "transport") return vehicleOfferMatchesWish(wish, offer);
  if (isVehicleMarketplaceId(offer?.marketplaceId)) return false;
  const foodWish = wish?.space === "food";
  if (foodWish !== FOOD_MARKETPLACE_IDS.has(offer?.marketplaceId)) return false;
  return productScore(wish?.title, offer?.title) >= 70;
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
    Number(Boolean(right.source)) - Number(Boolean(left.source))
    || Number(right.available) - Number(left.available)
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
  return selected.sort(compare);
}
