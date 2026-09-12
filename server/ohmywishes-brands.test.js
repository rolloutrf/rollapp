import assert from "node:assert/strict";
import test from "node:test";
import { ohMyWishesBrandItem, ohMyWishesRecommendationItem } from "./ohmywishes-brands.js";
import { catalogActionKey, externalCatalogReference } from "./wish-catalog.js";

test("brand cards retain the provider identity for wishlist actions and link to the brand's idea", () => {
  const brand = { id: "brand-1", slug: "bork.ru", label: "BORK", logoUrl: "https://cdn.example/bork-logo.webp" };
  const item = ohMyWishesBrandItem({
    id: "idea-1", title: "Щётка", price: { price: 27000, currency: "RUB" },
    photos: [{ image: { url: "https://cdn.example/full.webp", thumbnails: [{ width: 405, url: "https://cdn.example/small.webp" }] } }],
  }, brand);
  assert.deepEqual(externalCatalogReference(item.id), { source: "ohmywishes", externalId: "idea-1" });
  assert.equal(catalogActionKey(item), "external:ohmywishes:idea-1");
  assert.equal(item.url, "https://ohmywishes.com/users/bork.ru/ideas/idea-1");
  assert.equal(item.imageUrl, "https://cdn.example/small.webp");
  assert.equal(item.price, 27000);
  assert.equal(item.brand.label, "BORK");
  assert.equal(item.brand.logoUrl, "https://cdn.example/bork-logo.webp");
  assert.equal(item.ownerCount, 0);
  assert.deepEqual(item.owners, []);
});

test("brand cards preserve absent and zero prices without inventing an amount", () => {
  const brand = { slug: "test" };
  assert.equal(ohMyWishesBrandItem({ id: "1", title: "Без цены" }, brand).price, null);
  assert.equal(ohMyWishesBrandItem({ id: "2", price: { price: 0 } }, brand).price, 0);
});

test("recommendation cards remain separate from seller storefronts", () => {
  const item = ohMyWishesRecommendationItem({ id: "idea-3", title: "Идея", photos: [] });
  assert.equal(item.id, "external:ohmywishes:idea-3");
  assert.equal(item.brand, undefined);
  assert.equal(item.url, "https://ohmywishes.com/selections/for-you/ideas/idea-3");
  assert.equal(item.space, "products");
});
