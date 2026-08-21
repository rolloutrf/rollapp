import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";

const DEFAULT_AUTHORIZE_URL = "https://oauth.yandex.ru/authorize";
const DEFAULT_TOKEN_URL = "https://oauth.yandex.ru/token";
const DEFAULT_USER_INFO_URL = "https://login.yandex.ru/info";
const OAUTH_COOKIE_TTL_MS = 10 * 60 * 1_000;
const emailSchema = z.string().trim().toLowerCase().email().max(160);

export class YandexAuthError extends Error {
  constructor(message, code, status = 401, options) {
    super(message, options);
    this.name = "YandexAuthError";
    this.code = code;
    this.status = status;
  }
}

function validHttpUrl(value, { allowHttp = false } = {}) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.username || url.password || url.hash) return "";
    if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function firstPublicOrigin(env) {
  const candidates = [
    env.PUBLIC_APP_URL,
    ...String(env.APP_ORIGIN || "").split(","),
  ];
  for (const candidate of candidates) {
    const parsed = validHttpUrl(candidate, { allowHttp: env.NODE_ENV !== "production" });
    if (!parsed) continue;
    return new URL(parsed).origin;
  }
  return "";
}

function testEndpoint(env, key, fallback) {
  if (env.NODE_ENV !== "test") return fallback;
  return validHttpUrl(env[key], { allowHttp: true }) || fallback;
}

export function getYandexAuthConfig(env = process.env) {
  const clientId = String(env.YANDEX_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = String(env.YANDEX_OAUTH_CLIENT_SECRET || "").trim();
  const explicitRedirect = validHttpUrl(env.YANDEX_OAUTH_REDIRECT_URI, {
    allowHttp: env.NODE_ENV !== "production",
  });
  const publicOrigin = firstPublicOrigin(env);
  const redirectUri = explicitRedirect || (publicOrigin
    ? new URL("/api/auth/yandex/callback", `${publicOrigin}/`).toString()
    : "");

  return {
    enabled: Boolean(clientId && clientSecret && redirectUri),
    clientId,
    clientSecret,
    redirectUri,
    authorizeUrl: testEndpoint(env, "YANDEX_OAUTH_TEST_AUTHORIZE_URL", DEFAULT_AUTHORIZE_URL),
    tokenUrl: testEndpoint(env, "YANDEX_OAUTH_TEST_TOKEN_URL", DEFAULT_TOKEN_URL),
    userInfoUrl: testEndpoint(env, "YANDEX_OAUTH_TEST_USER_INFO_URL", DEFAULT_USER_INFO_URL),
  };
}

export function safeOauthReturnPath(value, fallback = "/app/wishes") {
  if (typeof value !== "string" || value.length > 2_000) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) {
    return fallback;
  }
  try {
    const parsed = new URL(value, "https://rollapp.invalid");
    if (parsed.origin !== "https://rollapp.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function createYandexAuthorization(config, { nextPath, linkUserId = null, now = Date.now() } = {}) {
  if (!config?.enabled) {
    throw new YandexAuthError("Вход через Яндекс ID не настроен", "YANDEX_AUTH_UNAVAILABLE", 503);
  }
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(64).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  const authorizationUrl = new URL(config.authorizeUrl);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", config.clientId);
  authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizationUrl.searchParams.set("scope", "login:info login:email");
  authorizationUrl.searchParams.set("optional_scope", "login:avatar");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", challenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  return {
    authorizationUrl: authorizationUrl.toString(),
    cookieValue: state,
    expiresAt: new Date(now + OAUTH_COOKIE_TTL_MS),
    state,
    attempt: {
      stateHash: createHash("sha256").update(state).digest("hex"),
      verifier,
      nextPath: safeOauthReturnPath(nextPath),
      purpose: linkUserId ? "link" : "login",
      userId: linkUserId || null,
    },
  };
}

export function readYandexAuthorization(cookieValue, returnedState) {
  const invalid = () => {
    throw new YandexAuthError(
      "Сессия входа через Яндекс истекла. Попробуйте ещё раз",
      "YANDEX_STATE_INVALID",
      400,
    );
  };
  if (typeof cookieValue !== "string" || typeof returnedState !== "string") invalid();
  if (!/^[A-Za-z0-9_-]{43}$/.test(cookieValue) || !/^[A-Za-z0-9_-]{43}$/.test(returnedState)) invalid();
  const expected = Buffer.from(cookieValue);
  const received = Buffer.from(returnedState);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) invalid();
  return createHash("sha256").update(returnedState).digest("hex");
}

