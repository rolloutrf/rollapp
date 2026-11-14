import { z } from "zod";

const marketplaceProducts = new Map([
  ["yandex-market", {
    hosts: ["market.yandex.ru"],
    product: /^\/(?:card\/[^/]+|product--[^/]+)\/(\d{1,20})\/?$/,
    image: (host) => host === "avatars.mds.yandex.net",
  }],
  ["ozon", {
    hosts: ["www.ozon.ru", "ozon.ru"],
    product: /^\/product\/(?:[^/]+-)?(\d{1,20})\/?$/,
    image: (host) => host.endsWith(".ozone.ru"),
  }],
  ["wb", {
    hosts: ["www.wildberries.ru", "wildberries.ru", "www.wb.ru", "wb.ru"],
    product: /^\/catalog\/(\d{1,20})\/detail\.aspx$/,
    image: (host) => /^(?:basket-\d+\.)?wbbasket\.ru$|^basket-\d+\.wbcontent\.net$/.test(host),
  }],
]);

const browserWishlistPayload = z.object({
  ownerId: z.string().min(1).max(160),
  linkedUrl: z.string().min(1).max(2048).optional(),
  items: z.array(z.object({
    url: z.string().max(1000),
    title: z.string().trim().min(1).max(160).refine((title) => !title.includes("\0")),
    imageUrl: z.string().max(1000).default(""),
    price: z.number().finite().min(0).max(999999999).nullable().default(null),
  }).strict()).max(1000),
}).strict();

function httpsUrl(value) {
  const url = URL.parse(value);
  return url && url.protocol === "https:" && !url.username && !url.password && !url.port ? url : null;
}

export function marketplaceWishlistKey(provider, value) {
  const config = marketplaceProducts.get(provider);
  const url = httpsUrl(value);
  const id = config?.hosts.includes(url?.hostname) && config.product.exec(url.pathname)?.[1];
  return id ? `wishlist-import:${provider}:${id}` : null;
}

export function parseBrowserWishlist(provider, body, ownerId) {
  const config = marketplaceProducts.get(provider);
  if (!config) return null;
  const parsed = browserWishlistPayload.safeParse(body);
  if (!parsed.success || parsed.data.ownerId !== ownerId) return null;

  const items = new Map();
  for (const item of parsed.data.items) {
    const key = marketplaceWishlistKey(provider, item.url);
    if (!key) return null;
    if (items.has(key)) continue;
    const url = new URL(item.url);
    const image = httpsUrl(item.imageUrl);
    items.set(key, {
      key,
      title: item.title,
      url: url.origin + url.pathname,
      image_url: image && config.image(image.hostname) ? image.origin + image.pathname : "",
      price: item.price,
      currency: "RUB",
    });
  }
  return [...items.values()];
}
