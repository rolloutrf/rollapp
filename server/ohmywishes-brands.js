import { externalCatalogItemId } from "./wish-catalog.js";
import { OHMYWISHES_API_BASE, OHMYWISHES_SOURCE } from "./ohmywishes-catalog.js";

// Cache public provider responses, independently of the production wishlist database.
const responses = new Map();
const ttl = 5 * 60_000;

async function publicJson(path) {
  const cached = responses.get(path);
  if (cached?.expires > Date.now()) return cached.promise;
  const promise = (async () => {
    const response = await fetch(`${OHMYWISHES_API_BASE}${path}`, {
      headers: { Accept: "application/json", "Accept-Language": "ru", "X-Content-Region": "RU", "x-no-auth": "true" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("Каталог брендов временно недоступен. Попробуйте ещё раз.");
    return response.json();
  })();
  if (responses.size >= 200) responses.delete(responses.keys().next().value);
  const entry = { promise, expires: Date.now() + ttl };
  responses.set(path, entry);
  try { return await promise; } catch (error) {
    if (responses.get(path) === entry) responses.delete(path);
    throw error;
  }
}

function imageUrl(photo) {
  const image = photo?.image || photo;
  return image?.thumbnails?.find((item) => item.width >= 400)?.url || image?.url || "";
}

export async function getOhMyWishesBrands() {
  const data = await publicJson("/selections");
  if (!Array.isArray(data?.item?.brands)) throw new Error("Не удалось загрузить бренды.");
  return data.item.brands.filter((brand) => brand.accountType === "brand" && brand.id && brand.username).map((brand) => ({
    id: brand.id,
    slug: brand.username,
    label: brand.fullname || brand.username,
    logoUrl: imageUrl(brand.avatar),
    previews: (brand.ideas || []).slice(0, 2).map((idea) => ({ id: idea.id, title: idea.title, imageUrl: imageUrl(idea.photos?.[0]) })),
  }));
}

export function ohMyWishesBrandItem(idea, brand) {
  return {
    id: externalCatalogItemId(OHMYWISHES_SOURCE.id, idea.id),
    title: idea.title,
    description: idea.description || "",
    url: `https://ohmywishes.com/users/${encodeURIComponent(brand.slug)}/ideas/${encodeURIComponent(idea.id)}`,
    imageUrl: imageUrl(idea.photos?.[0]),
    price: idea.price?.price == null ? null : Number(idea.price.price),
    currency: idea.price?.currency || "RUB",
    space: "products",
    owners: [], ownerCount: 0, wishCount: 0,
    source: OHMYWISHES_SOURCE,
    brand,
  };
}

export function ohMyWishesRecommendationItem(idea) {
  return {
    id: externalCatalogItemId(OHMYWISHES_SOURCE.id, idea.id),
    title: idea.title,
    description: idea.description || "",
    url: `https://ohmywishes.com/selections/for-you/ideas/${encodeURIComponent(idea.id)}`,
    imageUrl: imageUrl(idea.photos?.[0]),
    price: idea.price?.price == null ? null : Number(idea.price.price),
    currency: idea.price?.currency || "RUB",
    space: "products",
    owners: [], ownerCount: 0, wishCount: 0,
    source: OHMYWISHES_SOURCE,
  };
}

export async function getOhMyWishesRecommendationsPage(limit, offset) {
  const catalog = await publicJson("/selections");
  const selection = catalog?.item;
  const total = Number(selection?.ideasCount);
  if (!selection?.id || selection.slug !== "for-you" || !Number.isFinite(total)) {
    throw new Error("Не удалось загрузить рекомендации.");
  }
  const pages = [];
  for (let pageOffset = offset; pageOffset < Math.min(total, offset + limit); pageOffset += 20) {
    pages.push(publicJson(`/selections/${encodeURIComponent(selection.id)}/ideas-v2?limit=20&offset=${pageOffset}`));
  }
  const responses = await Promise.all(pages);
  if (responses.some((page) => !Array.isArray(page?.items))) {
    throw new Error("Не удалось загрузить рекомендации.");
  }
  return {
    total,
    items: responses.flatMap((page) => page.items).slice(0, limit).map(ohMyWishesRecommendationItem),
  };
}

export async function resolveOhMyWishesItem(externalId) {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(externalId)) return null;
  const data = await publicJson(`/wishes-v2/${encodeURIComponent(externalId)}`);
  const idea = data?.item;
  if (!idea?.isIdea || idea.id !== externalId) return null;
  if (idea.creator?.accountType === "brand") {
    const brand = (await getOhMyWishesBrands()).find((entry) => entry.id === idea.creator.id);
    return brand ? ohMyWishesBrandItem(idea, brand) : null;
  }
  return ohMyWishesRecommendationItem(idea);
}
