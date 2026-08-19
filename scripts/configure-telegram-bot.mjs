import "dotenv/config";
import { callTelegramBotApi, getTelegramBotRuntimeConfig } from "../server/telegram-bot.js";
import { loadLockboxValue } from "../server/lockbox.js";

const secretId = process.env.YC_TELEGRAM_LOCKBOX_SECRET_ID;
if (secretId && !process.env.TELEGRAM_BOT_TOKEN) {
  process.env.TELEGRAM_BOT_TOKEN = await loadLockboxValue(
    secretId,
    process.env.YC_TELEGRAM_BOT_TOKEN_KEY || "bot_token",
  );
}
if (secretId && !process.env.TELEGRAM_WEBHOOK_SECRET) {
  process.env.TELEGRAM_WEBHOOK_SECRET = await loadLockboxValue(
    secretId,
    process.env.YC_TELEGRAM_WEBHOOK_SECRET_KEY || "webhook_secret",
  );
}

const config = getTelegramBotRuntimeConfig();
if (!config.enabled) throw new Error("Set TELEGRAM_BOT_TOKEN and a valid HTTPS TELEGRAM_WEB_APP_URL");
if (!config.webhookEnabled) throw new Error("Set TELEGRAM_WEBHOOK_SECRET to 1-256 letters, digits, underscores or hyphens");

const bot = await callTelegramBotApi("getMe", {}, config);
if (config.botUsername && bot.username?.toLowerCase() !== config.botUsername.toLowerCase()) {
  throw new Error(`The token belongs to @${bot.username}, expected @${config.botUsername}`);
}

const webhookUrl = new URL("/api/telegram/webhook", config.webAppUrl).toString();
if (config.deliveryMode === "polling") {
  await callTelegramBotApi("deleteWebhook", { drop_pending_updates: false }, config);
} else {
  await callTelegramBotApi("setWebhook", {
    url: webhookUrl,
    secret_token: config.webhookSecret,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  }, config);
}
await callTelegramBotApi("setChatMenuButton", {
  menu_button: {
    type: "web_app",
    text: "Открыть Rollapp",
    web_app: { url: config.webAppUrl },
  },
}, config);
await callTelegramBotApi("setMyCommands", {
  commands: [
    { command: "start", description: "Открыть Rollapp" },
    { command: "app", description: "Мои желания" },
  ],
}, config);

console.log(`Telegram bot @${bot.username} configured`);
console.log(`Mini App: ${config.webAppUrl}`);
console.log(config.deliveryMode === "polling" ? "Updates: long polling" : `Webhook: ${webhookUrl}`);
