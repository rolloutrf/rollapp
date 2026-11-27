import assert from "node:assert/strict";
import test from "node:test";
import { mapFrameContentSecurityPolicy } from "./map-frame-csp.js";

test("the isolated map frame permits only the Yandex Maps runtime domains", () => {
  assert.match(mapFrameContentSecurityPolicy, /frame-ancestors 'self'/);
  assert.match(mapFrameContentSecurityPolicy, /script-src 'self' https:\/\/api-maps\.yandex\.ru/);
  assert.match(mapFrameContentSecurityPolicy, /https:\/\/\*\.maps\.yandex\.net/);
  assert.match(mapFrameContentSecurityPolicy, /'unsafe-eval'/);
  assert.doesNotMatch(mapFrameContentSecurityPolicy, /default-src \*/);
});
