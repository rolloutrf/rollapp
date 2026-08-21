import "dotenv/config";
import compression from "compression";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { initializeDatabase } from "./schema.js";
import { isMemoryDatabase, pool, query, transaction } from "./db.js";
import { addDefaultFriend } from "./default-friend.js";
import { getEmailConfig, sendPasswordResetEmail } from "./email.js";
import { deleteOwnedWishGroup, removeWishFromOwnedGroup } from "./wish-groups.js";
import { fetchPublicHtml, fetchPublicJson, MetadataFetchError } from "./metadata-fetch.js";
import { resolveRetailerMetadata } from "./retailer-metadata.js";
import { canonicalRetailerProductUrl } from "../shared/retailer-previews.js";
import {
  resolvePreviewBackfillMetadata,
  selectPreviewBackfillCandidates,
} from "./preview-backfill.js";
import {
  bookmateApiUrl,
  isBookmateUrl,
  isKinopoiskUrl,
  isYandexMapsUrl,
  isYouTubeUrl,
  kinopoiskContentUrlError,
  parseBookmateMetadata,
  parseKinopoiskMetadata,
  parseProductMetadata,
  parseYandexMapsMetadata,
  parseYouTubeMetadata,
  parseYouTubeVideoId,
  youtubeThumbnailUrl,
} from "./metadata.js";
import {
  createOtpCode,
  digestIp,
  digestOtp,
  digestPhone,
  getPhoneAuthPolicy,
  maskPhone,
  normalizeRussianPhone,
  phoneLast4,
  PHONE_OTP_CODE_LENGTH,
  requirePhoneAuthSecret,
  verifyOtpDigest,
} from "./phone-auth.js";
import { isReservedProfileUsername, legacyProfileTarget, profileUsernameCandidates } from "./profile-paths.js";
import { createSessionToken, hashPassword, hashToken, slugify, verifyPassword } from "./security.js";
import { configuredTrustedOrigins, isTrustedRequestOrigin } from "./trusted-origins.js";
import { getSmsConfig, sendSms } from "./sms.js";
import {
  getTelegramAuthConfig,
  safeSecretEqual,
  TelegramInitDataError,
  validateTelegramInitData,
} from "./telegram-auth.js";
import { getTelegramBotRuntimeConfig, telegramLaunchReply } from "./telegram-bot.js";
import {
  createYandexAuthorization,
  exchangeYandexCode,
  fetchYandexProfile,
  getYandexAuthConfig,
  readYandexAuthorization,
  safeOauthReturnPath,
  YandexAuthError,
} from "./yandex-auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 8080);
const isProduction = process.env.NODE_ENV === "production";
const trustedAppOrigins = configuredTrustedOrigins(process.env.APP_ORIGIN);
const sessionCookie = "rw_session";
const yandexOauthCookiePrefix = "rw_yandex_oauth_";
const localImageUrlSchema = z.string().max(2000).regex(/^\/(?!\/)[^\s\\]*$/);
const uploadedMediaUrlPattern = /^\/api\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const avatarUrlSchema = z.union([
  z.literal(""),
  z.string().max(2000).url(),
  z.string().max(2000).refine((value) => {
    if (uploadedMediaUrlPattern.test(value)) return true;
    if (!value.startsWith("/avatars/")) return false;
    const segments = value.slice("/avatars/".length).split("/");
    return segments.length > 0 && segments.every((segment) => /^[a-z0-9_-][a-z0-9._-]*$/i.test(segment));
  }),
]);
const birthdaySchema = z.string().date().refine(
  (value) => value <= new Date().toISOString().slice(0, 10),
  { message: "Дата рождения не может быть в будущем" },
);
const listSpaceValues = ["products", "places", "events", "media", "food", "transport", "pets"];
const listSpaceSchema = z.enum(listSpaceValues);
const phoneRequestSchema = z.object({
  phone: z.string().trim().min(10).max(64),
}).strict();
const phoneVerifySchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
}).strict();
const telegramInitDataSchema = z.object({
  initData: z.string().min(1).max(16_384),
}).strict();

app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "https://telegram.org"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      frameAncestors: ["'self'", "https://web.telegram.org", "https://*.telegram.org"],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  frameguard: false,
}));
app.use(compression());
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());

function createRateLimit({ windowMs, max }) {
  const clients = new Map();
  let lastSweep = Date.now();

  return (req, res, next) => {
    const now = Date.now();
    if (clients.size > 10_000) {
      clients.clear();
      lastSweep = now;
    } else if (now - lastSweep >= windowMs) {
      for (const [key, value] of clients) {
        if (value.resetAt <= now) clients.delete(key);
      }
      lastSweep = now;
    }

    const key = req.ip || req.socket.remoteAddress || "unknown";
    const current = clients.get(key);
    if (!current || current.resetAt <= now) {
      clients.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Remaining", String(Math.max(0, max - current.count)));
    res.set("RateLimit-Reset", String(Math.ceil(current.resetAt / 1000)));
    if (current.count >= max) {
      res.set("Retry-After", String(Math.ceil((current.resetAt - now) / 1000)));
      return res.status(429).json({ error: "Слишком много попыток. Попробуйте немного позже" });
    }

    current.count += 1;
    next();
  };
}

const authRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const passwordResetRequestRateLimit = createRateLimit({
  windowMs: Math.min(60 * 60, Math.max(60, Number.parseInt(process.env.PASSWORD_RESET_IP_WINDOW_SECONDS || "900", 10) || 900)) * 1_000,
  max: Math.min(1_000, Math.max(1, Number.parseInt(process.env.PASSWORD_RESET_IP_REQUEST_LIMIT || "20", 10) || 20)),
});
const metadataRateLimit = createRateLimit({ windowMs: 5 * 60 * 1000, max: 40 });
const previewBackfillRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, max: 6 });
const imageUploadRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
const imageUploadBody = express.raw({
  type: ["image/jpeg", "image/png", "image/webp"],
  limit: "8mb",
});
const metadataCache = new Map();
const metadataCacheTtlMs = 10 * 60 * 1000;
const metadataCacheLimit = 500;
const previewBackfillJobs = new Map();
const previewBackfillCooldownMs = 15 * 60 * 1000;
const mutationLocks = new Map();
const backgroundTasks = new Set();
const imageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function detectImageMimeType(buffer) {
  if (!Buffer.isBuffer(buffer)) return "";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return "";
}

async function withMutationLock(key, callback) {
  const previous = mutationLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  mutationLocks.set(key, current);
  await previous;
  try {
    return await callback();
  } finally {
    release();
    if (mutationLocks.get(key) === current) mutationLocks.delete(key);
  }
}

function trackBackgroundTask(task) {
  backgroundTasks.add(task);
  void task.finally(() => backgroundTasks.delete(task));
}

async function backfillWishPreviews(userId) {
  const missing = await query(
    `SELECT w.id,w.url,
       (
         w.space='food'
         OR EXISTS (
           SELECT 1
           FROM wishlist_wishes ww
           JOIN wishlists l ON l.id=ww.wishlist_id
           WHERE ww.wish_id=w.id AND l.space='food'
         )
       ) AS is_food,
       (
         w.space='places'
         OR EXISTS (
           SELECT 1
           FROM wishlist_wishes ww
           JOIN wishlists l ON l.id=ww.wishlist_id
           WHERE ww.wish_id=w.id AND l.space='places'
         )
       ) AS is_place
     FROM wishes w
     WHERE w.user_id=$1 AND w.image_url='' AND w.url<>''
       AND (
         w.space IN ('food','places')
         OR EXISTS (
           SELECT 1
           FROM wishlist_wishes ww
           JOIN wishlists l ON l.id=ww.wishlist_id
           WHERE ww.wish_id=w.id AND l.space IN ('food','places')
         )
       )
     ORDER BY w.created_at DESC,w.id
     LIMIT 500`,
    [userId],
  );
  const candidates = selectPreviewBackfillCandidates(missing.rows);
  let cursor = 0;
  let updated = 0;
  let failed = 0;

  const worker = async () => {
    while (cursor < candidates.length) {
      const row = candidates[cursor];
      cursor += 1;
      try {
        const metadata = await resolvePreviewBackfillMetadata(row, {
          resolveRetailerMetadata,
          fetchPublicHtml,
          parseYandexMapsMetadata,
        });
        if (!metadata || metadata.previewFallback || !/^https?:\/\//i.test(metadata.imageUrl)) continue;
        const saved = await query(
          "UPDATE wishes SET image_url=$1 WHERE id=$2 AND user_id=$3 AND url=$4 AND image_url=''",
          [metadata.imageUrl, row.id, userId, row.url],
        );
        updated += saved.rowCount;
      } catch {
        failed += 1;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(3, candidates.length) }, () => worker()));
  return { checked: candidates.length, updated, failed };
}

function deduplicatedPreviewBackfill(userId) {
  const now = Date.now();
  const current = previewBackfillJobs.get(userId);
  if (current?.expiresAt > now) return current.promise;

  if (previewBackfillJobs.size >= 10_000) {
    for (const [key, entry] of previewBackfillJobs) {
      if (entry.expiresAt <= now) previewBackfillJobs.delete(key);
    }
  }

  const promise = backfillWishPreviews(userId);
  const entry = { promise, expiresAt: now + previewBackfillCooldownMs };
  previewBackfillJobs.set(userId, entry);
  void promise.catch(() => {
    if (previewBackfillJobs.get(userId) === entry) previewBackfillJobs.delete(userId);
  });
  return promise;
}

function cleanUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    name: row.name,
    bio: row.bio,
    birthday: row.birthday,
    avatarUrl: row.avatar_url,
    hasPhone: Boolean(row.phone_hash && row.phone_verified_at),
    phoneMasked: row.phone_hash && row.phone_verified_at ? maskPhone(row.phone_last4) : null,
    hasYandex: Boolean(row.has_yandex),
    createdAt: row.created_at,
  };
}

async function cleanAuthenticatedUser(row) {
  if (!row) return null;
  if (Object.prototype.hasOwnProperty.call(row, "has_yandex")) return cleanUser(row);
  const identity = await query("SELECT 1 FROM yandex_identities WHERE user_id=$1 LIMIT 1", [row.id]);
  return cleanUser({ ...row, has_yandex: identity.rowCount > 0 });
}

function mapList(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    privacy: row.privacy,
    occasionDate: row.occasion_date,
    color: row.color,
    shareToken: row.share_token,
    space: row.space,
    wishCount: Number(row.wish_count || 0),
  };
}

function formatEventDate(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    // node-pg парсит DATE как полночь в локальной таймзоне, pg-mem — как полночь в UTC.
    // Выбираем компоненты даты без сдвига: UTC-полночь → UTC-компоненты, иначе локальные.
    const isUtcMidnight = value.getUTCHours() === 0 && value.getUTCMinutes() === 0
      && value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0;
    const year = isUtcMidnight ? value.getUTCFullYear() : value.getFullYear();
    const month = (isUtcMidnight ? value.getUTCMonth() : value.getMonth()) + 1;
    const day = isUtcMidnight ? value.getUTCDate() : value.getDate();
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return String(value).slice(0, 10);
}

function mapWish(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    url: row.url,
    imageUrl: row.image_url,
    fundraisingUrl: row.fundraising_url ?? "",
    price: row.price === null ? null : Number(row.price),
    currency: row.currency,
    priority: Number(row.priority),
    privacy: row.privacy,
    allowMultiple: row.allow_multiple,
    status: row.status,
    sortOrder: Number(row.sort_order || 0),
    eventDate: formatEventDate(row.event_date),
    space: row.space ?? null,
    createdAt: row.created_at,
    reservationCount: Number(row.reservation_count || 0),
    reservedByMe: Boolean(row.reserved_by_me),
    likedByMe: Boolean(row.liked_by_me),
    listIds: row.list_ids || [],
  };
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function optionalAuth(req, _res, next) {
  const token = req.cookies[sessionCookie];
  if (!token) return next();
  const result = await query(
    `SELECT u.*,(yi.yandex_user_id IS NOT NULL) AS has_yandex FROM sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN yandex_identities yi ON yi.user_id=u.id
     WHERE s.token_hash = $1 AND s.expires_at > $2`,
    [hashToken(token), new Date()],
  );
  req.user = result.rows[0] || null;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Сначала войдите в аккаунт" });
  next();
}

app.use("/api", asyncRoute(optionalAuth));

const csrfSafeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

function requireTrustedSessionMutation(req, res, next) {
  if (csrfSafeMethods.has(req.method) || !req.cookies[sessionCookie]) return next();

  const origin = req.get("origin");
  const fetchSite = (req.get("sec-fetch-site") || "").toLowerCase();
  if (origin) {
    let parsedOrigin;
    try {
      parsedOrigin = new URL(origin).origin;
    } catch {
      return res.status(403).json({ error: "Недоверенный источник запроса", code: "CSRF_ORIGIN_MISMATCH" });
    }
    const requestOrigin = `${req.protocol}://${req.get("host")}`;
    if (!isTrustedRequestOrigin({ origin: parsedOrigin, requestOrigin, configuredOrigins: trustedAppOrigins })) {
      return res.status(403).json({ error: "Недоверенный источник запроса", code: "CSRF_ORIGIN_MISMATCH" });
    }
    return next();
  }

  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    return res.status(403).json({ error: "Недоверенный источник запроса", code: "CSRF_ORIGIN_MISMATCH" });
  }
  return next();
}

