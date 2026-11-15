import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const PHONE_OTP_CODE_LENGTH = 6;

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function getPhoneAuthPolicy(env = process.env) {
  const resendMinimum = env.NODE_ENV === "test" ? 1 : 30;
  return {
    ttlSeconds: boundedInteger(env.PHONE_OTP_TTL_SECONDS, 300, 120, 600),
    resendSeconds: boundedInteger(env.PHONE_OTP_RESEND_SECONDS, 60, resendMinimum, 300),
    maxAttempts: boundedInteger(env.PHONE_OTP_MAX_ATTEMPTS, 5, 3, 10),
    rateWindowSeconds: boundedInteger(env.PHONE_OTP_RATE_WINDOW_SECONDS, 900, 300, 3600),
    phoneRequestLimit: boundedInteger(env.PHONE_OTP_PHONE_REQUEST_LIMIT, 3, 1, 20),
    ipRequestLimit: boundedInteger(env.PHONE_OTP_IP_REQUEST_LIMIT, 10, 1, 100),
    globalDailyLimit: boundedInteger(env.PHONE_OTP_GLOBAL_DAILY_LIMIT, 100, 1, 100_000),
  };
}

export function normalizeRussianPhone(value) {
  if (typeof value !== "string" || value.length > 64) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (!/^79\d{9}$/.test(digits)) return null;
  return `+${digits}`;
}

export function phoneLast4(phoneE164) {
  return phoneE164.slice(-4);
}

export function maskPhone(last4) {
  if (!/^\d{4}$/.test(String(last4 || ""))) return "";
  return `+7 ••• •••-${last4.slice(0, 2)}-${last4.slice(2)}`;
}

export function createOtpCode() {
  return String(randomInt(0, 10 ** PHONE_OTP_CODE_LENGTH)).padStart(PHONE_OTP_CODE_LENGTH, "0");
}

export function requirePhoneAuthSecret(env = process.env) {
  const secret = String(env.PHONE_AUTH_SECRET || "");
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("PHONE_AUTH_SECRET must contain at least 32 bytes");
  }
  return secret;
}

function digest(secret, scope, value) {
  return createHmac("sha256", secret)
    .update(`rollapp:${scope}:v1\0`, "utf8")
    .update(String(value), "utf8")
    .digest("hex");
}

export function digestPhone(secret, phoneE164) {
  return digest(secret, "phone", phoneE164);
}

export function digestIp(secret, ip) {
  return digest(secret, "ip", String(ip || "unknown"));
}

export function digestOtp(secret, challengeId, code) {
  return digest(secret, "otp", `${challengeId}\0${code}`);
}

export function verifyOtpDigest(secret, challengeId, code, expectedHex) {
  if (!/^[a-f0-9]{64}$/i.test(String(expectedHex || ""))) return false;
  const actual = Buffer.from(digestOtp(secret, challengeId, code), "hex");
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
