const DEFAULT_WEB_APP_URL = "https://xn--80avakiab.xn--p1ai/";
const WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

function normalizeWebAppUrl(value) {
  try {
    const url = new URL(value || DEFAULT_WEB_APP_URL);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function getTelegramBotRuntimeConfig(env = process.env) {
  const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  const webhookSecret = String(env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  const botUsername = String(env.TELEGRAM_BOT_USERNAME || "rollappRFbot").trim().replace(/^@/, "");
  const webAppUrl = normalizeWebAppUrl(env.TELEGRAM_WEB_APP_URL || DEFAULT_WEB_APP_URL);
  return {
    enabled: Boolean(token && webAppUrl),
    token,
    webhookSecret,
    webhookEnabled: Boolean(token && webAppUrl && WEBHOOK_SECRET_PATTERN.test(webhookSecret)),
    botUsername,
    webAppUrl,
    apiBase: String(env.TELEGRAM_BOT_API_BASE || "https://api.telegram.org").replace(/\/$/, ""),
  };
}

export function telegramLaunchReply(update, config = getTelegramBotRuntimeConfig()) {
  const message = update?.message;
  if (!message || message.chat?.type !== "private" || !Number.isSafeInteger(message.chat.id)) return null;
  const text = typeof message.text === "string" ? message.text.trim() : "";
  const command = text.split(/\s+/, 1)[0].split("@", 1)[0].toLowerCase();
  if (!["/start", "/app"].includes(command)) return null;

  const firstName = typeof message.from?.first_name === "string" ? message.from.first_name.trim().slice(0, 64) : "";
  return {
    chat_id: message.chat.id,
    text: `${firstName ? `${firstName}, д` : "Д"}обро пожаловать в Rollapp. Собирайте желания, делитесь списками и открывайте их прямо в Telegram.`,
    reply_markup: {
      inline_keyboard: [[{
        text: "Открыть Rollapp",
        web_app: { url: config.webAppUrl },
      }]],
    },
  };
}

export async function callTelegramBotApi(method, payload, {
  token,
  apiBase = "https://api.telegram.org",
  fetchImpl = fetch,
  timeoutMs = 8_000,
} = {}) {
  if (!token) throw new Error("Telegram bot token is not configured");
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(method)) throw new Error("Invalid Telegram Bot API method");
  const response = await fetchImpl(`${String(apiBase).replace(/\/$/, "")}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    const description = typeof result?.description === "string" ? result.description : `HTTP ${response.status}`;
    throw new Error(`Telegram Bot API ${method} failed: ${description}`);
  }
  return result.result;
}

export const telegramWebhookSecretPattern = WEBHOOK_SECRET_PATTERN;