app.use("/api", requireTrustedSessionMutation);

async function createSession(res, userId) {
  const session = await createSessionRecord({ query: (text, params) => query(text, params) }, userId);
  setSessionCookie(res, session);
}

async function createSessionRecord(client, userId) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await client.query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)", [hashToken(token), userId, expiresAt]);
  return { token, expiresAt };
}

function setSessionCookie(res, { token, expiresAt }) {
  const telegramEnabled = getTelegramAuthConfig().enabled;
  const secure = isProduction && process.env.COOKIE_SECURE !== "false";
  res.cookie(sessionCookie, token, {
    httpOnly: true,
    sameSite: isProduction && telegramEnabled && secure ? "none" : "lax",
    secure,
    path: "/",
    expires: expiresAt,
  });
}

function yandexOauthCookieOptions(expires) {
  const options = {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction && process.env.COOKIE_SECURE !== "false",
    path: "/api/auth/yandex/callback",
  };
  if (expires) options.expires = expires;
  return options;
}

function yandexOauthCookieName(state) {
  return typeof state === "string" && /^[A-Za-z0-9_-]{43}$/.test(state)
    ? `${yandexOauthCookiePrefix}${state}`
    : "";
}

function clearYandexOauthCookie(res, state) {
  const name = yandexOauthCookieName(state);
  if (name) res.clearCookie(name, yandexOauthCookieOptions());
}

function yandexLoginRedirect(nextPath, errorCode, successCode) {
  const params = new URLSearchParams({ next: safeOauthReturnPath(nextPath) });
  if (errorCode) params.set("auth_error", errorCode);
  if (successCode) params.set("auth_success", successCode);
  return `/login?${params.toString()}`;
}

async function uniqueUsername(name, client = { query }) {
  const base = slugify(name);
  for (const candidate of profileUsernameCandidates(base)) {
    const found = await client.query("SELECT 1 FROM users WHERE username = $1", [candidate]);
    if (!found.rowCount) return candidate;
  }
  return `${base}-${randomBytes(3).toString("hex")}`;
}

const credentialsSchema = z.object({
  email: z.string().email().max(160).transform((value) => value.toLowerCase().trim()),
  password: z.string().min(8).max(128),
});
const passwordResetRequestSchema = z.object({
  email: z.string().trim().email().max(160).transform((value) => value.toLowerCase()),
}).strict();
const passwordResetConfirmSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password: z.string().min(8).max(128),
}).strict();

const passwordResetRequestResponse = {
  ok: true,
  message: "Если аккаунт существует, мы отправили ссылку для восстановления",
};
const invalidPasswordResetResponse = {
  error: "Ссылка для восстановления недействительна или истекла",
  code: "PASSWORD_RESET_INVALID",
};

function boundedEnvironmentInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function getPasswordResetPolicy(env = process.env) {
  const testMinimum = env.NODE_ENV === "test" ? 0 : 30;
  return {
    ttlSeconds: boundedEnvironmentInteger(env.PASSWORD_RESET_TTL_SECONDS, 1_800, env.NODE_ENV === "test" ? 1 : 600, 86_400),
    cooldownSeconds: boundedEnvironmentInteger(env.PASSWORD_RESET_COOLDOWN_SECONDS, 60, testMinimum, 3_600),
    dailyLimit: boundedEnvironmentInteger(env.PASSWORD_RESET_DAILY_LIMIT, 5, 1, 100),
  };
}

function getPasswordResetOrigin(env = process.env) {
  const candidates = [env.PUBLIC_APP_URL, ...(String(env.APP_ORIGIN || "").split(","))];
  for (const candidate of candidates) {
    try {
      const parsed = new URL(String(candidate || "").trim());
      if (parsed.protocol === "https:" || (env.NODE_ENV !== "production" && parsed.protocol === "http:")) {
        return parsed.origin;
      }
    } catch {
      // Try the next explicitly configured application origin.
    }
  }
  return "";
}

function buildPasswordResetUrl(origin, token) {
  const resetUrl = new URL("/reset-password", origin);
  resetUrl.hash = `token=${token}`;
  return resetUrl.toString();
}

async function createPasswordResetRequest(email) {
  const policy = getPasswordResetPolicy();
  const now = new Date();
  const requestId = randomUUID();
  const token = createSessionToken();

  return transaction(async (client) => {
    const found = await client.query("SELECT id,email FROM users WHERE email=$1 FOR UPDATE", [email]);
    const user = found.rows[0];
    if (!user) return null;

    if (policy.cooldownSeconds > 0) {
      const cooldownCutoff = new Date(now.getTime() - policy.cooldownSeconds * 1_000);
      const recent = await client.query(
        `SELECT 1 FROM password_reset_tokens
         WHERE user_id=$1 AND delivery_status IN ('pending','sent') AND created_at>$2 LIMIT 1`,
        [user.id, cooldownCutoff],
      );
      if (recent.rowCount) return null;
    }

    const dailyCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
    const daily = await client.query(
      `SELECT COUNT(*) AS count FROM password_reset_tokens
       WHERE user_id=$1 AND created_at>$2
         AND (delivery_status='sent' OR (delivery_status='pending' AND expires_at>$3))`,
      [user.id, dailyCutoff, now],
    );
    if (Number(daily.rows[0]?.count || 0) >= policy.dailyLimit) return null;

    const expiresAt = new Date(now.getTime() + policy.ttlSeconds * 1_000);
    const inserted = await client.query(
      `INSERT INTO password_reset_tokens
        (id,token_hash,user_id,expires_at,delivery_status,created_at)
       VALUES ($1,$2,$3,$4,'pending',$5)
       RETURNING created_at`,
      [requestId, hashToken(token), user.id, expiresAt, now],
    );
    return {
      requestId,
      token,
      email: user.email,
      userId: user.id,
      createdAt: inserted.rows[0]?.created_at || now,
    };
  });
}

async function deliverPasswordResetRequest(request, origin) {
  const resetUrl = buildPasswordResetUrl(origin, request.token);
  try {
    const delivered = await sendPasswordResetEmail({
      to: request.email,
      resetUrl,
      requestId: request.requestId,
    });
    const deliveredAt = new Date();
    await transaction(async (client) => {
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [request.userId]);
      const marked = await client.query(
        `UPDATE password_reset_tokens
         SET delivery_status='sent',provider_message_id=$1
         WHERE id=$2 AND delivery_status='pending' AND consumed_at IS NULL
         RETURNING user_id,created_at`,
        [delivered?.providerMessageId || null, request.requestId],
      );
      if (!marked.rowCount) return;
      const createdAt = marked.rows[0].created_at || request.createdAt;
      await client.query(
        `UPDATE password_reset_tokens SET consumed_at=$1
         WHERE user_id=$2 AND id<>$3 AND consumed_at IS NULL
           AND (created_at<$4 OR (created_at=$4 AND id<$3))`,
        [deliveredAt, request.userId, request.requestId, createdAt],
      );
    });
  } catch (error) {
    await query(
      `UPDATE password_reset_tokens
       SET delivery_status='failed',consumed_at=COALESCE(consumed_at,$1)
       WHERE id=$2 AND delivery_status='pending'`,
      [new Date(), request.requestId],
    ).catch((databaseError) => {
      console.error(`[password-reset] Could not record failure for request ${request.requestId}: ${databaseError.message}`);
    });
    console.error(`[password-reset] Email delivery failed for request ${request.requestId}: ${error.message}`);
  }
}

async function processPasswordResetRequest(email, origin) {
  try {
    await cleanupExpiredAuthData();
    const request = await createPasswordResetRequest(email);
    if (request) await deliverPasswordResetRequest(request, origin);
  } catch (error) {
    console.error(`[password-reset] Could not process reset request: ${error.message}`);
  }
}

class PhoneRequestLimitError extends Error {
  constructor(retryAfterSeconds) {
    super("Phone OTP request limit exceeded");
    this.name = "PhoneRequestLimitError";
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

function phoneAuthRuntimeConfig() {
  const sms = getSmsConfig();
  let secret = "";
  try {
    secret = requirePhoneAuthSecret();
  } catch {
    // The public config reports the feature as disabled until a strong secret exists.
  }
  return {
    ...sms,
    enabled: sms.enabled && Boolean(secret),
    policy: getPhoneAuthPolicy(),
    secret,
  };
}

function publicPhoneAuthConfig() {
  const runtime = phoneAuthRuntimeConfig();
  return {
    enabled: runtime.enabled,
    testMode: runtime.testMode,
    country: "RU",
    codeLength: PHONE_OTP_CODE_LENGTH,
    expiresInSeconds: runtime.policy.ttlSeconds,
    resendAfterSeconds: runtime.policy.resendSeconds,
  };
}

function parseTelegramRequest(body) {
  const parsed = telegramInitDataSchema.safeParse(body);
  if (!parsed.success) throw new TelegramInitDataError("Откройте Rollapp из Telegram ещё раз");
  const config = getTelegramAuthConfig();
  return {
    config,
    identity: validateTelegramInitData(parsed.data.initData, {
      botToken: config.token,
      maxAgeSeconds: config.maxAgeSeconds,
    }),
  };
}

function respondTelegramAuthError(res, error) {
  if (!(error instanceof TelegramInitDataError)) throw error;
  const unavailable = error.code === "TELEGRAM_AUTH_UNAVAILABLE";
  return res.status(unavailable ? 503 : 401).json({ error: error.message, code: error.code });
}

function publicTelegramUser(user) {
  return {
    name: user.name,
    username: user.username,
    photoUrl: user.photoUrl,
  };
}

async function saveTelegramIdentity(client, telegramUser, userId) {
  const current = await client.query(
    `SELECT telegram_user_id,user_id FROM telegram_identities
     WHERE telegram_user_id=$1 OR user_id=$2`,
    [telegramUser.id, userId],
  );
  if (current.rows.some((row) => row.telegram_user_id !== telegramUser.id || row.user_id !== userId)) {
    return { kind: "conflict" };
  }
  if (current.rowCount) {
    await client.query(
      `UPDATE telegram_identities
       SET username=$1,first_name=$2,last_name=$3,photo_url=$4,language_code=$5,last_seen_at=$6
       WHERE telegram_user_id=$7 AND user_id=$8`,
      [
        telegramUser.username,
        telegramUser.firstName,
        telegramUser.lastName,
        telegramUser.photoUrl,
        telegramUser.languageCode,
        new Date(),
        telegramUser.id,
        userId,
      ],
    );
    return { kind: "success" };
  }
  await client.query(
    `INSERT INTO telegram_identities
      (telegram_user_id,user_id,username,first_name,last_name,photo_url,language_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      telegramUser.id,
      userId,
      telegramUser.username,
      telegramUser.firstName,
      telegramUser.lastName,
      telegramUser.photoUrl,
      telegramUser.languageCode,
    ],
  );
  return { kind: "success" };
}

async function saveYandexIdentity(client, yandexUser, userId) {
  const current = await client.query(
    `SELECT yandex_user_id,user_id FROM yandex_identities
     WHERE yandex_user_id=$1 OR user_id=$2`,
    [yandexUser.id, userId],
  );
  if (current.rows.some((row) => row.yandex_user_id !== yandexUser.id || row.user_id !== userId)) {
    return { kind: "conflict" };
  }
  const values = [
    yandexUser.login,
    yandexUser.email,
    yandexUser.name,
    yandexUser.firstName,
    yandexUser.lastName,
    yandexUser.avatarUrl,
  ];
  if (current.rowCount) {
    await client.query(
      `UPDATE yandex_identities
       SET login=$1,default_email=$2,display_name=$3,first_name=$4,last_name=$5,
           avatar_url=$6,last_seen_at=$7
       WHERE yandex_user_id=$8 AND user_id=$9`,
      [...values, new Date(), yandexUser.id, userId],
    );
    return { kind: "success" };
  }
  await client.query(
    `INSERT INTO yandex_identities
      (yandex_user_id,user_id,login,default_email,display_name,first_name,last_name,avatar_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [yandexUser.id, userId, ...values],
  );
  return { kind: "success" };
}

async function lockYandexMutation(client, yandexUser, attempt) {
  if (isMemoryDatabase) return;
  const keys = [
    `yandex-id:${yandexUser.id}`,
    `yandex-email:${yandexUser.email}`,
    `yandex-username:${slugify(yandexUser.name || yandexUser.login)}`,
    attempt.user_id ? `yandex-user:${attempt.user_id}` : "",
  ].filter(Boolean).sort();
  for (const key of keys) {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
  }
}

async function insertYandexUser(client, yandexUser, userId, unusablePasswordHash) {
  const base = slugify(yandexUser.name || yandexUser.login);
  const candidates = [
    ...profileUsernameCandidates(base),
    ...Array.from({ length: 5 }, () => `${base.slice(0, 25)}-${randomBytes(3).toString("hex")}`),
  ];
  for (const username of candidates) {
    const created = await client.query(
      `INSERT INTO users (id,email,username,name,password_hash,avatar_url)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [userId, yandexUser.email, username, yandexUser.name, unusablePasswordHash, yandexUser.avatarUrl],
    );
    if (created.rowCount) return { kind: "success", user: created.rows[0] };
    const existingEmail = await client.query("SELECT id FROM users WHERE email=$1", [yandexUser.email]);
    if (existingEmail.rowCount) return { kind: "link-required" };
  }
  throw new YandexAuthError("Не удалось создать профиль Rollapp", "YANDEX_ACCOUNT_CONFLICT", 409);
}

async function resolveYandexLogin(yandexUser, attempt, currentUser) {
  if (attempt.purpose === "link" && (!currentUser || currentUser.id !== attempt.user_id)) {
    return { kind: "link-session-missing" };
  }

  return withMutationLock(`yandex-auth:${yandexUser.id}`, () => transaction(async (client) => {
    await lockYandexMutation(client, yandexUser, attempt);
    const knownIdentity = await client.query(
      "SELECT user_id FROM yandex_identities WHERE yandex_user_id=$1",
      [yandexUser.id],
    );
    if (knownIdentity.rowCount) {
      const userId = knownIdentity.rows[0].user_id;
      if (attempt.purpose === "link" && userId !== attempt.user_id) return { kind: "identity-conflict" };
      const user = await client.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [userId]);
      if (!user.rowCount) return { kind: "identity-conflict" };
      const saved = await saveYandexIdentity(client, yandexUser, userId);
      if (saved.kind !== "success") return { kind: "identity-conflict" };
      const session = await createSessionRecord(client, userId);
      return { kind: "success", user: user.rows[0], session };
    }

    if (attempt.purpose === "link") {
      const user = await client.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [attempt.user_id]);
      if (!user.rowCount) return { kind: "link-session-missing" };
      const saved = await saveYandexIdentity(client, yandexUser, attempt.user_id);
      if (saved.kind !== "success") return { kind: "identity-conflict" };
      const session = await createSessionRecord(client, attempt.user_id);
      return { kind: "success", user: user.rows[0], session };
    }

    const existingEmail = await client.query("SELECT id FROM users WHERE email=$1 FOR UPDATE", [yandexUser.email]);
    if (existingEmail.rowCount) return { kind: "link-required" };

    const userId = randomUUID();
    const unusablePasswordHash = `oauth-only:${randomBytes(32).toString("base64url")}`;
    const created = await insertYandexUser(client, yandexUser, userId, unusablePasswordHash);
    if (created.kind === "link-required") return created;
    await client.query(
      `INSERT INTO wishlists (id,user_id,title,description,privacy,color,share_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), userId, "Мои желания", "Всё, чему я буду рад", "public", "coral", randomBytes(10).toString("base64url")],
    );
    await addDefaultFriend(client, userId);
    await saveYandexIdentity(client, yandexUser, userId);
    const session = await createSessionRecord(client, userId);
    return { kind: "success", user: created.user, session };
  }));
}

