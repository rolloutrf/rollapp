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
import { pool, query, transaction } from "./db.js";
import { addDefaultFriend } from "./default-friend.js";
import { deleteOwnedWishGroup } from "./wish-groups.js";
import { fetchPublicHtml, fetchPublicJson, MetadataFetchError } from "./metadata-fetch.js";
import {
  isYandexMapsUrl,
  isYouTubeUrl,
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 8080);
const isProduction = process.env.NODE_ENV === "production";
const trustedAppOrigins = configuredTrustedOrigins(process.env.APP_ORIGIN);
const sessionCookie = "rw_session";
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
const metadataRateLimit = createRateLimit({ windowMs: 5 * 60 * 1000, max: 40 });
const imageUploadRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
const imageUploadBody = express.raw({
  type: ["image/jpeg", "image/png", "image/webp"],
  limit: "8mb",
});
const metadataCache = new Map();
const metadataCacheTtlMs = 10 * 60 * 1000;
const metadataCacheLimit = 500;
const mutationLocks = new Map();
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
    createdAt: row.created_at,
  };
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
    `SELECT u.* FROM sessions s
     JOIN users u ON u.id = s.user_id
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

async function uniqueUsername(name) {
  const base = slugify(name);
  for (const candidate of profileUsernameCandidates(base)) {
    const found = await query("SELECT 1 FROM users WHERE username = $1", [candidate]);
    if (!found.rowCount) return candidate;
  }
  return `${base}-${randomBytes(3).toString("hex")}`;
}

const credentialsSchema = z.object({
  email: z.string().email().max(160).transform((value) => value.toLowerCase().trim()),
  password: z.string().min(8).max(128),
});

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
  return res.json({ user: cleanUser(result.user) });
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
  return res.json({ user: cleanUser(result.user), telegram: publicTelegramUser(identity.user) });
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
  res.status(201).json({ user: cleanUser(result.rows[0]) });
}));

app.post("/api/auth/login", authRateLimit, asyncRoute(async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Введите корректные email и пароль" });
  const result = await query("SELECT * FROM users WHERE email = $1", [parsed.data.email]);
  const user = result.rows[0];
  if (!user || !(await verifyPassword(parsed.data.password, user.password_hash))) {
    return res.status(401).json({ error: "Неверные email или пароль" });
  }
  await createSession(res, user.id);
  res.json({ user: cleanUser(user) });
}));

app.post("/api/auth/demo", asyncRoute(async (_req, res) => {
  if (process.env.DEMO_MODE === "false") return res.status(404).json({ error: "Демо-вход отключён" });
  const result = await query("SELECT * FROM users WHERE email = $1", ["demo@rollapp.test"]);
  if (!result.rowCount) return res.status(404).json({ error: "Демо-профиль не найден" });
  await createSession(res, result.rows[0].id);
  res.json({ user: cleanUser(result.rows[0]) });
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
  return res.json({ user: cleanUser(req.user), telegram: publicTelegramUser(identity.user) });
}));

app.get("/api/me", asyncRoute(async (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: cleanUser(req.user) });
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
    res.json({ user: cleanUser(result.rows[0]) });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Такое имя профиля уже занято" });
    throw error;
  }
}));

async function getLists(userId) {
  const result = await query(
    `SELECT l.* FROM wishlists l WHERE l.user_id=$1 ORDER BY l.created_at`,
    [userId],
  );
  const lists = [];
  for (const row of result.rows) {
    const count = await query(
      `SELECT COUNT(*) AS count FROM wishlist_wishes ww
       JOIN wishes w ON w.id=ww.wish_id
       WHERE ww.wishlist_id=$1 AND w.status='active'`,
      [row.id],
    );
    lists.push(mapList({ ...row, wish_count: count.rows[0].count }));
  }
  return lists;
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
  for (const wish of wishes) {
    if (viewerId === userId) {
      wish.reservationCount = 0;
      wish.reservedByMe = false;
    } else {
      const reservations = await query("SELECT user_id FROM reservations WHERE wish_id=$1 AND status IN ('reserved','multiple')", [wish.id]);
      wish.reservationCount = reservations.rowCount;
      wish.reservedByMe = reservations.rows.some((row) => row.user_id === viewerId);
    }
    const links = await query("SELECT wishlist_id FROM wishlist_wishes WHERE wish_id=$1", [wish.id]);
    wish.listIds = links.rows.map((row) => row.wishlist_id);
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
      `SELECT g.id,g.wishlist_id,g.title,m.wish_id
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
    if (!groupsById.has(row.id)) groupsById.set(row.id, { id: row.id, listId: row.wishlist_id, title: row.title, wishIds: [] });
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
    const owned = await client.query(
      "SELECT id FROM wishes WHERE user_id=$1 AND id = ANY($2::text[]) FOR UPDATE",
      [req.user.id, parsed.data.wishIds],
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

app.post("/api/lists/:id/groups", requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({ wishIds: z.array(z.string()).length(2).refine((ids) => new Set(ids).size === 2) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Выберите два разных желания" });
  const outcome = await transaction(async (client) => {
    const list = await client.query("SELECT id FROM wishlists WHERE id=$1 AND user_id=$2 FOR UPDATE", [req.params.id, req.user.id]);
    if (!list.rowCount) return { status: 404, error: "Список не найден" };
    const wishes = await client.query(
      `SELECT ww.wish_id FROM wishlist_wishes ww JOIN wishes w ON w.id=ww.wish_id
       WHERE ww.wishlist_id=$1 AND w.user_id=$2 AND ww.wish_id = ANY($3::text[])`,
      [req.params.id, req.user.id, parsed.data.wishIds],
    );
    if (wishes.rowCount !== 2) return { status: 400, error: "Желания должны быть в этом списке" };
    const occupied = await client.query("SELECT wish_id FROM wish_group_members WHERE wishlist_id=$1 AND wish_id = ANY($2::text[])", [req.params.id, parsed.data.wishIds]);
    if (occupied.rowCount) return { status: 409, error: "Желание уже в группе" };
    const id = randomUUID();
    await client.query("INSERT INTO wish_groups (id,wishlist_id) VALUES ($1,$2)", [id, req.params.id]);
    for (const wishId of parsed.data.wishIds) await client.query("INSERT INTO wish_group_members (group_id,wishlist_id,wish_id) VALUES ($1,$2,$3)", [id, req.params.id, wishId]);
    return { id };
  });
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  res.status(201).json({ group: { id: outcome.id, listId: req.params.id, title: "Группа", wishIds: parsed.data.wishIds } });
}));

app.post("/api/lists/:listId/groups/:groupId/wishes", requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({ wishId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Желание не выбрано" });
  const result = await query(
    `INSERT INTO wish_group_members (group_id,wishlist_id,wish_id)
     SELECT g.id,g.wishlist_id,ww.wish_id FROM wish_groups g
     JOIN wishlists l ON l.id=g.wishlist_id
     JOIN wishlist_wishes ww ON ww.wishlist_id=g.wishlist_id AND ww.wish_id=$1
     JOIN wishes w ON w.id=ww.wish_id AND w.user_id=$2
     WHERE g.id=$3 AND g.wishlist_id=$4 AND l.user_id=$2
     ON CONFLICT (wishlist_id,wish_id) DO NOTHING RETURNING wish_id`,
    [parsed.data.wishId, req.user.id, req.params.groupId, req.params.listId],
  );
  if (!result.rowCount) return res.status(409).json({ error: "Не удалось добавить в группу" });
  res.status(201).json({ wishId: result.rows[0].wish_id });
}));

app.patch("/api/lists/:listId/groups/:groupId", requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({ title: z.string().trim().min(1).max(60) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Название группы должно быть от 1 до 60 символов" });
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

  const id = randomUUID();
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO wishes (id,user_id,title,description,url,image_url,fundraising_url,price,currency,priority,privacy,allow_multiple)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'inherit',FALSE)`,
      [id, req.user.id, source.title, source.description, source.url, source.image_url, source.fundraising_url, source.price, source.currency, source.priority],
    );
    await client.query("INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)", [target.rows[0].id, id]);
  });
  const wishes = await getWishes(req.user.id, req.user.id, true);
  res.status(201).json({ wish: wishes.find((wish) => wish.id === id) });
}));

app.post("/api/metadata", requireAuth, metadataRateLimit, asyncRoute(async (req, res) => {
  const parsed = z.object({ url: z.string().url().max(2000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Нужна корректная ссылка" });
  const cacheUrl = new URL(parsed.data.url);
  cacheUrl.hash = "";
  const cacheKey = cacheUrl.href;
  const cached = metadataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return res.json(cached.value);
  if (cached) metadataCache.delete(cacheKey);

  try {
    let value;
    if (isYouTubeUrl(cacheUrl)) {
      // YouTube watch pages are heavy and often hide og:image; the oEmbed
      // endpoint is the reliable source. On any failure we still return the
      // deterministic thumbnail so the wish preview always gets an image.
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(cacheUrl.href)}&format=json`;
        const { json } = await fetchPublicJson(oembedUrl);
        value = parseYouTubeMetadata(json, cacheUrl);
      } catch {
        value = {
          title: "",
          description: "",
          imageUrl: youtubeThumbnailUrl(parseYouTubeVideoId(cacheUrl)),
          price: null,
          currency: "",
          kind: "video",
        };
      }
    } else {
      const { html, url } = await fetchPublicHtml(cacheUrl);
      value = isYandexMapsUrl(url)
        ? parseYandexMapsMetadata(html, url)
        : parseProductMetadata(html, url);
    }
    if (metadataCache.size >= metadataCacheLimit) metadataCache.delete(metadataCache.keys().next().value);
    metadataCache.set(cacheKey, { value, expiresAt: Date.now() + metadataCacheTtlMs });
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
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
