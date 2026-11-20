import assert from "node:assert/strict";
import test from "node:test";
import { inviteTokenFromLink, safeNextPath, yandexAuthErrorDetails, yandexAuthStartPath } from "./auth.js";

test("a pasted invitation recovers only the token from a Rollapp registration URL", () => {
  const origin = "https://rollapp.example";
  const token = "a".repeat(43);
  const signed = `v1.00000000-0000-0000-0000-000000000000.${token}`;
  assert.equal(inviteTokenFromLink(` ${origin}/register?next=%2Flogin#invite=${token} `, origin), token);
  assert.equal(inviteTokenFromLink(`${origin}/регистрация/#приглашение=${signed}`, origin), signed);
  assert.equal(inviteTokenFromLink(`https://example.org/register#invite=${token}`, origin), "");
  assert.equal(inviteTokenFromLink(`${origin}/login#invite=${token}`, origin), "");
  assert.equal(inviteTokenFromLink(`${origin}/register?invite=${token}`, origin), "");
  assert.equal(inviteTokenFromLink(`${origin}/register#invite=${"a".repeat(129)}`, origin), "");
  assert.equal(inviteTokenFromLink("не ссылка", origin), "");
});

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
  assert.equal(
    yandexAuthStartPath("/app/member-number", { invite: "opaque" }),
    "/api/auth/yandex/start?invite=opaque&next=%2Fapp%2Fmember-number",
  );
});

test("Yandex callback errors map to safe local copy", () => {
  assert.equal(yandexAuthErrorDetails("YANDEX_LINK_REQUIRED").linkRequired, true);
  assert.match(yandexAuthErrorDetails("YANDEX_LINK_REQUIRED").description, /настройки профиля/);
  assert.match(yandexAuthErrorDetails("YANDEX_LINK_REQUIRED", { legacySignInEnabled: true }).description, /по email/);
  assert.equal(yandexAuthErrorDetails("unknown-provider-text"), yandexAuthErrorDetails("YANDEX_PROVIDER_ERROR"));
  assert.match(yandexAuthErrorDetails("YANDEX_EMAIL_REQUIRED", { registering: true }).description, /разрешите передать адрес почты выбранного аккаунта/);
  assert.doesNotMatch(yandexAuthErrorDetails("YANDEX_EMAIL_REQUIRED").description, /приглашени/);
  assert.equal(yandexAuthErrorDetails("constructor"), yandexAuthErrorDetails("YANDEX_PROVIDER_ERROR"));
  assert.equal(yandexAuthErrorDetails(""), null);
});
