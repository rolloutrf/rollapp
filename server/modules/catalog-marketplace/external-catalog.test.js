import assert from "node:assert/strict";
import test from "node:test";
import { externalCatalogItemFromRow } from "./external-catalog.js";
import { externalCatalogReference } from "./wish-catalog.js";

test("normalizes an external catalog row without inventing an owner", () => {
  const item = externalCatalogItemFromRow({
    source: "ohmywishes",
    external_id: "idea-1",
    title: "Электронная книга",
    url: "https://ohmywishes.com/ru/selections/books/ideas/idea-1",
    image_url: "https://cdn.example/book.webp",
    price: "31990.00",
    currency: "RUB",
    space: "products",
    source_label: "OhMyWishes",
    source_home_url: "https://ohmywishes.com/ru/",
    source_logo_url: "https://ohmywishes.com/favicon.svg",
    categories_json: '["books"]',
  });

  assert.equal(item.id, "external:ohmywishes:idea-1");
  assert.equal(item.price, 31990);
  assert.equal(item.ownerCount, 0);
  assert.deepEqual(item.owners, []);
  assert.deepEqual(item.categories, ["books"]);
  assert.equal(item.source.label, "OhMyWishes");
});

test("external item ids remain reversible when provider keys contain separators", () => {
  const item = externalCatalogItemFromRow({
    source: "provider:media",
    external_id: "book:42",
    title: "Книга",
    url: "https://example.com/book/42",
    source_label: "Provider",
    source_home_url: "https://example.com",
  });

  assert.deepEqual(externalCatalogReference(item.id), {
    source: "provider:media",
    externalId: "book:42",
  });
});
