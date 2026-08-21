import assert from "node:assert/strict";
import test from "node:test";
import { safeNextPath, yandexAuthErrorDetails, yandexAuthStartPath } from "./auth.js";

test("safeNextPath keeps only local application paths", () => {
  assert.equal(safeNextPath("/app/wishes?space=food#top"), "/app/wishes?space=food#top");
  assert.equal(safeNextPath("https://evil.example"), "/app/wishes");
  assert.equal(safeNextPath("//evil.example/path"), "/app/wishes");
  assert.equal(safeNextPath("/\\evil.example/path"), "/app/wishes");
  assert.equal(safeNextPath("/app/wishes\nLocation:https://evil.example"), "/app/wishes");
});

test("Yandex start paths preserve an encoded local destination", () => {
  assert.equal(
    yandexAuthStartPath("/app/friends/subscriptions?from=login#top"),
    "/api/auth/yandex/start?next=%2Fapp%2Ffriends%2Fsubscriptions%3Ffrom%3Dlogin%23top",
  );
  assert.equal(
    yandexAuthStartPath("//evil.example/steal", { link: true }),
    "/api/auth/yandex/start?link=1&next=%2Fapp%2Fwishes",
  );
});

test("Yandex callback errors map to safe local copy", () => {
  assert.equal(yandexAuthErrorDetails("YANDEX_LINK_REQUIRED").linkRequired, true);
  assert.equal(yandexAuthErrorDetails("unknown-provider-text"), yandexAuthErrorDetails("YANDEX_PROVIDER_ERROR"));
  assert.equal(yandexAuthErrorDetails(""), null);
});
