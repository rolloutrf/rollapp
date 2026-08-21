import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createYandexAuthorization,
  exchangeYandexCode,
  fetchYandexProfile,
  getYandexAuthConfig,
  normalizeYandexProfile,
  readYandexAuthorization,
  safeOauthReturnPath,
} from "./yandex-auth.js";

const clientSecret = "test-secret-that-is-long-enough-for-oauth";
const config = getYandexAuthConfig({
  NODE_ENV: "test",
  PUBLIC_APP_URL: "http://127.0.0.1:5173",
  YANDEX_OAUTH_CLIENT_ID: "rollapp-test-client",
  YANDEX_OAUTH_CLIENT_SECRET: clientSecret,
  YANDEX_OAUTH_TEST_AUTHORIZE_URL: "http://127.0.0.1:9191/authorize",
  YANDEX_OAUTH_TEST_TOKEN_URL: "http://127.0.0.1:9191/token",
  YANDEX_OAUTH_TEST_USER_INFO_URL: "http://127.0.0.1:9191/info",
});

test("Yandex OAuth config derives the callback only when credentials and a safe public URL exist", () => {
  assert.equal(getYandexAuthConfig({ NODE_ENV: "production", PUBLIC_APP_URL: "https://rollapp.example" }).enabled, false);
  assert.deepEqual({
    enabled: config.enabled,
    redirectUri: config.redirectUri,
  }, {
    enabled: true,
    redirectUri: "http://127.0.0.1:5173/api/auth/yandex/callback",
  });
  const production = getYandexAuthConfig({
    NODE_ENV: "production",
    PUBLIC_APP_URL: "http://rollapp.example",
    YANDEX_OAUTH_REDIRECT_URI: "http://rollapp.example/api/auth/yandex/callback",
    YANDEX_OAUTH_CLIENT_ID: "client",
    YANDEX_OAUTH_CLIENT_SECRET: clientSecret,
  });
  assert.equal(production.enabled, false);
});

test("authorization uses one-time state, PKCE S256, minimal scopes and a safe return path", () => {
  const authorization = createYandexAuthorization(config, {
    nextPath: "/app/friends/subscriptions?from=auth",
    linkUserId: "user-1",
    now: 1_700_000_000_000,
  });
  const url = new URL(authorization.authorizationUrl);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "login:info login:email");
  assert.equal(url.searchParams.get("optional_scope"), "login:avatar");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    url.searchParams.get("code_challenge"),
    createHash("sha256").update(authorization.attempt.verifier).digest("base64url"),
  );
  assert.equal(authorization.cookieValue, authorization.state);
  assert.equal(authorization.attempt.nextPath, "/app/friends/subscriptions?from=auth");
  assert.equal(authorization.attempt.purpose, "link");
  assert.equal(authorization.attempt.userId, "user-1");
  assert.equal(readYandexAuthorization(authorization.cookieValue, authorization.state), authorization.attempt.stateHash);
  assert.throws(
    () => readYandexAuthorization(authorization.cookieValue, `${authorization.state.slice(0, -1)}x`),
    (error) => error.code === "YANDEX_STATE_INVALID",
  );
});

test("OAuth return paths reject external, protocol-relative and backslash redirects", () => {
  assert.equal(safeOauthReturnPath("/app/wishes?space=food#top"), "/app/wishes?space=food#top");
  assert.equal(safeOauthReturnPath("https://evil.example"), "/app/wishes");
  assert.equal(safeOauthReturnPath("//evil.example/path"), "/app/wishes");
  assert.equal(safeOauthReturnPath("/\\evil.example/path"), "/app/wishes");
});

test("token exchange sends Basic client auth and PKCE without leaking redirect URI", async () => {
  let request;
  const accessToken = await exchangeYandexCode(config, {
    code: "authorization-code",
    verifier: "a".repeat(64),
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return new Response(JSON.stringify({ access_token: "oauth-token", token_type: "bearer" }), { status: 200 });
    },
  });
  assert.equal(accessToken, "oauth-token");
  assert.equal(request.url, config.tokenUrl);
  assert.equal(request.options.headers.Authorization, `Basic ${Buffer.from(`rollapp-test-client:${clientSecret}`).toString("base64")}`);
  const body = new URLSearchParams(request.options.body);
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("code_verifier"), "a".repeat(64));
  assert.equal(body.has("redirect_uri"), false);
  await assert.rejects(
    exchangeYandexCode(config, {
      code: "authorization-code",
      verifier: "a".repeat(64),
      fetchImpl: async () => new Response(JSON.stringify({ access_token: "" }), { status: 200 }),
    }),
    (error) => error.code === "YANDEX_TOKEN_REJECTED",
  );
});

test("userinfo uses the OAuth header and normalizes only the configured client profile", async () => {
  let request;
  const profile = await fetchYandexProfile(config, "oauth-token", {
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return new Response(JSON.stringify({
        id: "1000034426",
        client_id: "rollapp-test-client",
        login: "ivan",
        first_name: " Иван ",
        last_name: "Иванов",
        default_email: "IVAN@EXAMPLE.COM",
        default_avatar_id: "131652443",
        is_avatar_empty: false,
      }), { status: 200 });
    },
  });
  assert.equal(new URL(request.url).searchParams.get("format"), "json");
  assert.equal(request.options.headers.Authorization, "OAuth oauth-token");
  assert.deepEqual(profile, {
    id: "1000034426",
    email: "ivan@example.com",
    login: "ivan",
    name: "Иван Иванов",
    firstName: "Иван",
    lastName: "Иванов",
    avatarUrl: "https://avatars.yandex.net/get-yapic/131652443/islands-200",
  });
  assert.throws(
    () => normalizeYandexProfile({ id: "42", client_id: "another-client", default_email: "a@example.com" }, config.clientId),
    (error) => error.code === "YANDEX_PROFILE_INVALID",
  );
  assert.throws(
    () => normalizeYandexProfile({ id: "42", client_id: config.clientId }, config.clientId),
    (error) => error.code === "YANDEX_EMAIL_REQUIRED",
  );
});
