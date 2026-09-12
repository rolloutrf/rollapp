import { loadLockboxValue } from "../server/lockbox.js";
import { forwardTelegramPaymentUpdate, getTelegramBotRuntimeConfig, startTelegramBotPolling } from "../server/telegram-bot.js";
import { startStarInvoiceWorker } from "../server/star-invoice-worker.js";

const secretId = String(process.env.YC_TELEGRAM_LOCKBOX_SECRET_ID || "").trim();
if (!process.env.TELEGRAM_BOT_TOKEN) {
  if (!secretId) throw new Error("YC_TELEGRAM_LOCKBOX_SECRET_ID is required");
  process.env.TELEGRAM_BOT_TOKEN = await loadLockboxValue(
    secretId,
    process.env.YC_TELEGRAM_BOT_TOKEN_KEY || "bot_token",
  );
}

if (!process.env.TELEGRAM_WEBHOOK_SECRET) {
  if (!secretId) throw new Error("TELEGRAM_WEBHOOK_SECRET or YC_TELEGRAM_LOCKBOX_SECRET_ID is required for payment delivery");
  process.env.TELEGRAM_WEBHOOK_SECRET = await loadLockboxValue(secretId, process.env.YC_TELEGRAM_WEBHOOK_SECRET_KEY || "webhook_secret");
}

process.env.TELEGRAM_DELIVERY_MODE = "polling";
const config = getTelegramBotRuntimeConfig();
const runSeconds = Math.min(
  20_400,
  Math.max(60, Number(process.env.TELEGRAM_POLLING_RUN_SECONDS) || 20_400),
);
const poller = startTelegramBotPolling(config, { handleUpdate: (update) => forwardTelegramPaymentUpdate(update, config) });
if (!poller) throw new Error("Telegram polling worker is not configured");
const invoices = startStarInvoiceWorker(config);

let stopped = false;
const stop = () => {
  if (stopped) return;
  stopped = true;
  poller.stop();
  invoices.stop();
};
const timer = setTimeout(stop, runSeconds * 1_000);
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

console.log(`Telegram bot @${config.botUsername} polling worker started`);
await Promise.all([poller.done, invoices.done]);
clearTimeout(timer);
console.log(`Telegram bot @${config.botUsername} polling worker stopped`);
