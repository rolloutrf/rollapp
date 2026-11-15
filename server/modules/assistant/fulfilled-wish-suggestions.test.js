import assert from "node:assert/strict";
import test from "node:test";
import { buildFulfilledWishSuggestions } from "./fulfilled-wish-suggestions.js";

const fulfilled = (overrides = {}) => ({
  id: "fulfilled-1",
  title: "Shokz OpenSwim Pro Grey",
  url: "https://market.example/shokz",
  image_url: "/images/shokz.jpg",
  source_wish_id: null,
  space: "products",
  ...overrides,
});

const candidate = (overrides = {}) => ({
  id: "candidate-1",
  title: "Shokz OpenSwim Pro Grey",
  url: "",
  source_wish_id: null,
  space: "products",
  owner_id: "user-2",
  owner_username: "alisa",
  owner_name: "Алиса",
  owner_avatar_url: "/avatars/alisa.jpg",
  ...overrides,
});

test("fulfilled suggestions return unique participants for the same catalog item", () => {
  const items = buildFulfilledWishSuggestions([
    fulfilled(),
  ], [
    candidate(),
    candidate({ id: "candidate-2" }),
    candidate({ id: "candidate-3", owner_id: "user-3", owner_username: "boris", owner_name: "Борис" }),
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].participantCount, 2);
  assert.deepEqual(items[0].participants.map((person) => person.name), ["Алиса", "Борис"]);
});

test("fulfilled suggestions match copied wishes and keep spaces isolated", () => {
  const source = fulfilled({ id: "original", title: "Старое название" });
  const items = buildFulfilledWishSuggestions([source], [
    candidate({ title: "Новое название", source_wish_id: "original" }),
    candidate({ id: "place", title: source.title, space: "places", owner_id: "user-4" }),
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].participantCount, 1);
  assert.equal(items[0].participants[0].username, "alisa");
});

test("fulfilled suggestions use make and model for transport", () => {
  const items = buildFulfilledWishSuggestions([
    fulfilled({ id: "car", title: "Моя машина", space: "transport", vehicle_make: "Porsche", vehicle_model: "911" }),
  ], [
    candidate({ title: "911 Carrera", space: "transport", vehicle_make: "porsche", vehicle_model: "911" }),
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].participants[0].name, "Алиса");
});
