import assert from "node:assert/strict";
import test from "node:test";
import { matchRoutes } from "react-router";
import {
  APP_CATALOG_ITEM_ROUTE_PATH,
  APP_SHELL_ROUTE_PATH,
  APP_WISH_CATALOG_PATH,
  PUBLIC_WISH_ROUTE_PATH,
  businessMarketplacePath,
} from "./app-routing.js";

test("the application catalog route wins over the clean public wish route", () => {
  const matches = matchRoutes([
    { id: "catalog", path: APP_WISH_CATALOG_PATH },
    { id: "app", path: APP_SHELL_ROUTE_PATH },
    { id: "public-wish", path: PUBLIC_WISH_ROUTE_PATH },
  ], APP_WISH_CATALOG_PATH);

  assert.equal(matches?.at(-1)?.route.id, "catalog");
});

test("sphere business routes expose stores, while catalog stays in Wishlist", () => {
  for (const sphere of ["identity", "career", "education", "health", "contacts"]) {
    assert.equal(businessMarketplacePath(sphere, "catalog"), null);
    assert.equal(businessMarketplacePath(sphere), `/app/spheres/${sphere}/business/store`);
  }
  assert.equal(businessMarketplacePath("health", "store"), "/app/spheres/health/business/store");
  assert.equal(businessMarketplacePath("unknown", "unknown"), null);
  assert.equal(businessMarketplacePath("wishlist", "catalog"), null);
  assert.equal(APP_WISH_CATALOG_PATH, "/app/wishes/catalog");
});

test("catalog item has an independent route instead of falling into the application shell", () => {
  const matches = matchRoutes([
    { id: "catalog-item", path: APP_CATALOG_ITEM_ROUTE_PATH },
    { id: "catalog", path: APP_WISH_CATALOG_PATH },
    { id: "app", path: APP_SHELL_ROUTE_PATH },
    { id: "public-wish", path: PUBLIC_WISH_ROUTE_PATH },
  ], `${APP_WISH_CATALOG_PATH}/item/external%3Aohmywishes%3A123`);
  assert.equal(matches.at(-1).route.id, "catalog-item");
  assert.equal(matches.at(-1).params.itemId, "external:ohmywishes:123");
});

test("wish detail pages cover public and shared URLs while excluding the application shell", async () => {
  const { isPublicWishDetailPath } = await import('./app-routing.js');
  assert.equal(isPublicWishDetailPath('/synthetic-user/wishes/123'), true);
  assert.equal(isPublicWishDetailPath('/s/shared-token/wishes/123'), true);
  assert.equal(isPublicWishDetailPath('/app/wishes/catalog'), false);
  assert.equal(isPublicWishDetailPath('/synthetic-user/lists/123'), false);
});