async function readBoundedJson(response) {
  const body = await response.text();
  if (body.length > 64 * 1_024) throw new Error("OAuth response is too large");
  return JSON.parse(body);
}

function requestSignal(timeoutMs = 10_000) {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
}

export async function exchangeYandexCode(config, { code, verifier, fetchImpl = fetch } = {}) {
  if (!config?.enabled
    || typeof code !== "string"
    || code.length < 1
    || code.length > 4_096
    || typeof verifier !== "string"
    || !/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) {
    throw new YandexAuthError("Яндекс не подтвердил вход", "YANDEX_CODE_INVALID", 400);
  }
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
  });
  let response;
  try {
    response = await fetchImpl(config.tokenUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      redirect: "error",
      signal: requestSignal(),
    });
  } catch (cause) {
    throw new YandexAuthError("Яндекс ID временно недоступен", "YANDEX_PROVIDER_UNAVAILABLE", 502, { cause });
  }
  let payload;
  try {
    payload = await readBoundedJson(response);
  } catch {
    payload = null;
  }
  if (!response.ok
    || typeof payload?.access_token !== "string"
    || payload.access_token.length < 1
    || payload.access_token.length > 8_192) {
    throw new YandexAuthError("Яндекс не подтвердил вход", "YANDEX_TOKEN_REJECTED", 401);
  }
  return payload.access_token;
}

function cleanText(value, maximum = 160) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
}

export function normalizeYandexProfile(payload, expectedClientId) {
  const id = cleanText(payload?.id, 128);
  const clientId = cleanText(payload?.client_id, 256);
  const emailCandidates = [payload?.default_email, ...(Array.isArray(payload?.emails) ? payload.emails : [])];
  const email = emailCandidates
    .map((candidate) => emailSchema.safeParse(candidate))
    .find((candidate) => candidate.success)?.data || "";
  if (!id || !/^[A-Za-z0-9._-]+$/.test(id) || clientId !== expectedClientId) {
    throw new YandexAuthError("Яндекс вернул некорректный профиль", "YANDEX_PROFILE_INVALID", 502);
  }
  if (!email) {
    throw new YandexAuthError("Разрешите Яндексу передать email для входа", "YANDEX_EMAIL_REQUIRED", 400);
  }

  const firstName = cleanText(payload?.first_name, 80);
  const lastName = cleanText(payload?.last_name, 80);
  const login = cleanText(payload?.login, 160);
  const combinedName = cleanText(`${firstName} ${lastName}`, 80);
  const name = cleanText(payload?.real_name, 80)
    || combinedName
    || cleanText(payload?.display_name, 80)
    || login
    || "Пользователь Яндекса";
  const avatarId = payload?.is_avatar_empty ? "" : cleanText(payload?.default_avatar_id, 256);
  const avatarUrl = avatarId && /^[A-Za-z0-9/_-]+$/.test(avatarId)
    ? `https://avatars.yandex.net/get-yapic/${avatarId}/islands-200`
    : "";

  return {
    id,
    email,
    login,
    name,
    firstName,
    lastName,
    avatarUrl,
  };
}

export async function fetchYandexProfile(config, accessToken, { fetchImpl = fetch } = {}) {
  const userInfoUrl = new URL(config.userInfoUrl);
  userInfoUrl.searchParams.set("format", "json");
  let response;
  try {
    response = await fetchImpl(userInfoUrl, {
      headers: { Authorization: `OAuth ${accessToken}` },
      redirect: "error",
      signal: requestSignal(),
    });
  } catch {
    throw new YandexAuthError("Яндекс ID временно недоступен", "YANDEX_PROVIDER_UNAVAILABLE", 502);
  }
  let payload;
  try {
    payload = await readBoundedJson(response);
  } catch {
    payload = null;
  }
  if (!response.ok || !payload) {
    throw new YandexAuthError("Не удалось получить профиль Яндекса", "YANDEX_PROFILE_REJECTED", 502);
  }
  return normalizeYandexProfile(payload, config.clientId);
}
