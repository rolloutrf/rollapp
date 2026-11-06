export const EXTERNAL_WISHLIST_PROVIDERS = [
  { id: "ohmywishes", label: "OhMyWishes", domains: ["ohmywishes.com", "ohmywishes.ru"] },
  { id: "ozon", label: "Ozon", domains: ["ozon.ru"] },
  { id: "wb", label: "WB", domains: ["wildberries.ru", "wb.ru"] },
  { id: "yandex-market", label: "Яндекс Маркет", domains: ["market.yandex.ru"] },
];

export const EXTERNAL_WISHLIST_URL_MAX_LENGTH = 2048;

export function externalWishlistUrl(provider, value) {
  const input = typeof value === "string" ? value.trim() : "";
  if (!/^https:\/\//i.test(input) || /[\s\\\u0000-\u001f\u007f]/.test(input)
    || input.length > EXTERNAL_WISHLIST_URL_MAX_LENGTH) return null;
  try {
    const url = new URL(input);
    if (url.username || url.password || url.port || (url.pathname === "/" && !url.search)) return null;
    if (!provider.domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) return null;
    return url.href.length <= EXTERNAL_WISHLIST_URL_MAX_LENGTH ? url.href : null;
  } catch {
    return null;
  }
}

export function externalWishlistLinks(value) {
  return Object.fromEntries(EXTERNAL_WISHLIST_PROVIDERS.flatMap((provider) => {
    const url = externalWishlistUrl(provider, value?.[provider.id]);
    return url ? [[provider.id, url]] : [];
  }));
}