function phoneAuthUnavailable(res) {
  return res.status(503).json({ error: "Вход по телефону временно недоступен" });
}

function phoneRequestLimited(res, retryAfterSeconds) {
  const retry = Math.max(1, Math.ceil(retryAfterSeconds));
  res.set("Retry-After", String(retry));
  return res.status(429).json({
    error: "Слишком много запросов кода. Попробуйте позже",
    retryAfterSeconds: retry,
  });
}

async function enforcePhoneRequestLimits(client, {
  phoneHash,
  ipHash,
  purpose,
  now,
  policy,
}) {
  const resendCutoff = new Date(now.getTime() - policy.resendSeconds * 1_000);
  const latest = await client.query(
    `SELECT created_at FROM phone_auth_challenges
     WHERE phone_hash=$1 AND purpose=$2 AND created_at>$3
     ORDER BY created_at DESC LIMIT 1`,
    [phoneHash, purpose, resendCutoff],
  );
  if (latest.rowCount) {
    const elapsedMs = now.getTime() - new Date(latest.rows[0].created_at).getTime();
    throw new PhoneRequestLimitError(policy.resendSeconds - elapsedMs / 1_000);
  }

  const rateCutoff = new Date(now.getTime() - policy.rateWindowSeconds * 1_000);
  const phoneRequests = await client.query(
    "SELECT COUNT(*) AS count FROM phone_auth_challenges WHERE phone_hash=$1 AND created_at>$2",
    [phoneHash, rateCutoff],
  );
  if (Number(phoneRequests.rows[0]?.count || 0) >= policy.phoneRequestLimit) {
    throw new PhoneRequestLimitError(policy.rateWindowSeconds);
  }

  const ipRequests = await client.query(
    "SELECT COUNT(*) AS count FROM phone_auth_challenges WHERE request_ip_hash=$1 AND created_at>$2",
    [ipHash, rateCutoff],
  );
  if (Number(ipRequests.rows[0]?.count || 0) >= policy.ipRequestLimit) {
    throw new PhoneRequestLimitError(policy.rateWindowSeconds);
  }

  const dailyCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
  const deliveries = await client.query(
    `SELECT COUNT(*) AS count FROM phone_auth_challenges
     WHERE delivery_status<>'suppressed' AND created_at>$1`,
    [dailyCutoff],
  );
  if (Number(deliveries.rows[0]?.count || 0) >= policy.globalDailyLimit) {
    throw new PhoneRequestLimitError(60 * 60);
  }
}

let lastPhoneAuthCleanupAt = 0;
async function cleanupExpiredAuthData() {
  const now = Date.now();
  if (now - lastPhoneAuthCleanupAt < 60 * 60 * 1_000) return;
  const challengeCutoff = new Date(now - 24 * 60 * 60 * 1_000);
  await Promise.all([
    query("DELETE FROM phone_auth_challenges WHERE created_at<$1", [challengeCutoff]),
    query("DELETE FROM password_reset_tokens WHERE created_at<$1", [challengeCutoff]),
    query("DELETE FROM yandex_oauth_attempts WHERE expires_at<$1", [new Date(now)]),
    query("DELETE FROM sessions WHERE expires_at<$1", [new Date(now)]),
  ]);
  lastPhoneAuthCleanupAt = now;
}

