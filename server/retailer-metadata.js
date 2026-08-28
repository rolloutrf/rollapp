import {
  canonicalRetailerProductUrl as canonicalSharedRetailerProductUrl,
  retailerPreview,
} from "../shared/retailer-previews.js";
import { fetchPublicHtml, MetadataFetchError } from "./metadata-fetch.js";
import {
  parseBusheMetadata,
  parseLavkaMetadata,
  parseLavkaProductImage,
  parseProductMetadata,
  parseSamokatProductImage,
  parseStructuredProductMetadata,
} from "./metadata.js";
import {
  canonicalRetailerProductUrl,
  isSameRetailerProduct,
  isTrustedRetailerImage,
} from "./retailer-product.js";
import { renderLentaProductHtml, renderSamokatProductHtml } from "./retailer-renderer.js";

const HARD_CHALLENGE_PATTERNS = [
  /<title\b[^>]*>\s*(?:forbidden|access denied|доступ\s+ограничен)/iu,
  /<(?:h1|h2)\b[^>]*>\s*(?:forbidden|access denied|доступ\s+ограничен)/iu,
];
const SOFT_CHALLENGE_PATTERNS = [
  /if you are not a bot/iu,
  /showcaptcha/iu,
];
const SERVICEPIPE_PATTERN = /servicepipe\.tech/iu;
const QRATOR_PATTERN = /(?:__qrator\/qauth\.js|\bqrator_jsr\b)/iu;

function hasChallengePage(html, structuredProductFound) {
  const source = String(html).slice(0, 200_000);
  return HARD_CHALLENGE_PATTERNS.some((pattern) => pattern.test(source))
    || (!structuredProductFound && SOFT_CHALLENGE_PATTERNS.some((pattern) => pattern.test(source)));
}

function hasUnresolvedChallenge(retailer, html, structuredProductFound) {
  const source = String(html);
  if (retailer.id === "samokat") {
    return SERVICEPIPE_PATTERN.test(source.slice(0, 200_000)) && !structuredProductFound;
  }
  return retailer.id === "lenta"
    && QRATOR_PATTERN.test(source.slice(0, 200_000))
    && !structuredProductFound;
}

function fallbackMetadata(retailer) {
  return {
    title: "",
    description: "",
    imageUrl: retailer.imageUrl,
    price: null,
    currency: "",
    kind: "retailer",
    previewFallback: true,
  };
}

function genericRetailerTitle(retailer, value) {
  const title = String(value || "").replace(/\s+/g, " ").trim();
  if (!title) return false;
  if (retailer.id === "lenta") return /^(?:лента|сеть\s+гипермаркетов\s+лента)(?:\s*[—–|:·-]|$)/iu.test(title);
  if (retailer.id === "samokat") return /^самокат(?:\s*[—–|:·-]|$)/iu.test(title);
  if (retailer.id === "lavka") return /^(?:яндекс\s+лавка|лавка)(?:\s*[—–|:·-]|$)/iu.test(title);
  return false;
}

function parseRetailerHtml(retailer, html, pageUrl) {
  if (retailer.id === "lavka") return parseLavkaMetadata(html, pageUrl);
  if (retailer.id === "bushe") return parseBusheMetadata(html, pageUrl);
  return parseProductMetadata(html, pageUrl);
}

function metadataFromRetailerResponse(retailer, response, requestedUrl) {
  const { html, url } = response;
  const finalRetailer = retailerPreview(url);
  if (finalRetailer?.id !== retailer.id) return null;
  const strictProduct = ["lavka", "lenta", "samokat"].includes(retailer.id);
  if (new URL(url).protocol !== "https:") return null;
  if (strictProduct && !isSameRetailerProduct(retailer.id, requestedUrl, url)) return null;

  const structured = strictProduct
    ? parseStructuredProductMetadata(html, url)
    : { productFound: false };
  if (hasChallengePage(html, structured.productFound) || hasUnresolvedChallenge(retailer, html, structured.productFound)) return null;
  const verifiedImageUrl = strictProduct
    ? [
      structured.imageUrl,
      retailer.id === "lavka" ? parseLavkaProductImage(html, url) : "",
      retailer.id === "samokat" ? parseSamokatProductImage(html, url) : "",
    ].find((imageUrl) => imageUrl && isTrustedRetailerImage(retailer.id, imageUrl, url)) || ""
    : "";
  if (strictProduct) {
    if (!structured.productFound || !structured.title || !verifiedImageUrl) return null;
    if (structured.productUrl && !isSameRetailerProduct(retailer.id, requestedUrl, structured.productUrl)) return null;
  }

  const metadata = parseRetailerHtml(retailer, html, url);
  const genericShell = genericRetailerTitle(retailer, metadata.title) && metadata.price === null;
  if ((!metadata.imageUrl && !verifiedImageUrl) || genericShell) return null;
  return {
    ...metadata,
    imageUrl: strictProduct ? verifiedImageUrl : metadata.imageUrl,
    kind: "retailer",
    previewFallback: false,
  };
}

export async function resolveRetailerMetadata(value, {
  fetchHtml = fetchPublicHtml,
  timeoutMs,
  allowBrowser = true,
  renderSamokat = renderSamokatProductHtml,
  renderLenta = renderLentaProductHtml,
  renderTimeoutMs,
} = {}) {
  const retailer = retailerPreview(value);
  if (!retailer) return null;
  const strictProduct = ["lavka", "lenta", "samokat"].includes(retailer.id);
  let requestValue = value;
  if (strictProduct) {
    try {
      requestValue = canonicalRetailerProductUrl(retailer.id, value);
    } catch {
      return fallbackMetadata(retailer);
    }
  } else {
    requestValue = canonicalSharedRetailerProductUrl(value) || value;
  }

  try {
    const effectiveFetchTimeout = Number(timeoutMs)
      || (retailer.id === "lavka" ? 7_000 : 4_500);
    const fetchOptions = {
      timeoutMs: effectiveFetchTimeout,
      ...(retailer.id === "lavka" ? { maxBytes: 800_000 } : {}),
    };
    const metadata = metadataFromRetailerResponse(
      retailer,
      await fetchHtml(requestValue, fetchOptions),
      requestValue,
    );
    if (metadata) return metadata;
  } catch (error) {
    if (!(error instanceof MetadataFetchError)) throw error;
  }

  const renderer = retailer.id === "samokat"
    ? renderSamokat
    : retailer.id === "lenta"
      ? renderLenta
      : null;
  const hasApprovedSamokatRenderer = retailer.id !== "samokat"
    || renderSamokat !== renderSamokatProductHtml
    || Boolean(process.env.RETAILER_BROWSER_CDP_URL || process.env.SAMOKAT_BROWSER_CDP_URL);
  if (!allowBrowser || !renderer || !hasApprovedSamokatRenderer) return fallbackMetadata(retailer);
  try {
    const effectiveRenderTimeout = Number(renderTimeoutMs)
      || (retailer.id === "lenta" ? 20_000 : 12_000);
    const metadata = metadataFromRetailerResponse(
      retailer,
      await renderer(requestValue, { timeoutMs: effectiveRenderTimeout }),
      requestValue,
    );
    if (metadata) return metadata;
  } catch {
    // Browser rendering is a best-effort fallback. The local branded preview
    // remains available when Servicepipe requests a CAPTCHA or Chromium fails.
  }
  return fallbackMetadata(retailer);
}
