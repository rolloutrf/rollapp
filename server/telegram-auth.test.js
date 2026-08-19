import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  getTelegramAuthConfig,
  safeSecretEqual,
  TelegramInitDataError,
  validateTelegramInitData,
} from "./telegram-auth.js";

const botToken = "123456789:AAExampleTokenThatIsLongEnoughForTests";
const nowSeconds = 1_786_000_000;

function signedInitData(fields, { token = botToken } = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) params.set(key, typeof value === "string" ? value : JSON.stringify(value));
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  params.set("hash", createHmac("sha256", secretKey).update(dataCheckString).digest("hex"));
  return params.toString();
}

test("validates signed Telegram initData and normalizes its user", () => {
  const initData = signedInitData({
    auth_date: String(nowSeconds - 12),
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    signature: "new-third-party-signature-field-is-part-of-bot-hmac",
    user: {
      id: 2_817_443_759_779_512,
      first_name: " Михаил ",
      last_name: "Колосков",
      username: "koloskof",
      language_code: "ru",
      is_premium: true,
      photo_url: "https://t.me/i/userpic/example.jpg",
    },
  });

  const result = validateTelegramInitData(initData, { botToken, nowSeconds });
  assert.equal(result.authDate, nowSeconds - 12);
  assert.equal(result.queryId, "AAHdF6IQAAAAAN0XohDhrOrc");
  assert.deepEqual(result.user, {
    id: "2817443759779512",
    firstName: "Михаил",
    lastName: "Колосков",
    name: "Михаил Колосков",
    username: "koloskof",
    languageCode: "ru",
    photoUrl: "https://t.me/i/userpic/example.jpg",
    isPremium: true,
  });
});

test("rejects tampering, duplicate parameters, stale data and wrong bot tokens", () => {
  const valid = signedInitData({
    auth_date: String(nowSeconds),
    user: { id: 42, first_name: "Алиса" },
  });
  const tampered = valid.replace("%D0%90%D0%BB%D0%B8%D1%81%D0%B0", "%D0%95%D0%B2%D0%B0");
  assert.throws(() => validateTelegramInitData(tampered, { botToken, nowSeconds }), TelegramInitDataError);
  assert.throws(() => validateTelegramInitData(`${valid}&auth_date=${nowSeconds}`, { botToken, nowSeconds }), /дублирующиеся/);
  assert.throws(
    () => validateTelegramInitData(signedInitData({ auth_date: String(nowSeconds - 901), user: { id: 42, first_name: "Алиса" } }), { botToken, nowSeconds }),
    (error) => error.code === "TELEGRAM_INIT_DATA_EXPIRED",
  );
  assert.throws(() => validateTelegramInitData(valid, { botToken: `${botToken}x`, nowSeconds }), TelegramInitDataError);
});

test("reports runtime configuration without exposing the token and compares webhook secrets safely", () => {
  assert.deepEqual(getTelegramAuthConfig({ TELEGRAM_BOT_USERNAME: "@rollappRFbot" }), {
    enabled: false,
    token: "",
    botUsername: "rollappRFbot",
    maxAgeSeconds: 900,
  });
  assert.equal(safeSecretEqual("abc123_-", "abc123_-"), true);
  assert.equal(safeSecretEqual("abc123", "abc124"), false);
  assert.equal(safeSecretEqual("", ""), false);
});
