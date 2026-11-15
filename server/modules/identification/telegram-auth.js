import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_MAX_AGE_SECONDS = 15 * 60;
const MAX_INIT_DATA_LENGTH = 16_384;
const MAX_FUTURE_SKEW_SECONDS = 30;

export class TelegramInitDataError extends Error {
  constructor(message, code = "TELEGRAM_INIT_DATA_INVALID") {
    super(message);
    this.name = "TelegramInitDataError";
    this.code = code;
  }
}

function invalid(message = "Не удалось подтвердить запуск из Telegram") {
  return new TelegramInitDataError(message);
}

function parsePositiveInteger(value, fieldName) {
  if (!/^\d+$/.test(String(value || ""))) throw invalid(`Telegram ${fieldName} имеет неверный формат`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw invalid(`Telegram ${fieldName} имеет неверный формат`);
  return parsed;
}

function normalizeOptionalText(value, maxLength) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw invalid();
  return value.trim().slice(0, maxLength);
}

function normalizeTelegramUser(rawUser) {
  let user;
  try {
    user = JSON.parse(rawUser);
  } catch {
    throw invalid("Telegram передал повреждённые данные профиля");
  }
  if (!user || typeof user !== "object" || Array.isArray(user) || user.is_bot === true) throw invalid();

  const id = typeof user.id === "number"
    ? (Number.isSafeInteger(user.id) ? String(user.id) : "")
    : String(user.id || "");
  if (!/^[1-9]\d{0,19}$/.test(id)) throw invalid("Telegram передал неверный идентификатор пользователя");

  const firstName = normalizeOptionalText(user.first_name, 128);
  if (!firstName) throw invalid("Telegram не передал имя пользователя");
  const lastName = normalizeOptionalText(user.last_name, 128);
  const username = normalizeOptionalText(user.username, 64);
  const photoUrl = normalizeOptionalText(user.photo_url, 2_000);
  if (photoUrl) {
    try {
      const parsedPhoto = new URL(photoUrl);
      if (parsedPhoto.protocol !== "https:") throw invalid();
    } catch {
      throw invalid("Telegram передал неверную ссылку на фото");
    }
  }

  return {
    id,
    firstName,
    lastName,
    name: [firstName, lastName].filter(Boolean).join(" "),
    username,
    languageCode: normalizeOptionalText(user.language_code, 16),
    photoUrl,
    isPremium: user.is_premium === true,
  };
}

export function getTelegramAuthConfig(env = process.env) {
  const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  const botUsername = String(env.TELEGRAM_BOT_USERNAME || "rollappRFbot").trim().replace(/^@/, "");
  const maxAgeSeconds = Number(env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS || DEFAULT_MAX_AGE_SECONDS);
  return {
    enabled: Boolean(token),
    token,
    botUsername,
    maxAgeSeconds: Number.isFinite(maxAgeSeconds) && maxAgeSeconds >= 60
      ? Math.min(Math.floor(maxAgeSeconds), 24 * 60 * 60)
      : DEFAULT_MAX_AGE_SECONDS,
  };
}

export function validateTelegramInitData(rawInitData, {
  botToken,
  maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1_000),
} = {}) {
  if (!botToken || typeof botToken !== "string") {
    throw new TelegramInitDataError("Вход через Telegram пока не настроен", "TELEGRAM_AUTH_UNAVAILABLE");
  }
  if (typeof rawInitData !== "string" || !rawInitData || rawInitData.length > MAX_INIT_DATA_LENGTH) throw invalid();

  const params = new URLSearchParams(rawInitData);
  const entries = [...params.entries()];
  if (!entries.length) throw invalid();
  const seenKeys = new Set();
  for (const [key] of entries) {
    if (!key || seenKeys.has(key)) throw invalid("Telegram передал дублирующиеся параметры");
    seenKeys.add(key);
  }

  const receivedHash = params.get("hash") || "";
  if (!/^[a-f0-9]{64}$/i.test(receivedHash)) throw invalid();
  const dataCheckString = entries
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest();
  const receivedHashBuffer = Buffer.from(receivedHash, "hex");
  if (receivedHashBuffer.length !== expectedHash.length || !timingSafeEqual(receivedHashBuffer, expectedHash)) throw invalid();

  const authDate = parsePositiveInteger(params.get("auth_date"), "auth_date");
  const ageSeconds = nowSeconds - authDate;
  if (ageSeconds < -MAX_FUTURE_SKEW_SECONDS || ageSeconds > maxAgeSeconds) {
    throw new TelegramInitDataError("Запуск из Telegram устарел. Откройте Rollapp из бота ещё раз", "TELEGRAM_INIT_DATA_EXPIRED");
  }

  const rawUser = params.get("user");
  if (!rawUser) throw invalid("Telegram не передал данные пользователя");
  return {
    user: normalizeTelegramUser(rawUser),
    authDate,
    queryId: normalizeOptionalText(params.get("query_id"), 256),
    startParam: normalizeOptionalText(params.get("start_param"), 128),
  };
}

export function safeSecretEqual(received, expected) {
  if (typeof received !== "string" || typeof expected !== "string" || !received || !expected) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}
