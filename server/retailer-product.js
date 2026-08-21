import { MetadataFetchError } from "./metadata-fetch.js";

const RETAILER_POLICIES = Object.freeze({
  samokat: Object.freeze({
    label: "Самокат",
    hosts: new Set(["samokat.ru", "www.samokat.ru"]),
    canonicalHost: "samokat.ru",
    path: /^\/product\/([^/]{1,240})\/?$/u,
  }),
  lavka: Object.freeze({
    label: "Яндекс Лавка",
    hosts: new Set(["lavka.yandex.ru"]),
    canonicalHost: "lavka.yandex.ru",
    path: /^\/good\/([^/]{1,240})\/?$/u,
  }),
  lenta: Object.freeze({
    label: "Лента",
    hosts: new Set(["lenta.com", "www.lenta.com"]),
    canonicalHost: "lenta.com",
    path: /^\/(?:product|item)\/([^/]{1,300})\/?$/u,
  }),
});

function retailerError(retailerId, message, suffix, cause) {
  return new MetadataFetchError(message, {
    code: `${retailerId}_${suffix}`,
    cause,
  });
}

function policyFor(retailerId) {
  const policy = RETAILER_POLICIES[retailerId];
  if (!policy) throw new TypeError(`Unknown retailer: ${retailerId}`);
  return policy;
}

function parseSupportedUrl(retailerId, value) {
  const policy = policyFor(retailerId);
  let url;
  try {
    url = value instanceof URL ? new URL(value.href) : new URL(String(value));
  } catch (error) {
    throw retailerError(retailerId, `Нужна корректная ссылка магазина «${policy.label}»`, "invalid_url", error);
  }

  const hostname = url.hostname.toLowerCase();
  const standardPort = !url.port
    || (url.protocol === "http:" && url.port === "80")
    || (url.protocol === "https:" && url.port === "443");
  const match = policy.path.exec(url.pathname);
  if (!['http:', 'https:'].includes(url.protocol)
    || !policy.hosts.has(hostname)
    || url.username
    || url.password
    || !standardPort
    || !match) {
    throw retailerError(
      retailerId,
      `Поддерживаются только ссылки на товары магазина «${policy.label}»`,
      "unsupported_url",
    );
  }

  return { policy, source: url, slug: match[1] };
}

function lentaSku(slug) {
  return /-(\d{3,18})$/u.exec(slug)?.[1] || "";
}

export function canonicalRetailerProductUrl(retailerId, value) {
  const { policy, source, slug } = parseSupportedUrl(retailerId, value);
  if (retailerId === "lenta" && !lentaSku(slug)) {
    throw retailerError(retailerId, "В ссылке Ленты не найден артикул товара", "unsupported_url");
  }

  const pathPrefix = retailerId === "lenta" ? "/product/" : retailerId === "lavka" ? "/good/" : "/product/";
  const canonical = new URL(`https://${policy.canonicalHost}${pathPrefix}${slug}`);
  if (retailerId === "lavka" && slug.toLowerCase().endsWith(":st-rt")) {
    const retailSlug = source.searchParams.get("retail_slug") || "";
    if (!/^[a-z0-9_-]{1,100}$/iu.test(retailSlug)) {
      throw retailerError(retailerId, "Для этой карточки Лавки нужен корректный retail_slug", "unsupported_url");
    }
    canonical.searchParams.set("retail_slug", retailSlug);
  }
  return canonical;
}

export function canonicalSamokatProductUrl(value) {
  return canonicalRetailerProductUrl("samokat", value);
}

export function canonicalLavkaProductUrl(value) {
  return canonicalRetailerProductUrl("lavka", value);
}

export function canonicalLentaProductUrl(value) {
  return canonicalRetailerProductUrl("lenta", value);
}

export function isSameRetailerProduct(retailerId, left, right) {
  try {
    const leftUrl = canonicalRetailerProductUrl(retailerId, left);
    const rightUrl = canonicalRetailerProductUrl(retailerId, right);
    if (retailerId === "lenta") {
      return lentaSku(leftUrl.pathname.split("/").filter(Boolean).at(-1) || "")
        === lentaSku(rightUrl.pathname.split("/").filter(Boolean).at(-1) || "");
    }
    return leftUrl.href === rightUrl.href;
  } catch {
    return false;
  }
}

export function isTrustedRetailerImage(retailerId, value, productUrl) {
  let image;
  try {
    image = new URL(String(value));
  } catch {
    return false;
  }
  if (image.protocol !== "https:" || image.username || image.password || image.port) return false;

  const hostname = image.hostname.toLowerCase();
  if (retailerId === "samokat") {
    return hostname === "damcdn.samokat.ru"
      && image.pathname.startsWith("/dam-storage-ext-env-prod/");
  }
  if (retailerId === "lavka") {
    return (hostname === "yastatic.net"
        && /^\/avatars\/(?:get-grocery-goods|get-eda)\//u.test(image.pathname))
      || (hostname === "avatars.mds.yandex.net"
        && /^\/(?:get-grocery-goods|get-eda)\//u.test(image.pathname));
  }
  if (retailerId === "lenta") {
    let canonical;
    try {
      canonical = canonicalLentaProductUrl(productUrl);
    } catch {
      return false;
    }
    const sku = lentaSku(canonical.pathname.split("/").filter(Boolean).at(-1) || "");
    return hostname === "cdn.api.lenta.com"
      && new RegExp(`^/resample/[^/]+/[^/]+/photo/${sku}/catalog-image/[^/]+$`, "u").test(image.pathname);
  }
  return true;
}

export function isAllowedRetailerBrowserUrl(retailerId, value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    return false;
  }
  if (url.username || url.password || url.port) return false;
  if (["data:", "blob:"].includes(url.protocol)) return true;
  if (url.protocol !== "https:") return false;
  const hostname = url.hostname.toLowerCase();

  if (retailerId === "samokat") {
    return [
      "samokat.ru",
      "www.samokat.ru",
      "api-web.samokat.ru",
      "damcdn.samokat.ru",
      "servicepipe.tech",
      "cdn.servicepipe.tech",
    ].includes(hostname);
  }
  if (retailerId === "lenta") {
    return [
      "lenta.com",
      "www.lenta.com",
      "api.lenta.com",
      "cdn.api.lenta.com",
      "sitecdn.api.lenta.com",
    ].includes(hostname);
  }
  return false;
}

export const retailerProductPolicy = policyFor;
