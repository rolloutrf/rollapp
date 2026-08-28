const RETAILER_PAGES = Object.freeze({
  samokat: Object.freeze({
    hosts: new Set(["samokat.ru", "www.samokat.ru"]),
    path: /^\/product\/[^/]+\/?$/u,
  }),
  lavka: Object.freeze({
    hosts: new Set(["lavka.yandex.ru"]),
    path: /^\/good\/[^/]+\/?$/u,
  }),
  lenta: Object.freeze({
    hosts: new Set(["lenta.com", "www.lenta.com"]),
    path: /^\/(?:product|item)\/[^/]+-(\d{3,18})\/?$/u,
  }),
});

function currentRetailer() {
  const hostname = location.hostname.toLowerCase();
  return Object.entries(RETAILER_PAGES).find(([, policy]) => (
    policy.hosts.has(hostname) && policy.path.test(location.pathname)
  ))?.[0] || "";
}

function findStructuredProduct(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const product = findStructuredProduct(item);
      if (product) return product;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
  if (types.some((type) => typeof type === "string" && /(?:^|[\/#:])Product$/i.test(type))) return value;
  for (const nested of Object.values(value)) {
    const product = findStructuredProduct(nested);
    if (product) return product;
  }
  return null;
}

function structuredProduct() {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const source = (script.textContent || "").trim().replace(/;\s*$/, "");
      const product = findStructuredProduct(JSON.parse(source));
      if (product) return product;
    } catch {
      // Ignore unrelated or temporarily incomplete structured-data blocks.
    }
  }
  return null;
}

function firstText(selectors) {
  for (const selector of selectors) {
    const value = document.querySelector(selector)?.textContent?.trim();
    if (value) return value;
  }
  return "";
}

function firstImage(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const image = firstImage(item);
      if (image) return image;
    }
    return "";
  }
  if (value && typeof value === "object") return value.url || value.contentUrl || "";
  return "";
}

function offerFrom(product) {
  const offers = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  return offers && typeof offers === "object" ? offers : null;
}

function absoluteImage(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    return new URL(value.trim(), location.href).href;
  } catch {
    return "";
  }
}

function elementImage(element) {
  if (!element) return "";
  const current = element.currentSrc || element.src || "";
  if (current) return absoluteImage(current);
  const srcset = element.getAttribute("srcset") || "";
  return absoluteImage(srcset.split(",").at(-1)?.trim().split(/\s+/u)[0] || "");
}

function trustedImage(retailerId, value) {
  let image;
  try {
    image = new URL(value);
  } catch {
    return false;
  }
  if (image.protocol !== "https:" || image.username || image.password || image.port) return false;
  const hostname = image.hostname.toLowerCase();
  if (retailerId === "samokat") {
    return hostname === "damcdn.samokat.ru" && image.pathname.startsWith("/dam-storage-ext-env-prod/");
  }
  if (retailerId === "lavka") {
    return (hostname === "yastatic.net" && /^\/avatars\/(?:get-grocery-goods|get-eda)\//u.test(image.pathname))
      || (hostname === "avatars.mds.yandex.net" && /^\/(?:get-grocery-goods|get-eda)\//u.test(image.pathname));
  }
  if (retailerId === "lenta") {
    const sku = RETAILER_PAGES.lenta.path.exec(location.pathname)?.[1] || "";
    return hostname === "cdn.api.lenta.com"
      && new RegExp(`^/resample/[^/]+/[^/]+/photo/${sku}/catalog-image/[^/]+$`, "u").test(image.pathname);
  }
  return false;
}

function domImage(retailerId) {
  const selectors = retailerId === "samokat"
    ? ['.swiper-slide-active img[class*="ProductMedia_image__"][src]', 'img[class*="ProductMedia_image__"][src]']
    : retailerId === "lavka"
      ? ['[data-testid="product-thumb"] img[data-testid="snippet-image"]', 'img[data-testid="snippet-image"]']
      : [`img[src*="/photo/${RETAILER_PAGES.lenta.path.exec(location.pathname)?.[1] || ""}/catalog-image/"]`];
  for (const selector of selectors) {
    const imageUrl = elementImage(document.querySelector(selector));
    if (trustedImage(retailerId, imageUrl)) return imageUrl;
  }
  return "";
}

function pageBlocked() {
  const pageText = document.body?.innerText || "";
  return /разверните\s+картинку\s+горизонтально|пройдите\s+проверку|подтвердите,?\s+что\s+вы\s+не\s+робот|вы\s+не\s+робот|are\s+you\s+human|access\s+denied|forbidden|captcha/iu.test(pageText);
}

function readRetailerProduct(requestedRetailerId) {
  const retailerId = currentRetailer();
  if (!retailerId || retailerId !== requestedRetailerId) return { ok: false };
  if (pageBlocked()) return { ok: false, blocked: true };

  const product = structuredProduct();
  const structuredImage = absoluteImage(firstImage(product?.image));
  const imageUrl = trustedImage(retailerId, structuredImage) ? structuredImage : domImage(retailerId);
  if (!imageUrl) return { ok: false };

  const offer = offerFrom(product);
  const rawPrice = offer?.price ?? offer?.lowPrice;
  const price = Number(rawPrice);
  return {
    ok: true,
    metadata: {
      title: String(product?.name || firstText(["h1"])).trim(),
      description: String(product?.description || firstText([
        '[class*="ProductInfo_description__"]',
        '[class*="ProductDescription_description__"]',
        '[data-testid="product-description"]',
      ])).trim(),
      imageUrl,
      price: Number.isFinite(price) && price >= 0 ? price : null,
      currency: typeof offer?.priceCurrency === "string" ? offer.priceCurrency.toUpperCase() : "RUB",
    },
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "ROLLAPP_READ_RETAILER_PRODUCT") return false;
  sendResponse(readRetailerProduct(message.retailerId));
  return false;
});
