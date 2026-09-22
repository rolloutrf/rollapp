// Keep old bookmarks working while all new URLs use the product's own wording.
export function isBrandCatalogSearch(search) {
  return ["brands", "ohmywishes"].includes(new URLSearchParams(search).get("source"));
}
