export const OHMYWISHES_API_BASE = "https://ohmywishes.com/api/v3";
export const OHMYWISHES_SOURCE = Object.freeze({
  id: "ohmywishes",
  label: "OhMyWishes",
  homeUrl: "https://ohmywishes.com/ru/",
  logoUrl: "https://ohmywishes.com/favicon.svg",
});

const SPACE_BY_CATEGORY = Object.freeze({
  "grocery-gourmet": "food",
  travel: "places",
  automotive: "transport",
});

const SPACE_PRIORITY = Object.freeze({ food: 3, transport: 2, places: 1, products: 0 });

export function ohMyWishesSpaceForCategory(categorySlug) {
  return SPACE_BY_CATEGORY[String(categorySlug || "")] || "products";
}

export function ohMyWishesSpaceForCategories(categorySlugs = []) {
  return categorySlugs.reduce((selected, categorySlug) => {
    const candidate = ohMyWishesSpaceForCategory(categorySlug);
    return SPACE_PRIORITY[candidate] > SPACE_PRIORITY[selected] ? candidate : selected;
  }, "products");
}

function photoUrl(idea) {
  const image = idea?.photos?.[0]?.image;
  if (!image) return "";
  const thumbnails = Array.isArray(image.thumbnails) ? image.thumbnails : [];
  const thumbnail = thumbnails
    .filter((item) => item?.url)
    .sort((left, right) => Math.abs(Number(left.width || 0) - 600) - Math.abs(Number(right.width || 0) - 600))[0];
  return String(thumbnail?.url || image.url || "");
}

export function mergeOhMyWishesIdea(items, idea, selection, selectionIndex = 0) {
  const externalId = String(idea?.id || "").trim();
  const title = String(idea?.title || "").trim();
  const categorySlug = String(selection?.slug || "").trim();
  if (!externalId || !title || !categorySlug) return;

  const current = items.get(externalId);
  if (current) {
    current.categorySlugs.add(categorySlug);
    current.sourceRank = Math.min(current.sourceRank, selectionIndex);
    return;
  }

  items.set(externalId, {
    externalId,
    title,
    imageUrl: photoUrl(idea),
    price: idea?.price?.price == null ? null : Number(idea.price.price),
    currency: String(idea?.price?.currency || "RUB"),
    categorySlugs: new Set([categorySlug]),
    preferredCategorySlug: categorySlug,
    sourceRank: selectionIndex,
  });
}

export function ohMyWishesCatalogRecord(item) {
  const categorySlugs = [...item.categorySlugs];
  const preferredCategorySlug = categorySlugs.includes(item.preferredCategorySlug)
    ? item.preferredCategorySlug
    : categorySlugs[0];
  return {
    source: OHMYWISHES_SOURCE.id,
    externalId: item.externalId,
    title: item.title,
    description: "",
    url: `https://ohmywishes.com/ru/selections/${encodeURIComponent(preferredCategorySlug)}/ideas/${encodeURIComponent(item.externalId)}`,
    imageUrl: item.imageUrl,
    price: Number.isFinite(item.price) ? item.price : null,
    currency: item.currency || "RUB",
    space: ohMyWishesSpaceForCategories(categorySlugs),
    sourceLabel: OHMYWISHES_SOURCE.label,
    sourceHomeUrl: OHMYWISHES_SOURCE.homeUrl,
    sourceLogoUrl: OHMYWISHES_SOURCE.logoUrl,
    categoriesJson: JSON.stringify(categorySlugs.sort()),
    sourceRank: item.sourceRank,
  };
}