async function startPhoneChallenge(req, res, { purpose, userId = null }) {
  const parsed = phoneRequestSchema.safeParse(req.body);
  const phone = parsed.success ? normalizeRussianPhone(parsed.data.phone) : null;
  if (!phone) return res.status(400).json({ error: "Введите российский мобильный номер" });

  const runtime = phoneAuthRuntimeConfig();
  if (!runtime.enabled) return phoneAuthUnavailable(res);

  await cleanupExpiredAuthData();
  const now = new Date();
  const challengeId = randomUUID();
  const code = createOtpCode();
  const phoneHash = digestPhone(runtime.secret, phone);
  const ipHash = digestIp(runtime.secret, req.ip || req.socket.remoteAddress || "unknown");
  const last4 = phoneLast4(phone);

  let challenge;
  try {
    challenge = await withMutationLock("phone-otp-request", async () => transaction(async (client) => {
      let targetUserId = userId;
      if (purpose === "login") {
        const owner = await client.query(
          "SELECT id FROM users WHERE phone_hash=$1 AND phone_verified_at IS NOT NULL",
          [phoneHash],
        );
        targetUserId = owner.rows[0]?.id || null;
      }
      await enforcePhoneRequestLimits(client, {
        phoneHash,
        ipHash,
        purpose,
        now,
        policy: runtime.policy,
      });
      await client.query(
        `UPDATE phone_auth_challenges SET consumed_at=$1
         WHERE phone_hash=$2 AND purpose=$3 AND consumed_at IS NULL`,
        [now, phoneHash, purpose],
      );
      const expiresAt = new Date(now.getTime() + runtime.policy.ttlSeconds * 1_000);
      const shouldDeliver = Boolean(targetUserId);
      await client.query(
        `INSERT INTO phone_auth_challenges
          (id,phone_hash,phone_last4,purpose,user_id,code_hash,request_ip_hash,max_attempts,expires_at,delivery_status,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          challengeId,
          phoneHash,
          last4,
          purpose,
          targetUserId,
          digestOtp(runtime.secret, challengeId, code),
          ipHash,
          runtime.policy.maxAttempts,
          expiresAt,
          shouldDeliver ? "pending" : "suppressed",
          now,
        ],
      );
      return { shouldDeliver };
    }));
  } catch (error) {
    if (error instanceof PhoneRequestLimitError) {
      return phoneRequestLimited(res, error.retryAfterSeconds);
    }
    throw error;
  }

  if (challenge.shouldDeliver) {
    try {
      const delivered = await sendSms({ phone, code });
      await query(
        "UPDATE phone_auth_challenges SET delivery_status='sent',provider_message_id=$1 WHERE id=$2",
        [delivered.providerMessageId || null, challengeId],
      );
    } catch (error) {
      await query("UPDATE phone_auth_challenges SET delivery_status='failed' WHERE id=$1", [challengeId]);
      console.error(`[phone-auth] SMS delivery failed for challenge ${challengeId}: ${error.message}`);
    }
  } else if (!runtime.testMode) {
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  const response = {
    challengeId,
    phoneMasked: maskPhone(last4),
    expiresInSeconds: runtime.policy.ttlSeconds,
    resendAfterSeconds: runtime.policy.resendSeconds,
  };
  if (runtime.testMode) response.testCode = code;
  return res.status(202).json(response);
}

const invalidPhoneCodeResponse = { error: "Неверный или истёкший код" };

async function verifyPhoneChallenge(req, res, { purpose, userId = null }) {
  const parsed = phoneVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(invalidPhoneCodeResponse);
  const runtime = phoneAuthRuntimeConfig();
  if (!runtime.enabled) return phoneAuthUnavailable(res);

  const result = await withMutationLock(`phone-otp-verify:${parsed.data.challengeId}`, async () => transaction(async (client) => {
    const found = await client.query(
      "SELECT * FROM phone_auth_challenges WHERE id=$1 AND purpose=$2 FOR UPDATE",
      [parsed.data.challengeId, purpose],
    );
    const challenge = found.rows[0];
    if (!challenge) return { kind: "invalid" };
    if (purpose === "link" && challenge.user_id !== userId) return { kind: "invalid" };

    const now = new Date();
    const attempts = Number(challenge.attempt_count || 0);
    const maxAttempts = Number(challenge.max_attempts || runtime.policy.maxAttempts);
    if (challenge.consumed_at || attempts >= maxAttempts || new Date(challenge.expires_at) <= now) {
      if (!challenge.consumed_at) {
        await client.query("UPDATE phone_auth_challenges SET consumed_at=$1 WHERE id=$2", [now, challenge.id]);
      }
      return { kind: "invalid" };
    }

    if (!verifyOtpDigest(runtime.secret, challenge.id, parsed.data.code, challenge.code_hash)) {
      const nextAttempts = attempts + 1;
      await client.query(
        `UPDATE phone_auth_challenges
         SET attempt_count=$1,consumed_at=CASE WHEN $1>=max_attempts THEN $2 ELSE consumed_at END
         WHERE id=$3`,
        [nextAttempts, now, challenge.id],
      );
      return { kind: "invalid" };
    }

    if (purpose === "login") {
      const user = challenge.user_id
        ? await client.query(
          `SELECT * FROM users
           WHERE id=$1 AND phone_hash=$2 AND phone_verified_at IS NOT NULL`,
          [challenge.user_id, challenge.phone_hash],
        )
        : { rows: [] };
      await client.query("UPDATE phone_auth_challenges SET consumed_at=$1 WHERE id=$2", [now, challenge.id]);
      if (!user.rows[0]) return { kind: "invalid" };
      const session = await createSessionRecord(client, user.rows[0].id);
      return { kind: "success", user: user.rows[0], session };
    }

    const claimed = await client.query(
      "SELECT id FROM users WHERE phone_hash=$1 AND id<>$2 LIMIT 1",
      [challenge.phone_hash, userId],
    );
    await client.query("UPDATE phone_auth_challenges SET consumed_at=$1 WHERE id=$2", [now, challenge.id]);
    if (claimed.rowCount) return { kind: "conflict" };
    const updated = await client.query(
      `UPDATE users
       SET phone_hash=$1,phone_last4=$2,phone_verified_at=$3
       WHERE id=$4 RETURNING *`,
      [challenge.phone_hash, challenge.phone_last4, now, userId],
    );
    if (!updated.rows[0]) return { kind: "invalid" };
    return { kind: "success", user: updated.rows[0] };
  }));

  if (result.kind === "conflict") {
    return res.status(409).json({ error: "Этот номер уже привязан к другому аккаунту" });
  }
  if (result.kind !== "success") return res.status(401).json(invalidPhoneCodeResponse);
  if (result.session) setSessionCookie(res, result.session);
  return res.json({ user: await cleanAuthenticatedUser(result.user) });
}

app.get("/api/auth/phone/config", (_req, res) => {
  res.json(publicPhoneAuthConfig());
});

app.post("/api/auth/phone/request", asyncRoute(async (req, res) => {
  await startPhoneChallenge(req, res, { purpose: "login" });
}));

app.post("/api/auth/phone/verify", asyncRoute(async (req, res) => {
  await verifyPhoneChallenge(req, res, { purpose: "login" });
}));

app.get("/api/auth/yandex/config", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ enabled: getYandexAuthConfig().enabled });
});

app.get("/api/auth/yandex/start", authRateLimit, asyncRoute(async (req, res) => {
  res.set("Cache-Control", "no-store");
  const config = getYandexAuthConfig();
  if (!config.enabled) {
    return res.status(503).json({ error: "Вход через Яндекс ID не настроен", code: "YANDEX_AUTH_UNAVAILABLE" });
  }
  const nextPath = safeOauthReturnPath(typeof req.query.next === "string" ? req.query.next : "");
  const wantsLink = req.query.link === "1";
  if (wantsLink && !req.user) {
    return res.redirect(303, yandexLoginRedirect(nextPath, "YANDEX_LINK_LOGIN_REQUIRED"));
  }
  await cleanupExpiredAuthData();
  const authorization = createYandexAuthorization(config, {
    nextPath,
    linkUserId: wantsLink ? req.user.id : null,
  });
  await query(
    `INSERT INTO yandex_oauth_attempts
      (state_hash,code_verifier,next_path,purpose,user_id,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      authorization.attempt.stateHash,
      authorization.attempt.verifier,
      authorization.attempt.nextPath,
      authorization.attempt.purpose,
      authorization.attempt.userId,
      authorization.expiresAt,
    ],
  );
  res.cookie(
    yandexOauthCookieName(authorization.state),
    authorization.cookieValue,
    yandexOauthCookieOptions(authorization.expiresAt),
  );
  return res.redirect(302, authorization.authorizationUrl);
}));

app.get("/api/auth/yandex/callback", asyncRoute(async (req, res) => {
  res.set("Cache-Control", "no-store");
  const config = getYandexAuthConfig();
  const returnedState = typeof req.query.state === "string" ? req.query.state : "";
  const cookieName = yandexOauthCookieName(returnedState);
  const cookieState = cookieName ? req.cookies[cookieName] : undefined;
  clearYandexOauthCookie(res, returnedState);
  if (!config.enabled) return res.redirect(303, yandexLoginRedirect("", "YANDEX_AUTH_UNAVAILABLE"));

  let stateHash;
  try {
    stateHash = readYandexAuthorization(cookieState, returnedState);
  } catch {
    return res.redirect(303, yandexLoginRedirect("", "YANDEX_STATE_INVALID"));
  }
  const consumed = await query(
    `DELETE FROM yandex_oauth_attempts
     WHERE state_hash=$1 AND expires_at>$2
     RETURNING code_verifier,next_path,purpose,user_id`,
    [stateHash, new Date()],
  );
  const attempt = consumed.rows[0];
  if (!attempt) return res.redirect(303, yandexLoginRedirect("", "YANDEX_STATE_INVALID"));

  if (typeof req.query.error === "string") {
    const errorCode = req.query.error === "access_denied" ? "YANDEX_CANCELLED" : "YANDEX_PROVIDER_ERROR";
    return res.redirect(303, yandexLoginRedirect(attempt.next_path, errorCode));
  }
  const code = typeof req.query.code === "string" ? req.query.code : "";
  try {
    const accessToken = await exchangeYandexCode(config, { code, verifier: attempt.code_verifier });
    const yandexUser = await fetchYandexProfile(config, accessToken);
    const result = await resolveYandexLogin(yandexUser, attempt, req.user);
    if (result.kind === "link-required") {
      return res.redirect(303, yandexLoginRedirect(attempt.next_path, "YANDEX_LINK_REQUIRED"));
    }
    if (result.kind === "identity-conflict") {
      return res.redirect(303, yandexLoginRedirect(attempt.next_path, "YANDEX_IDENTITY_CONFLICT"));
    }
    if (result.kind === "link-session-missing") {
      return res.redirect(303, yandexLoginRedirect(attempt.next_path, "YANDEX_LINK_LOGIN_REQUIRED"));
    }
    setSessionCookie(res, result.session);
    if (attempt.purpose === "link") {
      return res.redirect(303, yandexLoginRedirect(attempt.next_path, "", "YANDEX_LINKED"));
    }
    return res.redirect(303, safeOauthReturnPath(attempt.next_path));
  } catch (error) {
    const publicCode = error instanceof YandexAuthError
      ? {
        YANDEX_EMAIL_REQUIRED: "YANDEX_EMAIL_REQUIRED",
        YANDEX_STATE_INVALID: "YANDEX_STATE_INVALID",
      }[error.code] || "YANDEX_PROVIDER_ERROR"
      : "YANDEX_PROVIDER_ERROR";
    console.error(`[yandex-auth] Callback failed: ${error?.code || error?.message || "unknown error"}`);
    return res.redirect(303, yandexLoginRedirect(attempt.next_path, publicCode));
  }
}));

app.get("/api/auth/telegram/config", (_req, res) => {
  const config = getTelegramAuthConfig();
  res.json({
    enabled: config.enabled,
    botUsername: config.botUsername,
    botUrl: config.botUsername ? `https://t.me/${config.botUsername}` : null,
  });
});

app.post("/api/auth/telegram", authRateLimit, asyncRoute(async (req, res) => {
  let identity;
  try {
    ({ identity } = parseTelegramRequest(req.body));
  } catch (error) {
    return respondTelegramAuthError(res, error);
  }

  const result = await transaction(async (client) => {
    const user = await client.query(
      `SELECT u.* FROM telegram_identities ti
       JOIN users u ON u.id=ti.user_id
       WHERE ti.telegram_user_id=$1`,
      [identity.user.id],
    );
    if (!user.rowCount) return { kind: "unlinked" };
    await saveTelegramIdentity(client, identity.user, user.rows[0].id);
    const session = await createSessionRecord(client, user.rows[0].id);
    return { kind: "success", user: user.rows[0], session };
  });

  if (result.kind === "unlinked") {
    return res.status(409).json({
      error: "Привяжите Telegram к существующему аккаунту или создайте новый",
      code: "TELEGRAM_LINK_REQUIRED",
      telegram: publicTelegramUser(identity.user),
    });
  }
  setSessionCookie(res, result.session);
  return res.json({ user: await cleanAuthenticatedUser(result.user), telegram: publicTelegramUser(identity.user) });
}));

app.post("/api/telegram/webhook", asyncRoute(async (req, res) => {
  const config = getTelegramBotRuntimeConfig();
  if (!config.webhookEnabled) return res.status(404).json({ error: "Telegram webhook не настроен" });
  const receivedSecret = String(req.get("X-Telegram-Bot-Api-Secret-Token") || "");
  if (!safeSecretEqual(receivedSecret, config.webhookSecret)) {
    return res.status(401).json({ error: "Неверный Telegram webhook secret" });
  }

  const reply = telegramLaunchReply(req.body, config);
  if (reply) return res.json({ method: "sendMessage", ...reply });
  return res.json({ ok: true });
}));

app.get("/api/healthz", asyncRoute(async (_req, res) => {
  await query("SELECT 1 AS ok");
  res.json({ ok: true, service: "rollapp", version: process.env.APP_VERSION || "development" });
}));

app.get("/api/media/:id", asyncRoute(async (req, res) => {
  const result = await query("SELECT id,mime_type,image_data,size_bytes FROM wish_images WHERE id=$1", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Изображение не найдено" });
  const image = result.rows[0];
  res.set({
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Length": String(image.size_bytes),
    ETag: `"${image.id}"`,
  });
  res.type(image.mime_type).send(image.image_data);
}));

app.post("/api/uploads/images", requireAuth, imageUploadRateLimit, imageUploadBody, asyncRoute(async (req, res) => {
  const declaredType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  const detectedType = detectImageMimeType(req.body);
  if (!imageMimeTypes.has(declaredType) || detectedType !== declaredType || !req.body?.length) {
    return res.status(400).json({ error: "Загрузите изображение JPG, PNG или WEBP" });
  }
  const id = randomUUID();
  await query(
    "INSERT INTO wish_images (id,user_id,mime_type,image_data,size_bytes) VALUES ($1,$2,$3,$4,$5)",
    [id, req.user.id, detectedType, req.body, req.body.length],
  );
  res.status(201).json({ id, imageUrl: `/api/media/${id}` });
}));

app.delete("/api/uploads/images/:id", requireAuth, asyncRoute(async (req, res) => {
  const imageUrl = `/api/media/${req.params.id}`;
  const [usedByWish, usedByProfile] = await Promise.all([
    query("SELECT 1 FROM wishes WHERE user_id=$1 AND image_url=$2 LIMIT 1", [req.user.id, imageUrl]),
    query("SELECT 1 FROM users WHERE id=$1 AND avatar_url=$2 LIMIT 1", [req.user.id, imageUrl]),
  ]);
  if (usedByWish.rowCount || usedByProfile.rowCount) return res.status(409).json({ error: "Изображение уже используется" });
  const deleted = await query("DELETE FROM wish_images WHERE id=$1 AND user_id=$2 RETURNING id", [req.params.id, req.user.id]);
  if (!deleted.rowCount) return res.status(404).json({ error: "Изображение не найдено" });
  res.json({ ok: true });
}));

app.post("/api/auth/password-reset/request", passwordResetRequestRateLimit, asyncRoute(async (req, res) => {
  const emailConfig = getEmailConfig();
  const origin = getPasswordResetOrigin();
  if (!emailConfig.enabled || !origin) {
    return res.status(503).json({
      error: "Восстановление пароля временно недоступно",
      code: "PASSWORD_RESET_UNAVAILABLE",
    });
  }

  const parsed = passwordResetRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Введите корректный email" });

  res.status(202).json(passwordResetRequestResponse);
  trackBackgroundTask(processPasswordResetRequest(parsed.data.email, origin));
}));

app.post("/api/auth/password-reset/confirm", authRateLimit, asyncRoute(async (req, res) => {
  const parsed = passwordResetConfirmSchema.safeParse(req.body);
  if (!parsed.success) {
    const invalidPassword = parsed.error.issues.some((issue) => issue.path[0] === "password");
    return res.status(400).json(invalidPassword
      ? { error: "Пароль должен содержать от 8 до 128 символов", code: "PASSWORD_RESET_PASSWORD_INVALID" }
      : invalidPasswordResetResponse);
  }

  const tokenHash = hashToken(parsed.data.token);
  const candidate = await query(
    `SELECT t.user_id,u.email FROM password_reset_tokens t
     JOIN users u ON u.id=t.user_id
     WHERE t.token_hash=$1 AND t.delivery_status='sent'
       AND t.consumed_at IS NULL AND t.expires_at>$2`,
    [tokenHash, new Date()],
  );
  const candidateUserId = candidate.rows[0]?.user_id;
  const candidateEmail = candidate.rows[0]?.email;
  if (!candidateUserId || !candidateEmail) return res.status(400).json(invalidPasswordResetResponse);

  const passwordHash = await hashPassword(parsed.data.password);
  const now = new Date();
  const result = await withMutationLock(`password-auth:${candidateEmail}`, () => transaction(async (client) => {
    const lockedUser = await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [candidateUserId]);
    if (!lockedUser.rowCount) return { kind: "invalid" };
    const claimed = await client.query(
      `UPDATE password_reset_tokens SET consumed_at=$1
       WHERE token_hash=$2 AND delivery_status='sent'
         AND user_id=$3 AND consumed_at IS NULL AND expires_at>$1
       RETURNING user_id`,
      [now, tokenHash, candidateUserId],
    );
    const userId = claimed.rows[0]?.user_id;
    if (!userId) return { kind: "invalid" };

    await client.query("UPDATE users SET password_hash=$1 WHERE id=$2", [passwordHash, userId]);
    await client.query(
      "UPDATE password_reset_tokens SET consumed_at=COALESCE(consumed_at,$1) WHERE user_id=$2",
      [now, userId],
    );
    await client.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
    return { kind: "success", userId };
  }));

  if (result.kind !== "success") return res.status(400).json(invalidPasswordResetResponse);
  if (req.user?.id === result.userId) res.clearCookie(sessionCookie, { path: "/" });
  return res.json({ ok: true });
}));

app.post("/api/auth/register", authRateLimit, asyncRoute(async (req, res) => {
  const parsed = credentialsSchema.extend({ name: z.string().trim().min(2).max(80) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте имя, email и пароль — минимум 8 символов" });
  const { name, email, password } = parsed.data;
  const exists = await query("SELECT 1 FROM users WHERE email = $1", [email]);
  if (exists.rowCount) return res.status(409).json({ error: "Аккаунт с таким email уже есть" });

  const userId = randomUUID();
  const username = await uniqueUsername(name);
  const passwordHash = await hashPassword(password);
  await transaction(async (client) => {
    await client.query(
      "INSERT INTO users (id,email,username,name,password_hash) VALUES ($1,$2,$3,$4,$5)",
      [userId, email, username, name, passwordHash],
    );
    await client.query(
      `INSERT INTO wishlists (id,user_id,title,description,privacy,color,share_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), userId, "Мои желания", "Всё, чему я буду рад", "public", "coral", randomBytes(10).toString("base64url")],
    );
    await addDefaultFriend(client, userId);
  });
  await createSession(res, userId);
  const result = await query("SELECT * FROM users WHERE id = $1", [userId]);
  res.status(201).json({ user: await cleanAuthenticatedUser(result.rows[0]) });
}));

app.post("/api/auth/login", authRateLimit, asyncRoute(async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Введите корректные email и пароль" });
  const authenticated = await withMutationLock(`password-auth:${parsed.data.email}`, () => transaction(async (client) => {
    const result = await client.query("SELECT * FROM users WHERE email = $1 FOR UPDATE", [parsed.data.email]);
    const user = result.rows[0];
    if (!user || !(await verifyPassword(parsed.data.password, user.password_hash))) return null;
    const session = await createSessionRecord(client, user.id);
    return { session, user };
  }));
  if (!authenticated) {
    return res.status(401).json({ error: "Неверные email или пароль" });
  }
  setSessionCookie(res, authenticated.session);
  res.json({ user: await cleanAuthenticatedUser(authenticated.user) });
}));

app.post("/api/auth/demo", asyncRoute(async (_req, res) => {
  if (process.env.DEMO_MODE === "false") return res.status(404).json({ error: "Демо-вход отключён" });
  const result = await query("SELECT * FROM users WHERE email = $1", ["demo@rollapp.test"]);
  if (!result.rowCount) return res.status(404).json({ error: "Демо-профиль не найден" });
  await createSession(res, result.rows[0].id);
  res.json({ user: await cleanAuthenticatedUser(result.rows[0]) });
}));

app.post("/api/auth/logout", asyncRoute(async (req, res) => {
  const token = req.cookies[sessionCookie];
  if (token) await query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  res.clearCookie(sessionCookie, { path: "/" });
  res.json({ ok: true });
}));

app.post("/api/me/phone/request", requireAuth, asyncRoute(async (req, res) => {
  await startPhoneChallenge(req, res, { purpose: "link", userId: req.user.id });
}));

app.post("/api/me/phone/verify", requireAuth, asyncRoute(async (req, res) => {
  await verifyPhoneChallenge(req, res, { purpose: "link", userId: req.user.id });
}));

app.post("/api/me/telegram/link", requireAuth, authRateLimit, asyncRoute(async (req, res) => {
  let identity;
  try {
    ({ identity } = parseTelegramRequest(req.body));
  } catch (error) {
    return respondTelegramAuthError(res, error);
  }

  let result;
  try {
    result = await withMutationLock(`telegram-link:${identity.user.id}`, () => transaction(
      (client) => saveTelegramIdentity(client, identity.user, req.user.id),
    ));
  } catch (error) {
    if (error.code === "23505") result = { kind: "conflict" };
    else throw error;
  }
  if (result.kind === "conflict") {
    return res.status(409).json({
      error: "Этот Telegram уже привязан к другому аккаунту",
      code: "TELEGRAM_IDENTITY_CONFLICT",
    });
  }
  return res.json({ user: await cleanAuthenticatedUser(req.user), telegram: publicTelegramUser(identity.user) });
}));

app.get("/api/me", asyncRoute(async (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: await cleanAuthenticatedUser(req.user) });
}));

app.patch("/api/me", requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(80).optional(),
    username: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,32}$/).optional(),
    bio: z.string().trim().max(300).optional(),
    birthday: birthdaySchema.nullable().optional(),
    avatarUrl: avatarUrlSchema.optional(),
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Не удалось сохранить: проверьте формат полей" });
  if (parsed.data.username && isReservedProfileUsername(parsed.data.username)) {
    return res.status(409).json({ error: "Этот адрес зарезервирован сервисом — выберите другое имя профиля" });
  }
  const uploadedAvatarId = parsed.data.avatarUrl?.match(uploadedMediaUrlPattern)?.[1];
  if (uploadedAvatarId) {
    const uploadedAvatar = await query("SELECT 1 FROM wish_images WHERE id=$1 AND user_id=$2 LIMIT 1", [uploadedAvatarId, req.user.id]);
    if (!uploadedAvatar.rowCount) return res.status(400).json({ error: "Загруженное изображение не найдено" });
  }
  const next = {
    name: parsed.data.name ?? req.user.name,
    username: parsed.data.username ?? req.user.username,
    bio: parsed.data.bio ?? req.user.bio,
    birthday: parsed.data.birthday === undefined ? req.user.birthday : parsed.data.birthday,
    avatarUrl: parsed.data.avatarUrl ?? req.user.avatar_url,
  };
  try {
    const result = await query(
      `UPDATE users SET name=$1,username=$2,bio=$3,birthday=$4,avatar_url=$5 WHERE id=$6 RETURNING *`,
      [next.name, next.username, next.bio, next.birthday, next.avatarUrl, req.user.id],
    );
    res.json({ user: await cleanAuthenticatedUser(result.rows[0]) });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Такое имя профиля уже занято" });
    throw error;
  }
}));

async function getLists(userId) {
  const result = await query(
    `SELECT l.*,COALESCE(counts.wish_count,0) AS wish_count
     FROM wishlists l
     LEFT JOIN (
       SELECT ww.wishlist_id,COUNT(*) AS wish_count
       FROM wishlist_wishes ww
       JOIN wishlists owned_list ON owned_list.id=ww.wishlist_id AND owned_list.user_id=$1
       JOIN wishes w ON w.id=ww.wish_id
       WHERE w.status='active'
       GROUP BY ww.wishlist_id
     ) counts ON counts.wishlist_id=l.id
     WHERE l.user_id=$1 ORDER BY l.created_at`,
    [userId],
  );
  return result.rows.map(mapList);
}

async function getWishes(userId, viewerId = null, includePrivate = false) {
  const params = [userId];
  const privacyClause = includePrivate ? "" : `
    AND w.privacy <> 'private'
    AND w.id NOT IN (
      SELECT secret_ww.wish_id FROM wishlist_wishes secret_ww
      JOIN wishlists secret_list ON secret_list.id=secret_ww.wishlist_id
      WHERE secret_list.privacy='private'
    )`;
  const result = await query(
    `SELECT w.* FROM wishes w WHERE w.user_id=$1 ${privacyClause}
     ORDER BY w.status='active' DESC, w.sort_order ASC, w.created_at DESC`,
    params,
  );
  const wishes = result.rows.map(mapWish);
  if (!wishes.length) return wishes;

  const wishIds = wishes.map((wish) => wish.id);
  const wishIdPlaceholders = wishIds.map((_, index) => `$${index + 1}`).join(",");
  const likedWishIdPlaceholders = wishIds.map((_, index) => `$${index + 2}`).join(",");
  const [links, reservations, likes] = await Promise.all([
    query(
      `SELECT wish_id,wishlist_id FROM wishlist_wishes WHERE wish_id IN (${wishIdPlaceholders})`,
      wishIds,
    ),
    viewerId === userId
      ? Promise.resolve({ rows: [] })
      : query(
        `SELECT wish_id,user_id FROM reservations
         WHERE wish_id IN (${wishIdPlaceholders}) AND status IN ('reserved','multiple')`,
        wishIds,
      ),
    viewerId && viewerId !== userId
      ? query(
        `SELECT source_wish_id FROM wishes
         WHERE user_id=$1 AND source_wish_id IN (${likedWishIdPlaceholders})`,
        [viewerId, ...wishIds],
      )
      : Promise.resolve({ rows: [] }),
  ]);
  const listIdsByWish = new Map();
  for (const row of links.rows) {
    if (!listIdsByWish.has(row.wish_id)) listIdsByWish.set(row.wish_id, []);
    listIdsByWish.get(row.wish_id).push(row.wishlist_id);
  }
  const reservationsByWish = new Map();
  for (const row of reservations.rows) {
    if (!reservationsByWish.has(row.wish_id)) reservationsByWish.set(row.wish_id, []);
    reservationsByWish.get(row.wish_id).push(row.user_id);
  }
  const likedWishIds = new Set(likes.rows.map((row) => row.source_wish_id));
  for (const wish of wishes) {
    wish.listIds = listIdsByWish.get(wish.id) || [];
    if (viewerId === userId) {
      wish.reservationCount = 0;
      wish.reservedByMe = false;
      wish.likedByMe = false;
    } else {
      const reservingUserIds = reservationsByWish.get(wish.id) || [];
      wish.reservationCount = reservingUserIds.length;
      wish.reservedByMe = reservingUserIds.includes(viewerId);
      wish.likedByMe = likedWishIds.has(wish.id);
    }
  }
  return wishes;
}

async function canViewWish(wish, viewerId, shareToken = "", client = null) {
  const runQuery = client ? (...args) => client.query(...args) : query;
  if (wish.user_id === viewerId) return true;
  if (wish.privacy === "private") return false;

  const linkedLists = await runQuery(
    `SELECT l.privacy,l.share_token FROM wishlist_wishes ww
     JOIN wishlists l ON l.id=ww.wishlist_id WHERE ww.wish_id=$1`,
    [wish.id],
  );
  if (linkedLists.rows.some((list) => list.privacy === "private")) return false;
  if (!linkedLists.rowCount) return true;
  if (linkedLists.rows.some((list) => list.privacy === "public")) return true;
  if (shareToken && linkedLists.rows.some((list) => list.privacy === "link" && list.share_token === shareToken)) return true;
  if (!linkedLists.rows.some((list) => list.privacy === "followers")) return false;

  const follows = await runQuery(
    "SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2",
    [viewerId, wish.user_id],
  );
  return Boolean(follows.rowCount);
}

app.get("/api/dashboard", requireAuth, asyncRoute(async (req, res) => {
  const [lists, wishes, follows, birthdays, reservations, groupRows] = await Promise.all([
    getLists(req.user.id),
    getWishes(req.user.id, req.user.id, true),
    query("SELECT COUNT(*) AS count FROM follows WHERE follower_id=$1", [req.user.id]),
    query(
      `SELECT u.id,u.username,u.name,u.avatar_url,u.birthday
       FROM follows f JOIN users u ON u.id=f.following_id
       WHERE f.follower_id=$1 AND u.birthday IS NOT NULL ORDER BY u.birthday LIMIT 4`,
      [req.user.id],
    ),
    query(
      `SELECT r.id,r.created_at,w.id AS wish_id,w.title,w.image_url,w.price,w.currency,
              w.status AS wish_status,w.privacy AS wish_privacy,
              u.name AS owner_name,u.username AS owner_username,
              f.follower_id AS follows_owner,l.privacy AS list_privacy
       FROM reservations r
       JOIN wishes w ON w.id=r.wish_id
       JOIN users u ON u.id=w.user_id
       LEFT JOIN follows f ON f.follower_id=$1 AND f.following_id=w.user_id
       LEFT JOIN wishlist_wishes ww ON ww.wish_id=w.id
       LEFT JOIN wishlists l ON l.id=ww.wishlist_id
       WHERE r.user_id=$1
         AND r.status IN ('reserved','multiple')
       ORDER BY r.created_at DESC`,
      [req.user.id],
    ),
    query(
      `SELECT g.id,g.wishlist_id,g.space,g.title,m.wish_id
       FROM wish_groups g
       JOIN wishlists l ON l.id=g.wishlist_id
       LEFT JOIN wish_group_members m ON m.group_id=g.id
       WHERE l.user_id=$1 ORDER BY g.created_at,m.wish_id`,
      [req.user.id],
    ),
  ]);
  const reservationGroups = new Map();
  for (const row of reservations.rows) {
    if (!reservationGroups.has(row.id)) reservationGroups.set(row.id, { row, listPrivacies: new Set() });
    if (row.list_privacy) reservationGroups.get(row.id).listPrivacies.add(row.list_privacy);
  }
  const visibleReservations = [...reservationGroups.values()]
    .filter(({ row, listPrivacies }) => (
      row.wish_status === "active"
      && row.wish_privacy !== "private"
      && Boolean(row.follows_owner)
      && !listPrivacies.has("private")
      && (!listPrivacies.size || [...listPrivacies].some((privacy) => ["public", "followers", "link"].includes(privacy)))
    ))
    .slice(0, 6)
    .map(({ row }) => {
      const { wish_status: _wishStatus, wish_privacy: _wishPrivacy, follows_owner: _followsOwner, list_privacy: _listPrivacy, ...item } = row;
      return { ...item, price: item.price === null ? null : Number(item.price) };
    });
  const groupsById = new Map();
  for (const row of groupRows.rows) {
    if (!groupsById.has(row.id)) groupsById.set(row.id, { id: row.id, listId: row.wishlist_id, space: row.space, title: row.title, wishIds: [] });
    if (row.wish_id) groupsById.get(row.id).wishIds.push(row.wish_id);
  }
  res.json({
    lists,
    wishes,
    groups: [...groupsById.values()],
    followingCount: Number(follows.rows[0].count),
    birthdays: birthdays.rows.map((row) => ({ ...cleanUser(row), email: undefined })),
    reservations: visibleReservations,
    games: [],
  });
}));

app.patch("/api/wishes/reorder", requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({ wishIds: z.array(z.string().min(1)).min(1).max(1000) })
    .refine(({ wishIds }) => new Set(wishIds).size === wishIds.length)
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Некорректный порядок желаний" });
  const outcome = await transaction(async (client) => {
    const wishPlaceholders = parsed.data.wishIds.map((_, index) => `$${index + 2}`).join(",");
    const owned = await client.query(
      `SELECT id FROM wishes WHERE user_id=$1 AND id IN (${wishPlaceholders}) FOR UPDATE`,
      [req.user.id, ...parsed.data.wishIds],
    );
    if (owned.rowCount !== parsed.data.wishIds.length) return false;
    for (const [index, wishId] of parsed.data.wishIds.entries()) {
      await client.query("UPDATE wishes SET sort_order=$1 WHERE id=$2 AND user_id=$3", [index, wishId, req.user.id]);
    }
    return true;
  });
  if (!outcome) return res.status(404).json({ error: "Одно из желаний не найдено" });
  res.json({ ok: true });
}));

async function runWishGroupTransaction(listId, callback) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await withMutationLock(`wish-group-list:${listId}`, () => transaction(callback));
    } catch (error) {
      if (["40P01", "40001"].includes(error?.code) && attempt < 2) continue;
      if (error?.code === "23505") return { status: 409, error: "Желание уже в группе" };
      throw error;
    }
  }
  throw new Error("Не удалось завершить операцию с группой");
}

function inferWishGroupSpace(list, wishes, requestedSpace) {
  if (requestedSpace) return requestedSpace;
  const wishSpaces = new Set(wishes.map((wish) => wish.space).filter((space) => listSpaceValues.includes(space)));
  if (wishSpaces.size === 1) return [...wishSpaces][0];
  return listSpaceValues.includes(list.space) ? list.space : "products";
}

app.post("/api/lists/:id/groups", requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({
    wishIds: z.array(z.string()).length(2).refine((ids) => new Set(ids).size === 2),
    space: listSpaceSchema.optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Выберите два разных желания" });
  const outcome = await runWishGroupTransaction(req.params.id, async (client) => {
    const list = await client.query("SELECT id,space FROM wishlists WHERE id=$1 AND user_id=$2 FOR UPDATE", [req.params.id, req.user.id]);
    if (!list.rowCount) return { status: 404, error: "Список не найден" };
    const wishes = await client.query(
      "SELECT id,space FROM wishes WHERE user_id=$1 AND id IN ($2,$3) ORDER BY id FOR UPDATE",
      [req.user.id, ...parsed.data.wishIds],
    );
    if (wishes.rowCount !== 2) return { status: 404, error: "Одно из желаний не найдено" };
    const space = inferWishGroupSpace(list.rows[0], wishes.rows, parsed.data.space);
    const occupied = await client.query(
      "SELECT wish_id FROM wish_group_members WHERE wishlist_id=$1 AND space=$2 AND wish_id IN ($3,$4)",
      [req.params.id, space, ...parsed.data.wishIds],
    );
    if (occupied.rowCount) return { status: 409, error: "Желание уже в группе" };
    const id = randomUUID();
    await client.query(
      `INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2),($1,$3)
       ON CONFLICT (wishlist_id,wish_id) DO NOTHING`,
      [req.params.id, ...parsed.data.wishIds],
    );
    await client.query("INSERT INTO wish_groups (id,wishlist_id,space) VALUES ($1,$2,$3)", [id, req.params.id, space]);
    await client.query(
      "INSERT INTO wish_group_members (group_id,wishlist_id,space,wish_id) VALUES ($1,$2,$3,$4),($1,$2,$3,$5)",
      [id, req.params.id, space, ...parsed.data.wishIds],
    );
    return { id, space };
  });
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.status(201).json({ group: { id: outcome.id, listId: req.params.id, space: outcome.space, title: "Группа", wishIds: parsed.data.wishIds } });
}));

app.post("/api/lists/:listId/groups/:groupId/wishes", requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({ wishId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Желание не выбрано" });
  const outcome = await runWishGroupTransaction(req.params.listId, async (client) => {
    const list = await client.query(
      "SELECT id FROM wishlists WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.listId, req.user.id],
    );
    if (!list.rowCount) return { status: 404, error: "Список не найден" };
    const group = await client.query(
      "SELECT id,space FROM wish_groups WHERE id=$1 AND wishlist_id=$2 FOR UPDATE",
      [req.params.groupId, req.params.listId],
    );
    if (!group.rowCount) return { status: 404, error: "Группа не найдена" };
    const wish = await client.query(
      "SELECT id FROM wishes WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [parsed.data.wishId, req.user.id],
    );
    if (!wish.rowCount) return { status: 404, error: "Желание не найдено" };
    const occupied = await client.query(
      "SELECT group_id FROM wish_group_members WHERE wishlist_id=$1 AND space=$2 AND wish_id=$3",
      [req.params.listId, group.rows[0].space, parsed.data.wishId],
    );
    if (occupied.rowCount) return { status: 409, error: "Желание уже в группе" };
    await client.query(
      `INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)
       ON CONFLICT (wishlist_id,wish_id) DO NOTHING`,
      [req.params.listId, parsed.data.wishId],
    );
    await client.query(
      "INSERT INTO wish_group_members (group_id,wishlist_id,space,wish_id) VALUES ($1,$2,$3,$4)",
      [req.params.groupId, req.params.listId, group.rows[0].space, parsed.data.wishId],
    );
    return { wishId: parsed.data.wishId };
  });
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.status(201).json({ wishId: outcome.wishId });
}));

app.delete("/api/lists/:listId/groups/:groupId/wishes/:wishId", requireAuth, asyncRoute(async (req, res) => {
  const outcome = await runWishGroupTransaction(req.params.listId, (client) => removeWishFromOwnedGroup({
    client,
    groupId: req.params.groupId,
    listId: req.params.listId,
    wishId: req.params.wishId,
    userId: req.user.id,
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.json({ ok: true, wishId: outcome.wishId, dissolved: outcome.dissolved, group: outcome.group });
}));

app.patch("/api/lists/:listId/groups/:groupId", requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({ title: z.string().trim().min(1).max(60) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте название группы" });
  const result = await query(
    `UPDATE wish_groups g SET title=$1
     FROM wishlists l
     WHERE g.id=$2 AND g.wishlist_id=$3 AND l.id=g.wishlist_id AND l.user_id=$4
     RETURNING g.id,g.title`,
    [parsed.data.title, req.params.groupId, req.params.listId, req.user.id],
  );
  if (!result.rowCount) return res.status(404).json({ error: "Группа не найдена" });
  res.json({ group: { id: result.rows[0].id, title: result.rows[0].title } });
}));

app.delete("/api/lists/:listId/groups/:groupId", requireAuth, asyncRoute(async (req, res) => {
  const result = await deleteOwnedWishGroup({
    groupId: req.params.groupId,
    listId: req.params.listId,
    userId: req.user.id,
  });
  if (!result.rowCount) return res.status(404).json({ error: "Группа не найдена" });
  res.json({ ok: true });
}));

app.post("/api/lists", requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({
    title: z.string().trim().min(1).max(80),
    description: z.string().trim().max(300).default(""),
    privacy: z.enum(["public", "followers", "link", "private"]).default("public"),
    occasionDate: z.string().date().nullable().optional(),
    color: z.enum(["coral", "blue", "lime", "sun", "ink"]).default("coral"),
    space: listSpaceSchema.default("products"),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Укажите название и настройки списка" });
  const id = randomUUID();
  const token = randomBytes(10).toString("base64url");
  const data = parsed.data;
  await query(
    `INSERT INTO wishlists (id,user_id,title,description,privacy,occasion_date,color,share_token,space)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, req.user.id, data.title, data.description, data.privacy, data.occasionDate || null, data.color, token, data.space],
  );
  const result = await query("SELECT *,0 AS wish_count FROM wishlists WHERE id=$1", [id]);
  res.status(201).json({ list: mapList(result.rows[0]) });
}));

app.patch("/api/lists/:id", requireAuth, asyncRoute(async (req, res) => {
  const patchSchema = z.object({
    title: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(300).optional(),
    privacy: z.enum(["public", "followers", "link", "private"]).optional(),
    occasionDate: z.string().date().nullable().optional(),
    color: z.enum(["coral", "blue", "lime", "sun", "ink"]).optional(),
    space: listSpaceSchema.optional(),
  });
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте настройки списка" });
  const data = parsed.data;
  const outcome = await withMutationLock(`list:${req.params.id}`, () => transaction(async (client) => {
    const owned = await client.query(
      "SELECT * FROM wishlists WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.id, req.user.id],
    );
    if (!owned.rowCount) return { status: 404, error: "Список не найден" };
    const current = owned.rows[0];
    await client.query(
      `UPDATE wishlists SET title=$1,description=$2,privacy=$3,occasion_date=$4,color=$5,space=$6 WHERE id=$7`,
      [data.title ?? current.title, data.description ?? current.description, data.privacy ?? current.privacy, data.occasionDate === undefined ? current.occasion_date : data.occasionDate, data.color ?? current.color, data.space ?? current.space, current.id],
    );
    return { status: 200, id: current.id };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  const result = await query("SELECT * FROM wishlists WHERE id=$1", [outcome.id]);
  const count = await query(
    `SELECT COUNT(*) AS count FROM wishlist_wishes ww
     JOIN wishes w ON w.id=ww.wish_id
     WHERE ww.wishlist_id=$1 AND w.status='active'`,
    [outcome.id],
  );
  res.json({ list: mapList({ ...result.rows[0], wish_count: count.rows[0].count }) });
}));

app.delete("/api/lists/:id", requireAuth, asyncRoute(async (req, res) => {
  const outcome = await withMutationLock(`list:${req.params.id}`, () => transaction(async (client) => {
    const owned = await client.query(
      "SELECT id,privacy FROM wishlists WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.id, req.user.id],
    );
    if (!owned.rowCount) return { status: 404, error: "Список не найден" };

    const fallback = await client.query(
      `SELECT id FROM wishlists
       WHERE user_id=$1 AND id<>$2
       ORDER BY CASE WHEN title='Мои желания' THEN 0 ELSE 1 END, created_at
       LIMIT 1 FOR UPDATE`,
      [req.user.id, req.params.id],
    );
    if (!fallback.rowCount) return { status: 400, error: "Нельзя удалить единственный список" };

    const linked = await client.query("SELECT wish_id FROM wishlist_wishes WHERE wishlist_id=$1", [req.params.id]);
    let reassignedCount = 0;
    for (const row of linked.rows) {
      const other = await client.query(
        "SELECT 1 FROM wishlist_wishes WHERE wish_id=$1 AND wishlist_id<>$2 LIMIT 1",
        [row.wish_id, req.params.id],
      );
      if (other.rowCount) continue;
      await client.query(
        "INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2) ON CONFLICT (wishlist_id,wish_id) DO NOTHING",
        [fallback.rows[0].id, row.wish_id],
      );
      if (owned.rows[0].privacy !== "public") {
        await client.query("UPDATE wishes SET privacy='private' WHERE id=$1", [row.wish_id]);
      }
      reassignedCount += 1;
    }
    await client.query("DELETE FROM wishlists WHERE id=$1", [req.params.id]);
    return { status: 200, reassignedCount, fallbackListId: fallback.rows[0].id };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.json({ ok: true, reassignedCount: outcome.reassignedCount, fallbackListId: outcome.fallbackListId });
}));

const uniqueListIds = (listIds) => new Set(listIds).size === listIds.length;

const listIdsSchema = z.array(z.string()).refine(
  uniqueListIds,
  { message: "Список нельзя выбрать дважды" },
);

// Желание теперь может существовать без списка: пространство задаёт
// собственное поле space желания, поэтому пустой listIds разрешён и при создании.
const createListIdsSchema = listIdsSchema;

const wishFieldsSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).default(""),
  url: z.string().url().max(2000).or(z.literal("")).default(""),
  imageUrl: z.string().url().max(2000).or(localImageUrlSchema).or(z.literal("")).default(""),
  fundraisingUrl: z.string().url().max(2000).or(z.literal("")).default(""),
  price: z.coerce.number().min(0).max(999999999).nullable().optional(),
  currency: z.enum(["RUB", "USD", "EUR", "KZT", "BYN"]).default("RUB"),
  priority: z.coerce.number().int().min(1).max(3).default(2),
  privacy: z.enum(["inherit", "private"]).default("inherit"),
  allowMultiple: z.boolean().default(false),
  eventDate: z.string().date().nullable().default(null),
  space: listSpaceSchema.nullable().optional(),
});

// Создание: пустой listIds разрешён — желание живёт в своём пространстве (space).
const wishSchema = wishFieldsSchema.extend({ listIds: createListIdsSchema });

// Патч: listIds: [] по-прежнему разрешён для намеренной отвязки желания от списков.
const wishPatchSchema = wishFieldsSchema.extend({ listIds: listIdsSchema });

app.post("/api/wishes", requireAuth, asyncRoute(async (req, res) => {
  const parsed = wishSchema.safeParse(req.body);
  if (!parsed.success) {
    const listIdsIssue = parsed.error.issues.find((issue) => issue.path[0] === "listIds");
    if (listIdsIssue) return res.status(400).json({ error: listIdsIssue.message });
    return res.status(400).json({ error: "Добавьте название и проверьте данные желания" });
  }
  const data = parsed.data;
  const ownedLists = await query("SELECT id FROM wishlists WHERE user_id=$1", [req.user.id]);
  const ownedIds = new Set(ownedLists.rows.map((row) => row.id));
  if (data.listIds.some((id) => !ownedIds.has(id))) return res.status(403).json({ error: "Список вам не принадлежит" });
  const id = randomUUID();
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO wishes (id,user_id,title,description,url,image_url,fundraising_url,price,currency,priority,privacy,allow_multiple,event_date,space)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, req.user.id, data.title, data.description, data.url, data.imageUrl, data.fundraisingUrl, data.price ?? null, data.currency, data.priority, data.privacy, data.allowMultiple, data.eventDate, data.space ?? null],
    );
    for (const listId of data.listIds) await client.query("INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)", [listId, id]);
  });
  const result = await getWishes(req.user.id, req.user.id, true);
  res.status(201).json({ wish: result.find((wish) => wish.id === id) });
}));

app.post("/api/wishes/backfill-previews", requireAuth, previewBackfillRateLimit, asyncRoute(async (req, res) => {
  res.json(await deduplicatedPreviewBackfill(req.user.id));
}));

app.patch("/api/wishes/:id", requireAuth, asyncRoute(async (req, res) => {
  const outcome = await withMutationLock(`wish:${req.params.id}`, () => transaction(async (client) => {
    const owned = await client.query(
      "SELECT * FROM wishes WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.id, req.user.id],
    );
    if (!owned.rowCount) return { status: 404, error: "Желание не найдено" };
    const current = owned.rows[0];
    const currentLinks = await client.query("SELECT wishlist_id FROM wishlist_wishes WHERE wish_id=$1", [current.id]);
    const merged = {
      title: req.body.title ?? current.title,
      description: req.body.description ?? current.description,
      url: req.body.url ?? current.url,
      imageUrl: req.body.imageUrl ?? current.image_url,
      fundraisingUrl: req.body.fundraisingUrl ?? current.fundraising_url,
      price: req.body.price === undefined ? current.price : req.body.price,
      currency: req.body.currency ?? current.currency,
      priority: req.body.priority ?? current.priority,
      privacy: req.body.privacy ?? current.privacy,
      allowMultiple: req.body.allowMultiple ?? current.allow_multiple,
      eventDate: req.body.eventDate === undefined ? formatEventDate(current.event_date) : req.body.eventDate,
      space: req.body.space === undefined ? current.space : req.body.space,
      listIds: req.body.listIds ?? currentLinks.rows.map((row) => row.wishlist_id),
    };
    const parsed = wishPatchSchema.safeParse(merged);
    if (!parsed.success) return { status: 400, error: "Проверьте данные желания" };
    const data = parsed.data;
    const ownedLists = await client.query("SELECT id FROM wishlists WHERE user_id=$1", [req.user.id]);
    const ownedIds = new Set(ownedLists.rows.map((row) => row.id));
    if (data.listIds.some((id) => !ownedIds.has(id))) {
      return { status: 403, error: "Список вам не принадлежит" };
    }
    await client.query(
      `UPDATE wishes SET title=$1,description=$2,url=$3,image_url=$4,fundraising_url=$5,price=$6,currency=$7,priority=$8,privacy=$9,allow_multiple=$10,event_date=$11,space=$12 WHERE id=$13`,
      [data.title, data.description, data.url, data.imageUrl, data.fundraisingUrl, data.price ?? null, data.currency, data.priority, data.privacy, data.allowMultiple, data.eventDate, data.space ?? null, current.id],
    );
    const reservations = await client.query(
      "SELECT id FROM reservations WHERE wish_id=$1 ORDER BY created_at,id",
      [current.id],
    );
    if (data.allowMultiple) {
      await client.query("UPDATE reservations SET status='multiple' WHERE wish_id=$1", [current.id]);
    } else if (reservations.rowCount) {
      const [kept, ...duplicates] = reservations.rows;
      for (const duplicate of duplicates) await client.query("DELETE FROM reservations WHERE id=$1", [duplicate.id]);
      await client.query("UPDATE reservations SET status='reserved' WHERE id=$1", [kept.id]);
    }
    await client.query("DELETE FROM wishlist_wishes WHERE wish_id=$1", [current.id]);
    for (const listId of data.listIds) await client.query("INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)", [listId, current.id]);
    await client.query(
      "DELETE FROM wish_group_members WHERE wish_id=$1 AND NOT (wishlist_id = ANY($2::text[]))",
      [current.id, data.listIds],
    );
    const ownedGroupMembers = await client.query(
      `SELECT g.id,m.wish_id FROM wish_groups g
       JOIN wishlists l ON l.id=g.wishlist_id
       LEFT JOIN wish_group_members m ON m.group_id=g.id
       WHERE l.user_id=$1`,
      [req.user.id],
    );
    const groupMemberCounts = new Map();
    for (const row of ownedGroupMembers.rows) {
      groupMemberCounts.set(row.id, (groupMemberCounts.get(row.id) || 0) + (row.wish_id ? 1 : 0));
    }
    for (const [groupId, memberCount] of groupMemberCounts) {
      if (memberCount < 2) await client.query("DELETE FROM wish_groups WHERE id=$1", [groupId]);
    }
    return { status: 200, id: current.id };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  const result = await getWishes(req.user.id, req.user.id, true);
  res.json({ wish: result.find((wish) => wish.id === outcome.id) });
}));

app.post("/api/wishes/:id/lists/:listId", requireAuth, asyncRoute(async (req, res) => {
  const outcome = await withMutationLock(`wish:${req.params.id}`, () => transaction(async (client) => {
    const [ownedWish, ownedList] = await Promise.all([
      client.query(
        "SELECT id FROM wishes WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [req.params.id, req.user.id],
      ),
      client.query(
        "SELECT id FROM wishlists WHERE id=$1 AND user_id=$2",
        [req.params.listId, req.user.id],
      ),
    ]);
    if (!ownedWish.rowCount) return { status: 404, error: "Желание не найдено" };
    if (!ownedList.rowCount) return { status: 403, error: "Список вам не принадлежит" };
    await client.query(
      "INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2) ON CONFLICT (wishlist_id,wish_id) DO NOTHING",
      [req.params.listId, req.params.id],
    );
    return { status: 200, id: req.params.id };
  }));
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  const result = await getWishes(req.user.id, req.user.id, true);
  res.json({ wish: result.find((wish) => wish.id === outcome.id) });
}));

app.post("/api/wishes/:id/fulfilled", requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({ fulfilled: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте статус желания" });
  const requestedStatus = parsed.data.fulfilled === undefined
    ? null
    : parsed.data.fulfilled ? "fulfilled" : "active";
  const result = requestedStatus
    ? await query(
      "UPDATE wishes SET status=$3 WHERE id=$1 AND user_id=$2 RETURNING status",
      [req.params.id, req.user.id, requestedStatus],
    )
    : await query(
      "UPDATE wishes SET status=CASE WHEN status='fulfilled' THEN 'active' ELSE 'fulfilled' END WHERE id=$1 AND user_id=$2 RETURNING status",
      [req.params.id, req.user.id],
    );
  if (!result.rowCount) return res.status(404).json({ error: "Желание не найдено" });
  res.json({ status: result.rows[0].status });
}));

app.delete("/api/wishes/:id", requireAuth, asyncRoute(async (req, res) => {
  const result = await withMutationLock(`wish:${req.params.id}`, () => transaction(async (client) => {
    const owned = await client.query(
      "SELECT id FROM wishes WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.id, req.user.id],
    );
    if (!owned.rowCount) return { rowCount: 0, rows: [] };
    return client.query("DELETE FROM wishes WHERE id=$1 AND user_id=$2 RETURNING id", [req.params.id, req.user.id]);
  }));
  if (!result.rowCount) return res.status(404).json({ error: "Желание не найдено" });
  res.json({ ok: true });
}));

app.post("/api/wishes/:id/copy", requireAuth, asyncRoute(async (req, res) => {
  const found = await query("SELECT * FROM wishes WHERE id=$1 AND status='active'", [req.params.id]);
  if (!found.rowCount) return res.status(404).json({ error: "Желание не найдено" });
  const source = found.rows[0];
  if (source.user_id === req.user.id) return res.status(400).json({ error: "Это желание уже находится в вашем списке" });
  const shareToken = typeof req.body?.shareToken === "string" ? req.body.shareToken : "";
  if (!(await canViewWish(source, req.user.id, shareToken))) return res.status(404).json({ error: "Желание не найдено" });

  const requestedListId = typeof req.body?.listId === "string" ? req.body.listId : "";
  const target = requestedListId
    ? await query("SELECT id FROM wishlists WHERE id=$1 AND user_id=$2", [requestedListId, req.user.id])
    : await query(
      `SELECT id FROM wishlists WHERE user_id=$1
       ORDER BY CASE WHEN title='Мои желания' THEN 0 ELSE 1 END, created_at LIMIT 1`,
      [req.user.id],
    );
  if (!target.rowCount) return res.status(400).json({ error: "Сначала создайте список желаний" });

  const id = await withMutationLock(`wish-like:${req.user.id}:${source.id}`, () => transaction(async (client) => {
    const existing = await client.query(
      "SELECT id FROM wishes WHERE user_id=$1 AND source_wish_id=$2 LIMIT 1",
      [req.user.id, source.id],
    );
    if (existing.rowCount) return existing.rows[0].id;
    const copyId = randomUUID();
    await client.query(
      `INSERT INTO wishes (id,user_id,title,description,url,image_url,fundraising_url,price,currency,priority,privacy,allow_multiple,event_date,space,source_wish_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'inherit',FALSE,$11,$12,$13)`,
      [copyId, req.user.id, source.title, source.description, source.url, source.image_url, source.fundraising_url, source.price, source.currency, source.priority, source.event_date, source.space, source.id],
    );
    await client.query("INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)", [target.rows[0].id, copyId]);
    return copyId;
  }));
  const wishes = await getWishes(req.user.id, req.user.id, true);
  res.status(201).json({ wish: wishes.find((wish) => wish.id === id) });
}));

app.post("/api/metadata", requireAuth, metadataRateLimit, asyncRoute(async (req, res) => {
  const parsed = z.object({ url: z.string().url().max(2000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Нужна корректная ссылка" });
  const metadataUrl = new URL(parsed.data.url);
  metadataUrl.hash = "";
  const kinopoiskUrlError = kinopoiskContentUrlError(metadataUrl);
  if (kinopoiskUrlError) {
    return res.status(422).json({
      error: kinopoiskUrlError,
      code: "kinopoisk_content_url_required",
    });
  }
  const cacheUrl = canonicalRetailerProductUrl(metadataUrl) || metadataUrl;
  const cacheKey = cacheUrl.href;
  const cached = metadataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return res.json(cached.value);
  if (cached) metadataCache.delete(cacheKey);

  try {
    let value;
    if (isYouTubeUrl(metadataUrl)) {
      // YouTube watch pages are heavy and often hide og:image; the oEmbed
      // endpoint is the reliable source. On any failure we still return the
      // deterministic thumbnail so the wish preview always gets an image.
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(metadataUrl.href)}&format=json`;
        const { json } = await fetchPublicJson(oembedUrl);
        value = parseYouTubeMetadata(json, metadataUrl);
      } catch {
        value = {
          title: "",
          description: "",
          imageUrl: youtubeThumbnailUrl(parseYouTubeVideoId(metadataUrl)),
          price: null,
          currency: "",
          kind: "video",
        };
      }
    } else if (isBookmateUrl(metadataUrl)) {
      // Bookmate pages and their social-preview images are protected by a
      // browser challenge. Its public metadata API returns the original cover
      // directly and also resolves legacy Bookmate ids.
      const apiUrl = bookmateApiUrl(metadataUrl);
      const { json, url } = await fetchPublicJson(apiUrl);
      value = parseBookmateMetadata(json, url);
    } else if (isKinopoiskUrl(metadataUrl)) {
      // Film pages redirect anonymous server requests through Yandex SSO. The
      // public Kinopoisk poster CDN is deterministic by content id, so it is a
      // faster and more reliable preview source than scraping the page shell.
      value = parseKinopoiskMetadata(metadataUrl);
    } else {
      const retailerMetadata = await resolveRetailerMetadata(metadataUrl);
      if (retailerMetadata !== null) {
        // Grocery retailers vary between structured product pages, generic app
        // shells and bot challenges. Their adapter validates product data and
        // always supplies a safe local preview if the remote image is unavailable.
        value = retailerMetadata;
      } else {
        const { html, url } = await fetchPublicHtml(metadataUrl);
        value = isYandexMapsUrl(url)
          ? parseYandexMapsMetadata(html, url)
          : parseProductMetadata(html, url);
      }
    }
    // A branded fallback means the retailer temporarily served a challenge or
    // an incomplete app shell. Do not cache that transient result: a retry may
    // receive the public product JSON-LD with its real image and price.
    if (value.previewFallback !== true) {
      if (metadataCache.size >= metadataCacheLimit) metadataCache.delete(metadataCache.keys().next().value);
      metadataCache.set(cacheKey, { value, expiresAt: Date.now() + metadataCacheTtlMs });
    }
    res.json(value);
  } catch (error) {
    if (error instanceof MetadataFetchError) return res.status(error.status).json({ error: error.message });
    throw error;
  }
}));

app.get("/api/profile/:username", asyncRoute(async (req, res) => {
  const found = await query("SELECT * FROM users WHERE username=$1", [req.params.username.toLowerCase()]);
  if (!found.rowCount) return res.status(404).json({ error: "Профиль не найден" });
  const owner = found.rows[0];
  const isOwner = req.user?.id === owner.id;
  const follows = req.user ? await query("SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2", [req.user.id, owner.id]) : { rowCount: 0 };
  const follower = Boolean(follows.rowCount);
  const allLists = await getLists(owner.id);
  const lists = allLists.filter((list) => isOwner || list.privacy === "public" || (list.privacy === "followers" && follower));
  const allowedIds = new Set(lists.map((list) => list.id));
  const wishes = (await getWishes(owner.id, req.user?.id, isOwner))
    .filter((wish) => isOwner || wish.status === "active")
    .filter((wish) => wish.listIds.length === 0 || wish.listIds.some((id) => allowedIds.has(id)))
    .map((wish) => isOwner ? wish : { ...wish, listIds: wish.listIds.filter((id) => allowedIds.has(id)) });
  const stats = await Promise.all([
    query("SELECT COUNT(*) AS count FROM follows WHERE following_id=$1", [owner.id]),
    query("SELECT COUNT(*) AS count FROM follows WHERE follower_id=$1", [owner.id]),
  ]);
  const visibleLists = isOwner ? lists : lists.map(({ shareToken: _shareToken, ...list }) => ({
    ...list,
    wishCount: wishes.filter((wish) => wish.status === "active" && wish.listIds.includes(list.id)).length,
  }));
  res.json({
    profile: { ...cleanUser(owner), email: undefined }, lists: visibleLists, wishes,
    isOwner, isFollowing: follower,
    followersCount: Number(stats[0].rows[0].count), followingCount: Number(stats[1].rows[0].count),
  });
}));

app.get("/api/shared/:token", asyncRoute(async (req, res) => {
  const found = await query(
    `SELECT l.*,u.username,u.name,u.bio,u.avatar_url,u.birthday FROM wishlists l JOIN users u ON u.id=l.user_id WHERE l.share_token=$1`,
    [req.params.token],
  );
  if (!found.rowCount) return res.status(404).json({ error: "Список не найден" });
  const row = found.rows[0];
  const isOwner = req.user?.id === row.user_id;
  let canView = isOwner || row.privacy === "public" || row.privacy === "link";
  if (!canView && row.privacy === "followers" && req.user) {
    const follows = await query(
      "SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2",
      [req.user.id, row.user_id],
    );
    canView = Boolean(follows.rowCount);
  }
  if (!canView) return res.status(404).json({ error: "Список не найден" });
  const list = mapList({ ...row, wish_count: 0 });
  const follows = req.user && !isOwner
    ? await query("SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2", [req.user.id, row.user_id])
    : { rowCount: 0 };
  const wishes = (await getWishes(row.user_id, req.user?.id, isOwner))
    .filter((wish) => wish.listIds.includes(row.id))
    .filter((wish) => isOwner || wish.status === "active")
    .map((wish) => ({ ...wish, listIds: isOwner ? wish.listIds : [row.id], shareToken: req.params.token }));
  res.json({ profile: { id: row.user_id, username: row.username, name: row.name, bio: row.bio, avatarUrl: row.avatar_url, birthday: row.birthday }, list, wishes, isOwner, isFollowing: Boolean(follows.rowCount) });
}));

app.post("/api/profile/:username/follow", requireAuth, asyncRoute(async (req, res) => {
  const found = await query("SELECT id,name,username FROM users WHERE username=$1", [req.params.username.toLowerCase()]);
  if (!found.rowCount) return res.status(404).json({ error: "Профиль не найден" });
  const target = found.rows[0];
  if (target.id === req.user.id) return res.status(400).json({ error: "На себя уже можно положиться" });
  const following = await withMutationLock(`actor:${req.user.id}`, () => transaction(async (client) => {
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [req.user.id]);
    const existing = await client.query(
      "SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2 FOR UPDATE",
      [req.user.id, target.id],
    );
    if (existing.rowCount) {
      await client.query("DELETE FROM follows WHERE follower_id=$1 AND following_id=$2", [req.user.id, target.id]);
      await client.query(
        `DELETE FROM reservations
         WHERE user_id=$1 AND wish_id IN (SELECT id FROM wishes WHERE user_id=$2)`,
        [req.user.id, target.id],
      );
      return false;
    }
    await client.query("INSERT INTO follows (follower_id,following_id) VALUES ($1,$2)", [req.user.id, target.id]);
    return true;
  }));
  res.json({ following });
}));

app.post("/api/wishes/:id/reserve", requireAuth, asyncRoute(async (req, res) => {
  const shareToken = typeof req.body?.shareToken === "string" ? req.body.shareToken : "";
  const note = z.string().trim().max(300).catch("").parse(req.body?.note || "");
  let outcome;
  try {
    outcome = await withMutationLock(`wish:${req.params.id}`, () => withMutationLock(`actor:${req.user.id}`, () => transaction(async (client) => {
      const found = await client.query("SELECT * FROM wishes WHERE id=$1 AND status='active' FOR UPDATE", [req.params.id]);
      if (!found.rowCount) return { status: 404, error: "Желание не найдено" };
      const wish = found.rows[0];
      if (wish.user_id === req.user.id) return { status: 400, error: "Своё желание бронировать не нужно" };
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [req.user.id]);
      if (!(await canViewWish(wish, req.user.id, shareToken, client))) return { status: 404, error: "Желание не найдено" };

      const existing = await client.query("SELECT * FROM reservations WHERE wish_id=$1 AND user_id=$2", [wish.id, req.user.id]);
      if (existing.rowCount) {
        await client.query("DELETE FROM reservations WHERE id=$1", [existing.rows[0].id]);
        return { status: 200, reserved: false };
      }

      const following = await client.query(
        "SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2 FOR UPDATE",
        [req.user.id, wish.user_id],
      );
      if (!following.rowCount) return { status: 403, error: "Сначала подпишитесь на автора желания" };

      if (!wish.allow_multiple) {
        const occupied = await client.query("SELECT 1 FROM reservations WHERE wish_id=$1 AND status IN ('reserved','multiple')", [wish.id]);
        if (occupied.rowCount) return { status: 409, error: "Это желание уже забронировал кто-то другой" };
      }
      const reservationId = randomUUID();
      await client.query(
        "INSERT INTO reservations (id,wish_id,user_id,note,status) VALUES ($1,$2,$3,$4,$5)",
        [reservationId, wish.id, req.user.id, note, wish.allow_multiple ? "multiple" : "reserved"],
      );
      return { status: 201, reserved: true };
    })));
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Это желание уже забронировал кто-то другой" });
    throw error;
  }
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.status(outcome.status).json({ reserved: outcome.reserved });
}));

app.get("/api/people", asyncRoute(async (req, res) => {
  const search = String(req.query.search || "").trim().slice(0, 80);
  const scope = String(req.query.scope || "discover");
  if (!["discover", "subscriptions", "followers"].includes(scope)) {
    return res.status(400).json({ error: "Неизвестный раздел друзей" });
  }
  if (scope !== "discover" && !req.user) {
    return res.status(401).json({ error: "Войдите, чтобы увидеть друзей" });
  }
  const pattern = `%${search.toLowerCase()}%`;
  let result;
  if (scope === "subscriptions") {
    result = await query(
      `SELECT u.id,u.username,u.name,u.bio,u.avatar_url,u.birthday
       FROM follows f JOIN users u ON u.id=f.following_id
       WHERE f.follower_id=$2 AND (LOWER(u.name) LIKE $1 OR LOWER(u.username) LIKE $1)
       ORDER BY f.created_at DESC LIMIT 48`,
      [pattern, req.user.id],
    );
  } else if (scope === "followers") {
    result = await query(
      `SELECT u.id,u.username,u.name,u.bio,u.avatar_url,u.birthday
       FROM follows f JOIN users u ON u.id=f.follower_id
       WHERE f.following_id=$2 AND (LOWER(u.name) LIKE $1 OR LOWER(u.username) LIKE $1)
       ORDER BY f.created_at DESC LIMIT 48`,
      [pattern, req.user.id],
    );
  } else {
    result = await query(
      `SELECT u.id,u.username,u.name,u.bio,u.avatar_url,u.birthday
       FROM users u
       WHERE (LOWER(u.name) LIKE $1 OR LOWER(u.username) LIKE $1)
         AND ($2::text IS NULL OR u.id<>$2)
       ORDER BY u.created_at DESC LIMIT 48`,
      [pattern, req.user?.id || null],
    );
  }
  const relationships = new Map(result.rows.map((row) => [row.id, { isFollowing: false, isFollower: false }]));
  if (req.user && result.rows.length) {
    const idPlaceholders = result.rows.map((_, index) => `$${index + 2}`).join(",");
    const relationRows = await query(
      `SELECT follower_id,following_id FROM follows
       WHERE (follower_id=$1 AND following_id IN (${idPlaceholders}))
          OR (following_id=$1 AND follower_id IN (${idPlaceholders}))`,
      [req.user.id, ...result.rows.map((row) => row.id)],
    );
    for (const relation of relationRows.rows) {
      const personId = relation.follower_id === req.user.id ? relation.following_id : relation.follower_id;
      const flags = relationships.get(personId);
      if (!flags) continue;
      if (relation.follower_id === req.user.id) flags.isFollowing = true;
      if (relation.following_id === req.user.id) flags.isFollower = true;
    }
  }

  const countParameters = result.rows.flatMap((row) => [row.id, relationships.get(row.id)?.isFollowing || false]);
  const countRows = result.rows.map((_, index) => (
    `SELECT $${index * 2 + 1}::text AS user_id,$${index * 2 + 2}::boolean AS can_view_followers`
  )).join(" UNION ALL ");
  const wishCounts = new Map();
  if (countRows) {
    const wishCountRows = await query(
      `WITH visible_users AS (${countRows})
       SELECT vu.user_id,COUNT(DISTINCT w.id) AS count
       FROM visible_users vu
       JOIN wishes w ON w.user_id=vu.user_id
       LEFT JOIN wishlist_wishes ww ON ww.wish_id=w.id
       LEFT JOIN wishlists l ON l.id=ww.wishlist_id
       WHERE w.status='active' AND w.privacy<>'private'
         AND w.id NOT IN (
           SELECT secret_ww.wish_id FROM wishlist_wishes secret_ww
           JOIN wishlists secret_list ON secret_list.id=secret_ww.wishlist_id
           WHERE secret_list.privacy='private'
         )
         AND (ww.wish_id IS NULL OR l.privacy='public' OR (vu.can_view_followers AND l.privacy='followers'))
       GROUP BY vu.user_id`,
      countParameters,
    );
    for (const row of wishCountRows.rows) wishCounts.set(row.user_id, Number(row.count));
  }

  const people = result.rows.map((row) => {
    const relationship = relationships.get(row.id);
    return {
      id: row.id,
      username: row.username,
      name: row.name,
      bio: row.bio,
      avatarUrl: row.avatar_url,
      birthday: row.birthday,
      wishCount: wishCounts.get(row.id) || 0,
      isFollowing: relationship?.isFollowing || false,
      isFollower: relationship?.isFollower || false,
    };
  });
  people.sort(scope === "discover"
    ? (a, b) => b.wishCount - a.wishCount || a.name.localeCompare(b.name, "ru")
    : (a, b) => a.name.localeCompare(b.name, "ru"));
  res.json({ people, scope });
}));

app.use("/api", (_req, res) => res.status(404).json({ error: "Маршрут API не найден" }));

const redirectLegacyProfile = (req, res) => res.redirect(301, legacyProfileTarget(req.params, req.originalUrl));
for (const prefix of ["u", "users"]) {
  app.get(`/${prefix}/:username`, redirectLegacyProfile);
  app.get(`/${prefix}/:username/lists/:listId`, redirectLegacyProfile);
  app.get(`/${prefix}/:username/wishes/:wishId`, redirectLegacyProfile);
}

if (isProduction) {
  const distPath = path.resolve(__dirname, "../dist");
  app.use(express.static(distPath, { maxAge: "1y", immutable: true, index: false }));
  app.get("*splat", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
}

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof z.ZodError) return res.status(400).json({ error: "Проверьте введённые данные" });
  if (error?.type === "entity.too.large") return res.status(413).json({ error: "Изображение должно быть не больше 8 МБ" });
  res.status(500).json({ error: "Внутренняя ошибка. Мы уже разбираемся." });
});

await initializeDatabase();

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Rollapp server listening on ${port}`);
});

async function shutdown() {
  server.close(async () => {
    if (backgroundTasks.size) {
      await Promise.race([
        Promise.allSettled([...backgroundTasks]),
        new Promise((resolve) => setTimeout(resolve, 20_000)),
      ]);
    }
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
