import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePurchasePriceQuote, purchasePriceSource, readPurchasePriceQuote } from "./purchase-price-quote.js";

const page = new URL("https://shop.example/p/example");
const options = { country: "RU", currency: "RUB", checkedAt: "2026-11-16T10:00:00.000Z" };
const destination = { "@type": "DefinedRegion", addressCountry: "RU" };
const rate = { "@type": "MonetaryAmount", currency: "RUB", value: "99.99" };
const delivery = { "@type": "OfferShippingDetails", shippingDestination: destination, shippingRate: rate };
const offer = { "@type": "Offer", url: page.href, price: "300.01", priceCurrency: "RUB", availability: "https://schema.org/InStock", shippingDetails: delivery };
const product = { "@type": "Product", url: page.href, offers: offer };
const html = (value) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
const read = (value) => parsePurchasePriceQuote(html(value), page, options);

test("price quote combines a current in-stock offer and an exact nationwide delivery rate", async () => {
  assert.deepEqual(read({ "@graph": [product] }), { itemMinor: 30001, deliveryMinor: 9999, totalMinor: 40000, currency: "RUB", store: "shop.example", url: page.href });
  assert.equal(read({ ...product, offers: { ...offer, shippingDetails: { ...delivery, shippingRate: { ...rate, value: 0 } } } }).deliveryMinor, 0);
  assert.equal(purchasePriceSource(`${page.href}?utm_source=test&color=black#details`), `${page.href}?color=black`);
  assert.equal(await readPurchasePriceQuote(page.href, options, async () => ({ html: html(product), url: page, truncated: true })), null);
  assert.equal(await readPurchasePriceQuote(page.href, options, async () => ({ html: html(product), url: new URL("https://shop.example/other") })), null);
});

test("price quote rejects incomplete, conditional, mismatched and unavailable offers", () => {
  for (const change of [
    { shippingDetails: undefined },
    { shippingDetails: { ...delivery, shippingDestination: { ...destination, postalCode: "101000" } } },
    { shippingDetails: { ...delivery, shippingDestination: { ...destination, addressCountry: "BY" } } },
    { shippingDetails: { ...delivery, shippingRate: { ...rate, currency: "EUR" } } },
    { shippingDetails: { ...delivery, shippingRate: { ...rate, orderValue: { minValue: 500 }, value: "бесплатно от 500" } } },
    { shippingDetails: [delivery, { ...delivery, doesNotShip: true }] },
    { priceValidUntil: "2026-11-15" },
    { availability: "https://schema.org/OutOfStock" },
    { url: `${page.href}?variant=other` },
    { price: "300.001" },
  ]) assert.equal(read({ ...product, offers: { ...offer, ...change } }), null, JSON.stringify(change));
  assert.equal(read([{ ...product, url: "https://shop.example/other", offers: { ...offer, url: "https://shop.example/other" } }]), null);
});

test("comparison uses the estimated calendar days of the priced delivery option", () => {
  const days = (minValue, maxValue) => ({ "@type": "QuantitativeValue", unitCode: "DAY", minValue, maxValue });
  const timing = { "@type": "ShippingDeliveryTime", handlingTime: days(0, 1), transitTime: days(2, 4) };
  assert.deepEqual(read({ ...product, offers: { ...offer, shippingDetails: [
    { ...delivery, deliveryTime: timing },
    { ...delivery, shippingRate: { ...rate, value: 150 }, deliveryTime: { ...timing, transitTime: days(1, 1) } },
  ] } }).deliveryDays, { min: 2, max: 5 });
  const businessDayQuote = read({ ...product, offers: { ...offer, shippingDetails: {
    ...delivery, deliveryTime: { ...timing, businessDays: { "@type": "OpeningHoursSpecification" } },
  } } });
  assert.equal(businessDayQuote.totalMinor, 40000);
  assert.equal(businessDayQuote.deliveryDays, undefined);
});
