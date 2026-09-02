import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeOhMyWishesIdea,
  ohMyWishesCatalogRecord,
  ohMyWishesSpaceForCategories,
} from "./ohmywishes-catalog.js";

test("maps the dedicated OhMyWishes categories to Rollapp spaces", () => {
  assert.equal(ohMyWishesSpaceForCategories(["electronics"]), "products");
  assert.equal(ohMyWishesSpaceForCategories(["travel"]), "places");
  assert.equal(ohMyWishesSpaceForCategories(["automotive"]), "transport");
  assert.equal(ohMyWishesSpaceForCategories(["home-garden", "grocery-gourmet"]), "food");
});

test("deduplicates ideas and preserves every source category", () => {
  const items = new Map();
  const idea = {
    id: "idea-1",
    title: "Электронная книга",
    photos: [{ image: { url: "https://cdn.example/original.webp", thumbnails: [{ url: "https://cdn.example/500.webp", width: 500 }] } }],
    price: { price: 31990, currency: "RUB" },
  };
  mergeOhMyWishesIdea(items, idea, { slug: "electronics" }, 8);
  mergeOhMyWishesIdea(items, idea, { slug: "budget-gifts" }, 18);

  assert.equal(items.size, 1);
  const record = ohMyWishesCatalogRecord(items.get("idea-1"));
  assert.equal(record.imageUrl, "https://cdn.example/500.webp");
  assert.equal(record.price, 31990);
  assert.match(record.url, /\/selections\/electronics\/ideas\/idea-1$/);
  assert.deepEqual(JSON.parse(record.categoriesJson), ["budget-gifts", "electronics"]);
});
