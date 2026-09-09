import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalCatalogUrl, catalogActionKey, catalogIdentityKey, externalCatalogItemId, externalCatalogReference, groupCatalogRows, preservedCatalogRow,
} from "./wish-catalog.js";

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

test("removing the last personal wish keeps a reloadable catalog entry with no owners", () => {
  const original = row({ space: "places", title: "Кофейня" });
  const before = groupCatalogRows([original])[0];
  const persisted = JSON.parse(JSON.stringify(preservedCatalogRow(original)));
  const after = groupCatalogRows([persisted])[0];
  assert.equal(after.id, before.id);
  assert.equal(after.title, before.title);
  assert.equal(after.space, "places");
  assert.equal(after.createdAt, before.createdAt);
  assert.equal(catalogActionKey(after), catalogActionKey(before));
  assert.equal(after.ownerCount, 0);
  assert.equal(after.wishCount, 0);
  assert.deepEqual(after.owners, []);
});

test("preserved cards merge with remaining and re-added wishes without duplicates or stale owners", () => {
  const original = row();
  const snapshot = preservedCatalogRow(original);
  const another = row({ id: "wish-2", owner_id: "user-2", created_at: "2026-09-03T10:00:00.000Z" });
  const catalog = groupCatalogRows([another, snapshot]);
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].id, original.id);
  assert.equal(catalog[0].ownerCount, 1);
  assert.equal(catalog[0].wishCount, 1);
  assert.equal(catalog[0].owners[0].id, "user-2");
  assert.equal(groupCatalogRows([original, another, snapshot])[0].wishCount, 2);
});

test("catalog snapshots contain card data only, without owner identities or private wish state", () => {
  const snapshot = preservedCatalogRow(row({ user_id: "private-user", privacy: "inherit", catalog_item_key: "key", status: "active", sort_order: 4 }));
  for (const key of ["owner_id", "owner_username", "owner_name", "owner_avatar_url", "user_id", "privacy", "status", "catalog_item_key", "sort_order"]) {
    assert.equal(Object.hasOwn(snapshot, key), false);
  }
  assert.equal(snapshot._catalogSnapshot, true);
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

test("catalog identity accepts grouped camelCase fields", () => {
  const groupedVehicle = {
    id: "car-group",
    space: "transport",
    title: "Porsche 911",
    vehicleMake: "Porsche",
    vehicleModel: "911",
  };
  assert.equal(
    catalogIdentityKey(groupedVehicle),
    catalogIdentityKey(row({ space: "transport", vehicle_make: "porsche", vehicle_model: "911" })),
  );
});

test("catalog action keys keep external ids stable and namespace native groups", () => {
  assert.deepEqual(
    externalCatalogReference(externalCatalogItemId("provider:media", "media:42")),
    { source: "provider:media", externalId: "media:42" },
  );
  assert.equal(catalogActionKey({ id: "external:ohmywishes:media:42" }), "external:ohmywishes:media:42");
  assert.equal(
    catalogActionKey(row()),
    "native:v1:products:title:shokz openswim pro grey",
  );
});

test("a new copy does not change a catalog group's representative or page order", () => {
  const firstGroup = row({ id: "first-original", title: "Первая позиция", created_at: "2026-09-01T10:00:00.000Z" });
  const secondGroup = row({ id: "second-original", title: "Вторая позиция", created_at: "2026-09-02T10:00:00.000Z" });
  const before = groupCatalogRows([secondGroup, firstGroup]);
  const after = groupCatalogRows([
    row({ id: "first-copy", title: firstGroup.title, owner_id: "user-2", created_at: "2026-09-03T10:00:00.000Z" }),
    secondGroup,
    firstGroup,
  ]);

  assert.deepEqual(before.map((item) => item.id), ["second-original", "first-original"]);
  assert.deepEqual(after.map((item) => item.id), ["second-original", "first-original"]);
});
