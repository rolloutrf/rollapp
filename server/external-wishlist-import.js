import { randomUUID } from "node:crypto";
import { EXTERNAL_WISHLIST_PROVIDERS, externalWishlistUrl } from "../shared/external-wishlists.js";
import { fetchPublicHtml, fetchPublicJson } from "./metadata-fetch.js";
import { decodeHtmlEntities } from "./metadata.js";
import { OHMYWISHES_API_BASE } from "./ohmywishes-catalog.js";

const ohMyWishes = EXTERNAL_WISHLIST_PROVIDERS.find(({ id }) => id === "ohmywishes");
const ohMyWishesPath = /^(?:\/(?:ru|en))?\/users\/([\w.-]{1,128})(?:\/lists\/([\w.-]{1,256}))?\/?$/i;
const marketHost = "market.yandex.ru";
const marketWishlistPath = /^\/wishlist\/([a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})\/?$/i;
const publicId = /^[a-z\d_-]{1,128}$/i;
const currencies = new Set(["RUB", "USD", "EUR", "KZT", "BYN"]);
const pageSize = 20;
const maxItems = 500;

export class WishlistImportError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function photoUrl(wish) {
  const value = wish.photos?.[0]?.image?.url;
  if (typeof value !== "string" || value.length > 2000) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && url.hostname.endsWith(".ohmywishes.com") ? url.href : "";
  } catch {
    return "";
  }
}

export async function readOhMyWishes(url, { fetchJson = fetchPublicJson } = {}) {
  const safeUrl = externalWishlistUrl(ohMyWishes, url);
  const source = safeUrl && ohMyWishesPath.exec(new URL(safeUrl).pathname);
  if (!source) {
    throw new WishlistImportError(422, "Для импорта вставьте ссылку на профиль или список OhMyWishes через «Поделиться».");
  }
  const [, username, listId] = source;
  const deadline = Date.now() + 18_000;
  const read = async (path) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new WishlistImportError(502, "OhMyWishes отвечает слишком долго. Попробуйте снова.");
    try {
      return (await fetchJson(`${OHMYWISHES_API_BASE}${path}`, {
        timeoutMs: Math.min(remaining, 5_000), maxBytes: 512_000, maxRedirects: 0,
      })).json;
    } catch {
      throw new WishlistImportError(502, "Не удалось прочитать список OhMyWishes. Проверьте, что он открывается по ссылке без входа.");
    }
  };
  const { item: user } = await read(`/users/${encodeURIComponent(username)}`) || {};
  if (typeof user?.id !== "string" || !publicId.test(user.id) || (!listId && user.isPrivate)) {
    throw new WishlistImportError(422, "Этот профиль OhMyWishes закрыт или недоступен по ссылке.");
  }

  const listPath = listId ? `${encodeURIComponent(listId)}/wishes-v2` : "all/wishes";
  const sourcePath = `/users/${encodeURIComponent(username)}${listId ? `/lists/${encodeURIComponent(listId)}` : ""}`;
  const items = new Map();
  for (let offset = 0; offset <= maxItems; offset += pageSize) {
    const page = await read(`/users/${user.id}/wish-lists/${listPath}?limit=${pageSize}&offset=${offset}`);
    if (!Array.isArray(page?.items) || page.items.length > pageSize) {
      throw new WishlistImportError(502, "OhMyWishes вернул список в неизвестном формате.");
    }
    if (offset === maxItems && page.items.length > 0) {
      throw new WishlistImportError(422, "В списке больше 500 желаний. Используйте ссылку на отдельный список OhMyWishes.");
    }
    for (const wish of page.items) {
      const title = typeof wish?.title === "string" ? wish.title.trim().replace(/\0/g, "").slice(0, 160) : "";
      if (typeof wish?.id !== "string" || !publicId.test(wish.id) || !title || items.has(wish.id)) {
        throw new WishlistImportError(502, "OhMyWishes вернул неполный список. Попробуйте импортировать его снова.");
      }
      const { price, currency } = wish.price || {};
      const validPrice = Number.isFinite(price) && price >= 0 && price <= 999999999 && currencies.has(currency);
      items.set(wish.id, {
        key: `wishlist-import:ohmywishes:${wish.id}`,
        title,
        url: `https://ohmywishes.com${sourcePath}/wishes/${wish.id}`,
        image_url: photoUrl(wish),
        price: validPrice ? price : null,
        currency: validPrice ? currency : "RUB",
      });
    }
    if (page.items.length < pageSize) break;
  }
  return [...items.values()];
}

