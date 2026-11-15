import assert from "node:assert/strict";
import test from "node:test";
import { PLATFORM_HOST, SPHERE_APPLICATIONS } from "../shared/applications.js";
import { createAccountSessions, savedSessionsCookie, sessionCookie } from "./account-sessions.js";
import { applicationSessionCookies, readBrowserSessionCookies, sphereSessionDestination } from "./application-sessions.js";
import { hashToken } from "./security.js";

const cookieConfig = applicationSessionCookies({ NODE_ENV: "production", ROLLAPP_SESSION_DOMAIN: PLATFORM_HOST });

test("production domain cookies prefer shared sessions and accept host-only legacy cookies only on HTTPS apex", () => {
  assert.equal(applicationSessionCookies({}), null);
  assert.throws(() => applicationSessionCookies({ NODE_ENV: "production", ROLLAPP_SESSION_DOMAIN: "example.org" }), /HTTPS/);
  for (const [hostname, protocol, active, saved, expected] of [
    [PLATFORM_HOST, "https", undefined, undefined, ["legacy-active", "legacy-saved"]],
    [PLATFORM_HOST, "http", undefined, undefined, [undefined, undefined]],
    [SPHERE_APPLICATIONS.health.host, "https", undefined, undefined, [undefined, undefined]],
    [PLATFORM_HOST, "https", "shared-active", undefined, ["shared-active", undefined]],
    [SPHERE_APPLICATIONS.wishlist.host, "https", "shared-active", "shared-saved", ["shared-active", "shared-saved"]],
  ]) {
    const cookies = { [sessionCookie]: "legacy-active", [savedSessionsCookie]: "legacy-saved",
      [cookieConfig.active]: active, [cookieConfig.saved]: saved };
    readBrowserSessionCookies(cookieConfig)({ hostname, protocol, cookies }, {}, () => {});
    assert.deepEqual([cookies[sessionCookie], cookies[savedSessionsCookie]], expected);
  }
});

test("legacy session handoff preserves valid saved accounts and clears legacy scope", async () => {
  const token = "a".repeat(43);
  const saved = "b".repeat(43);
  const expires = new Date("2030-01-01");
  const query = async () => ({ rows: [
    { token_hash: hashToken(token), expires_at: expires, id: "active" },
    { token_hash: hashToken(saved), expires_at: expires, id: "saved" },
  ] });
  const cookieOptions = path => ({ path, secure: true, httpOnly: true });
  const { promoteLegacySession } = createAccountSessions({ query, sessionCookieOptions: cookieOptions, domainCookies: cookieConfig });
  const changes = [];
  const res = {
    cookie: (...args) => changes.push(args),
    clearCookie: (...args) => changes.push(args),
  };
  const request = { user: { id: "active" }, cookies: { [sessionCookie]: token, [savedSessionsCookie]: saved } };
  await promoteLegacySession(request, res);
  assert.deepEqual(changes, [
    [cookieConfig.saved, saved, { ...cookieOptions("/api/auth"), domain: PLATFORM_HOST, expires }],
    [cookieConfig.active, token, { ...cookieOptions("/"), domain: PLATFORM_HOST, expires }],
    [sessionCookie, cookieOptions("/")],
    [savedSessionsCookie, cookieOptions("/api/auth")],
  ]);
  await promoteLegacySession({ ...request, cookies: { ...request.cookies, [cookieConfig.active]: token } }, res);
  assert.equal(changes.length, 4);
});

test("session handoff redirects only to registered sphere paths", () => {
  for (const { host, home } of Object.values(SPHERE_APPLICATIONS)) {
    assert.equal(sphereSessionDestination(`${home}?tab=demo#row`), `https://${host}${home}?tab=demo#row`);
  }
  assert.equal(sphereSessionDestination("/app/planning"), null);
  assert.equal(sphereSessionDestination("//example.org/app/spheres/health"), null);
});
