import "dotenv/config";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { loadLockboxValue } from "./lockbox.js";

async function loadDatabaseLockboxSecret() {
  const secretId = process.env.YC_LOCKBOX_SECRET_ID;
  const secretKey = process.env.YC_LOCKBOX_SECRET_KEY || "postgresql_password";
  if (!secretId || process.env.PGPASSWORD) return;
  process.env.PGPASSWORD = await loadLockboxValue(secretId, secretKey);
  console.log("Runtime database credential loaded from Yandex Lockbox");
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

await loadDatabaseLockboxSecret();
await loadPhoneAuthLockboxSecret();
await loadTelegramLockboxSecrets();

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
