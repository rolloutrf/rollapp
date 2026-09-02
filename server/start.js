import "dotenv/config";
import dotenv from "dotenv";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { loadLockboxValue } from "./lockbox.js";

dotenv.config({ path: ".env.local", override: false, quiet: true });

async function loadDatabaseLockboxSecret() {
  const secretId = process.env.YC_LOCKBOX_SECRET_ID;
  const secretKey = process.env.YC_LOCKBOX_SECRET_KEY || "postgresql_password";
  if (!secretId || process.env.PGPASSWORD) return;
  process.env.PGPASSWORD = await loadLockboxValue(secretId, secretKey);
  console.log("Runtime database credential loaded from Yandex Lockbox");
}

async function loadAutoDatabaseLockboxSecret() {
  const secretId = process.env.YC_AUTO_DATABASE_LOCKBOX_SECRET_ID;
  const secretKey = process.env.YC_AUTO_DATABASE_LOCKBOX_SECRET_KEY || "postgresql_password";
  if (!secretId || process.env.AUTO_PGPASSWORD || process.env.AUTO_DATABASE_URL) return;
  process.env.AUTO_PGPASSWORD = await loadLockboxValue(secretId, secretKey);
  console.log("Runtime auto database credential loaded from Yandex Lockbox");
}

async function loadPhoneAuthLockboxSecret() {
  const secretId = process.env.YC_PHONE_AUTH_LOCKBOX_SECRET_ID;
  const secretKey = process.env.YC_PHONE_AUTH_LOCKBOX_SECRET_KEY || "phone_auth_secret";
  if (!secretId || process.env.PHONE_AUTH_SECRET) return;
  process.env.PHONE_AUTH_SECRET = await loadLockboxValue(secretId, secretKey);
  console.log("Runtime phone authentication credential loaded from Yandex Lockbox");
}

async function loadTelegramLockboxSecrets() {
  const secretId = process.env.YC_TELEGRAM_LOCKBOX_SECRET_ID;
  if (!secretId) return;
  let loaded = false;
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    process.env.TELEGRAM_BOT_TOKEN = await loadLockboxValue(
      secretId,
      process.env.YC_TELEGRAM_BOT_TOKEN_KEY || "bot_token",
    );
    loaded = true;
  }
  if (!process.env.TELEGRAM_WEBHOOK_SECRET) {
    process.env.TELEGRAM_WEBHOOK_SECRET = await loadLockboxValue(
      secretId,
      process.env.YC_TELEGRAM_WEBHOOK_SECRET_KEY || "webhook_secret",
    );
    loaded = true;
  }
  if (loaded) console.log("Runtime Telegram credentials loaded from Yandex Lockbox");
}

async function loadYandexOauthSecrets() {
  const secretId = process.env.YC_YANDEX_OAUTH_LOCKBOX_SECRET_ID;
  if (!secretId) return;
  let loaded = false;
  if (!process.env.YANDEX_OAUTH_CLIENT_ID) {
    process.env.YANDEX_OAUTH_CLIENT_ID = await loadLockboxValue(
      secretId,
      process.env.YC_YANDEX_OAUTH_CLIENT_ID_KEY || "client_id",
    );
    loaded = true;
  }
  if (!process.env.YANDEX_OAUTH_CLIENT_SECRET) {
    process.env.YANDEX_OAUTH_CLIENT_SECRET = await loadLockboxValue(
      secretId,
      process.env.YC_YANDEX_OAUTH_CLIENT_SECRET_KEY || "client_secret",
    );
    loaded = true;
  }
  if (loaded) console.log("Runtime Yandex OAuth credentials loaded from Yandex Lockbox");
}

async function loadOpenRouterLockboxSecret() {
  const secretId = process.env.YC_OPENROUTER_LOCKBOX_SECRET_ID;
  if (!secretId || process.env.OPENROUTER_API_KEY) return;
  process.env.OPENROUTER_API_KEY = await loadLockboxValue(
    secretId,
    process.env.YC_OPENROUTER_API_KEY_KEY || "api_key",
  );
  console.log("Runtime OpenRouter credential loaded from Yandex Lockbox");
}

async function loadUserCredentialsLockboxSecret() {
  const secretId = process.env.YC_USER_CREDENTIALS_LOCKBOX_SECRET_ID;
  if (!secretId || process.env.USER_CREDENTIALS_SECRET) return;
  process.env.USER_CREDENTIALS_SECRET = await loadLockboxValue(
    secretId,
    process.env.YC_USER_CREDENTIALS_SECRET_KEY || "encryption_secret",
  );
  console.log("Runtime user credential encryption secret loaded from Yandex Lockbox");
}

await loadDatabaseLockboxSecret();
await loadAutoDatabaseLockboxSecret();
await loadPhoneAuthLockboxSecret();
await loadTelegramLockboxSecrets();
await loadYandexOauthSecrets();
await loadOpenRouterLockboxSecret();
await loadUserCredentialsLockboxSecret();

const { getTelegramBotRuntimeConfig, startTelegramBotPolling } = await import("./telegram-bot.js");
const telegramConfig = getTelegramBotRuntimeConfig();
if (telegramConfig.deliveryMode === "polling" && telegramConfig.enabled) {
  startTelegramBotPolling(telegramConfig);
  console.log(`Telegram bot @${telegramConfig.botUsername} polling started`);
}

if (process.env.PUBLIC_HOST && fs.existsSync("/usr/sbin/caddy")) {
  const caddy = spawn("/usr/sbin/caddy", ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"], { stdio: "inherit" });
  caddy.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`Caddy exited with code ${code}`);
      process.exit(code);
    }
  });
}

await import("./index.js");
