import assert from "node:assert/strict";
import test from "node:test";
import { matchRoutes } from "react-router";
import {
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

test("business marketplace routes stay inside their sphere", () => {
  assert.equal(businessMarketplacePath("career", "catalog"), "/app/spheres/career/business/catalog");
  assert.equal(businessMarketplacePath("health", "store"), "/app/spheres/health/business/store");
  assert.equal(businessMarketplacePath("unknown", "unknown"), "/app/spheres/identity/business/catalog");
});
