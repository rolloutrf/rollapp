const PRODUCT_PATH = /^\/product\/[^/]+\/?$/;

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
      const product = findStructuredProduct(JSON.parse((script.textContent || "").trim().replace(/;\s*$/, "")));
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
  if (Array.isArray(value)) return firstImage(value[0]);
  if (value && typeof value === "object") return value.url || value.contentUrl || "";
  return "";
}

function offerFrom(product) {
  const offers = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  return offers && typeof offers === "object" ? offers : null;
}

function readSamokatProduct() {
  if (!PRODUCT_PATH.test(location.pathname)) return { ok: false };
  const pageText = document.body?.innerText || "";
  if (/разверните\s+картинку\s+горизонтально|пройдите\s+проверку,?\s+чтобы\s+получить\s+доступ/iu.test(pageText)) {
    return { ok: false, blocked: true };
  }

  const product = structuredProduct();
  const imageElement = document.querySelector('.swiper-slide-active img[class*="ProductMedia_image__"][src]')
    || document.querySelector('img[class*="ProductMedia_image__"][src]');
  const imageUrl = imageElement?.currentSrc || imageElement?.src || firstImage(product?.image);
  if (!imageUrl || !/^https:\/\/damcdn\.samokat\.ru\/dam-storage-ext-env-prod\//i.test(imageUrl)) return { ok: false };

  const offer = offerFrom(product);
  const price = Number(offer?.price);
  return {
    ok: true,
    metadata: {
      title: String(product?.name || firstText(["h1", '[class*="ProductInfo_title__"]'])).trim(),
      description: String(product?.description || firstText(['[class*="ProductInfo_description__"]', '[class*="ProductDescription_description__"]'])).trim(),
      imageUrl,
      price: Number.isFinite(price) && price >= 0 ? price : null,
      currency: typeof offer?.priceCurrency === "string" ? offer.priceCurrency.toUpperCase() : "RUB",
    },
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "ROLLAPP_READ_SAMOKAT_PRODUCT") return false;
  sendResponse(readSamokatProduct());
  return false;
});