const isMarketUrl = (url) => url.protocol === "https:" && url.hostname === marketHost && !url.port && !url.username && !url.password;
const marketFormatError = () => new WishlistImportError(502, "Не удалось прочитать товары из списка Яндекс Маркета. Проверьте, что он открывается по ссылке без входа.");

export async function readYandexMarketWishlist(input, { fetchHtml = fetchPublicHtml } = {}) {
  const url = URL.parse(input);
  const listId = url && marketWishlistPath.exec(url.pathname)?.[1];
  if (!url || !isMarketUrl(url) || (!listId && !/^\/cc\/[a-z\d]+\/?$/i.test(url.pathname))) {
    throw new WishlistImportError(422, "Для импорта вставьте ссылку на список Яндекс Маркета через «Поделиться».");
  }
  let page;
  try {
    page = await fetchHtml(listId ? `https://${marketHost}/wishlist/${listId}` : url.href, {
      timeoutMs: 12_000, maxBytes: 8 * 1024 * 1024, allowRedirect: isMarketUrl,
    });
  } catch {
    throw marketFormatError();
  }
  const finalId = marketWishlistPath.exec(page.url.pathname)?.[1];
  if (!isMarketUrl(page.url) || !finalId || (listId && listId !== finalId)) {
    throw new WishlistImportError(422, "Ссылка ведёт на другую страницу Яндекс Маркета. Скопируйте ссылку на сам список.");
  }
  if (page.truncated || !page.html.includes('data-auto="wishlistLayout"')) throw marketFormatError();

  const items = new Map();
  // Scope extraction to the server-rendered wishlist entries, excluding recommendations.
  const cardPattern = /<!--BEGIN \[@marketfront\/SnippetConstructor\] ([^\s<>]+-wishlist-item) static-->([\s\S]*?)<!--END \[@marketfront\/SnippetConstructor\] \1 static-->/g;
  for (const [, , card] of page.html.matchAll(cardPattern)) {
    const link = /<a\b([^>]+)>\s*<span\b([^>]*\bdata-auto="snippet-title"[^>]*)>/.exec(card);
    const href = decodeHtmlEntities(link?.[1].match(/\bhref="([^"]+)"/)?.[1]);
    const title = decodeHtmlEntities(link?.[2].match(/\btitle="([^"]+)"/)?.[1]).trim().replace(/\0/g, "").slice(0, 160);
    const product = URL.parse(href, page.url);
    const productId = product && /^\/(?:card\/[^/]+|product--[^/]+)\/(\d+)\/?$/.exec(product.pathname)?.[1];
    if (!productId || !isMarketUrl(product) || !title) throw marketFormatError();
    const image = /<img\b[^>]*\bsrc="(https:\/\/avatars\.mds\.yandex\.net\/[^"\s]+)"/.exec(card)?.[1] || "";
    const priceText = /data-auto="snippet-price-current"[^>]*><span[^>]*>([^<]+)<\/span><span[^>]*>[^<]*₽/.exec(card)?.[1];
    const price = priceText ? Number(decodeHtmlEntities(priceText).replace(/\s+/g, "").replace(",", ".")) : NaN;
    const key = `wishlist-import:yandex-market:${productId}`;
    items.set(key, {
      key, title, url: `${product.origin}${product.pathname}`, image_url: decodeHtmlEntities(image).slice(0, 2000),
      price: Number.isFinite(price) && price >= 0 && price <= 999999999 ? price : null, currency: "RUB",
    });
  }
  if (!items.size && !page.html.includes(`&quot;listId&quot;:&quot;${finalId}&quot;,&quot;isEmpty&quot;:true`)) throw marketFormatError();
  const partial = /"hasNextPage"\s*:\s*true/.test(page.html);
  return { items: [...items.values()], partial };
}

export const externalWishlistReaders = new Map([
  ["ohmywishes", async (url) => ({ items: await readOhMyWishes(url), partial: false })],
  ["yandex-market", readYandexMarketWishlist],
]);

export async function insertExternalWishlistItems(client, userId, items) {
  if (!items.length) return 0;
  const { rowCount } = await client.query(
    `INSERT INTO wishes (id,user_id,title,url,image_url,price,currency,privacy,space,catalog_item_key)
     SELECT imported.id,$1,imported.title,imported.url,imported.image_url,imported.price,imported.currency,
       'private','products',imported.key
     FROM jsonb_to_recordset($2::jsonb) AS imported(id text,title text,url text,image_url text,price numeric,currency text,key text)
     ON CONFLICT (user_id,catalog_item_key) WHERE catalog_item_key IS NOT NULL DO NOTHING`,
    [userId, JSON.stringify(items.map((item) => ({ ...item, id: randomUUID() })))],
  );
  return rowCount;
}
