import { parsePublicHttpUrl, fetchPublicHtml } from "../media-import/metadata-fetch.js";
import { readStructuredProducts } from "../media-import/metadata.js";
import { merchantProductUrl } from "../../../shared/modules/catalog-marketplace/product-links.js";
import { purchaseBudgetMinor } from "../../../shared/modules/planning/purchase-plan.js";
import { isPlanningDate } from "../../../shared/modules/planning/planning.js";

const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const isSchemaType = (node, type) => values(node?.["@type"]).some((value) => value === type || value === `https://schema.org/${type}` || value === `http://schema.org/${type}`);

export function purchasePriceSource(input) {
  const url = merchantProductUrl(input);
  if (!url) return "";
  try {
    const parsed = parsePublicHttpUrl(url);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) if (/^utm_|^(gclid|yclid|fbclid)$/i.test(key)) parsed.searchParams.delete(key);
    return parsed.href;
  } catch { return ""; }
}

function refersToPage(reference, page) {
  if (typeof reference !== "string") return false;
  try {
    const url = new URL(reference, page);
    url.hash = "";
    // Merchant queries may select a variant. Preserve them when matching offers.
    return url.href === page.href;
  } catch { return false; }
}

function countryDeliveryRate(details, country, currency) {
  if (!isSchemaType(details, "OfferShippingDetails") || (details.doesNotShip != null && details.doesNotShip !== false)) return null;
  if (["shippingSettingsLink", "shippingLabel", "hasShippingService", "orderValue", "eligibleTransactionVolume", "eligibleQuantity"]
    .some((key) => details[key] != null)) return null;
  const destination = values(details.shippingDestination).find((region) => isSchemaType(region, "DefinedRegion")
    && values(region.addressCountry).includes(country)
    && !["addressRegion", "postalCode", "postalCodePrefix", "postalCodeRange", "addressLocality"].some((key) => region[key] != null));
  if (!destination) return null;
  const rate = details.shippingRate;
  if (!isSchemaType(rate, "MonetaryAmount") || rate.currency !== currency
    || ["minValue", "maxValue", "orderValue", "validForMemberTier"].some((key) => rate[key] != null)) return null;
  return purchaseBudgetMinor(String(rate.value), { allowZero: true });
}

function calendarDays(quantity) {
  if (!isSchemaType(quantity, "QuantitativeValue") || !["DAY", "d"].includes(quantity.unitCode)) return null;
  const min = quantity.minValue ?? quantity.value;
  const max = quantity.maxValue ?? quantity.value;
  return Number.isInteger(min) && Number.isInteger(max) && min >= 0 && max >= min && max <= 365 ? { min, max } : null;
}

function deliveryDays(details) {
  const timing = details.deliveryTime;
  if (!isSchemaType(timing, "ShippingDeliveryTime") || timing.businessDays || timing.cutoffTime) return null;
  const handling = calendarDays(timing.handlingTime);
  const transit = calendarDays(timing.transitTime);
  if (!handling || !transit) return null;
  return { min: handling.min + transit.min, max: handling.max + transit.max };
}

export function parsePurchasePriceQuote(html, page, { country, currency, checkedAt }) {
  const products = readStructuredProducts(html);
  const matching = products.filter((product) => refersToPage(product.url, page)
    || values(product.offers).some((offer) => refersToPage(offer?.url, page)));
  const product = matching.length === 1 ? matching[0] : products.length === 1 && !products[0].url ? products[0] : null;
  if (!product) return null;

  const quotes = [];
  const offers = values(product.offers);
  for (const offer of offers) {
    if (!isSchemaType(offer, "Offer") || offer.priceCurrency !== currency || (offer.url && !refersToPage(offer.url, page))) continue;
    if (!offer.url && (offers.length !== 1 || (page.search && !refersToPage(product.url, page)))) continue;
    if (!["InStock", "https://schema.org/InStock", "http://schema.org/InStock"].includes(offer.availability)) continue;
    if (offer.priceValidUntil != null && (!isPlanningDate(offer.priceValidUntil) || offer.priceValidUntil < checkedAt.slice(0, 10))) continue;
    if (["eligibleQuantity", "eligibleTransactionVolume", "eligibleCustomerType", "eligibleRegion", "ineligibleRegion", "validForMemberTier"].some((key) => offer[key] != null)) continue;
    const itemMinor = purchaseBudgetMinor(String(offer.price), { allowZero: true });
    if (itemMinor === null) continue;
    const delivery = values(offer.shippingDetails);
    if (delivery.some((details) => details?.doesNotShip && values(details.shippingDestination).some((region) => values(region?.addressCountry).includes(country)))) continue;
    for (const details of delivery) {
      const deliveryMinor = countryDeliveryRate(details, country, currency);
      if (deliveryMinor === null) continue;
      const days = deliveryDays(details);
      quotes.push({ itemMinor, deliveryMinor, totalMinor: itemMinor + deliveryMinor, currency, store: page.hostname, url: page.href,
        ...(days && { deliveryDays: days }) });
    }
  }
  return quotes.sort((left, right) => left.totalMinor - right.totalMinor
    || (left.deliveryDays?.max ?? Infinity) - (right.deliveryDays?.max ?? Infinity))[0] || null;
}

export async function readPurchasePriceQuote(sourceUrl, options, fetchHtml = fetchPublicHtml) {
  const { html, url, truncated } = await fetchHtml(sourceUrl, { timeoutMs: 7_000, maxBytes: 600_000, maxRedirects: 0 });
  // A redirect can change the selected product or point to a category page.
  if (truncated || url.href !== sourceUrl) return null;
  return parsePurchasePriceQuote(html, url, options);
}
