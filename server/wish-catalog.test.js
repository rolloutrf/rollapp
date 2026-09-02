import assert from "node:assert/strict";
import test from "node:test";
import { canonicalCatalogUrl, catalogIdentityKey, groupCatalogRows } from "./wish-catalog.js";

const row = (overrides = {}) => ({
  id: "wish-1",
  source_wish_id: null,
  title: "Shokz OpenSwim Pro Grey",
  description: "",
  url: "https://example.com/shokz?utm_source=rollapp",
  image_url: "",
  fundraising_url: "",
  vehicle_make: "",
  vehicle_model: "",
  price: "16000",
  currency: "RUB",
  event_date: null,
  space: "products",
  created_at: "2026-09-02T10:00:00.000Z",
  owner_id: "user-1",
  owner_username: "mikhail",
  owner_name: "Михаил",
  owner_avatar_url: "/avatars/mikhail.jpg",
  ...overrides,
});

test("canonicalCatalogUrl removes tracking parameters and normalizes the host", () => {
  assert.equal(
    canonicalCatalogUrl("https://WWW.Example.com/item/?utm_source=test&color=black#details"),
    "https://example.com/item?color=black",
  );
});

test("groupCatalogRows merges equal public positions and keeps unique owners", () => {
  const items = groupCatalogRows([
    row(),
    row({ id: "wish-2", owner_id: "user-2", owner_username: "alisa", owner_name: "Алиса", image_url: "https://cdn.example.com/shokz.jpg" }),
    row({ id: "wish-3", owner_id: "user-1", url: "https://another.example.com/shokz" }),
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].wishCount, 3);
  assert.equal(items[0].ownerCount, 2);
  assert.deepEqual(items[0].owners.map((owner) => owner.id), ["user-1", "user-2"]);
  assert.equal(items[0].imageUrl, "https://cdn.example.com/shokz.jpg");
});

test("transport positions use make and model while spaces remain isolated", () => {
  const firstVehicle = row({ id: "car-1", space: "transport", title: "Porsche 911 из Москвы", vehicle_make: "Porsche", vehicle_model: "911" });
  const secondVehicle = row({ id: "car-2", space: "transport", title: "911 Carrera", vehicle_make: "porsche", vehicle_model: "911", owner_id: "user-2" });
  assert.equal(catalogIdentityKey(firstVehicle), catalogIdentityKey(secondVehicle));

  const items = groupCatalogRows([
    firstVehicle,
    secondVehicle,
    row({ id: "place-1", space: "places", title: firstVehicle.title }),
  ]);
  assert.equal(items.length, 2);
  assert.equal(items.find((item) => item.space === "transport").ownerCount, 2);
});
