import { appendFile } from "node:fs/promises";

const METADATA_TOKEN_URL = "http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token";
const YANDEX_POSTBOX_URL = "https://postbox.cloud.yandex.net/v2/email/outbound-emails";

let cachedIamToken = "";
let cachedIamTokenExpiresAt = 0;

export class EmailDeliveryError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "EmailDeliveryError";
  }
}

export function getEmailConfig(env = process.env) {
  const requestedProvider = String(env.EMAIL_PROVIDER || "disabled").trim().toLowerCase();
  const hasPersistentDatabase = Boolean(String(env.DATABASE_URL || "").trim() || String(env.PGHOST || "").trim());
  if (requestedProvider === "console") {
    const allowed = env.NODE_ENV !== "production" && !hasPersistentDatabase;
    return { provider: allowed ? "console" : "disabled", enabled: allowed, testMode: false };
  }
  if (requestedProvider === "test") {
    const allowed = env.NODE_ENV === "test" && !hasPersistentDatabase;
    return { provider: allowed ? "test" : "disabled", enabled: allowed, testMode: allowed };
  }
  if (requestedProvider === "yandex") {
    const from = String(env.EMAIL_FROM || "").trim();
    const enabled = Boolean(from) && !/[\r\n]/.test(from);
    return { provider: "yandex", enabled, testMode: false };
  }
  return { provider: "disabled", enabled: false, testMode: false };
}

async function loadVmIamToken(fetchImpl, env) {
  const now = Date.now();
  if (cachedIamToken && cachedIamTokenExpiresAt - 60_000 > now) return cachedIamToken;

  let response;
  try {
    response = await fetchImpl(env.YC_METADATA_TOKEN_URL || METADATA_TOKEN_URL, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(5_000),
    });
  } catch (cause) {
    throw new EmailDeliveryError("Metadata IAM token request failed", { cause });
  }
  if (!response.ok) {
    throw new EmailDeliveryError(`Metadata IAM token request failed with status ${response.status}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new EmailDeliveryError("Metadata IAM token response was not valid JSON", { cause });
  }
  if (!payload?.access_token) {
    throw new EmailDeliveryError("Metadata IAM token response did not contain an access token");
  }

  const lifetimeSeconds = Number(payload.expires_in || 3_600);
  cachedIamToken = payload.access_token;
  cachedIamTokenExpiresAt = now + Math.max(120, Number.isFinite(lifetimeSeconds) ? lifetimeSeconds : 3_600) * 1_000;
  return cachedIamToken;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizePayload({ to, resetUrl, requestId }) {
  const recipient = String(to || "").trim();
  const deliveryRequestId = String(requestId || "").trim();
  let parsedResetUrl;
  try {
    parsedResetUrl = new URL(String(resetUrl || ""));
  } catch {
    throw new EmailDeliveryError("Password reset URL is invalid");
  }
  if (!recipient || /[\r\n]/.test(recipient)) {
    throw new EmailDeliveryError("Password reset recipient is invalid");
  }
  if (!deliveryRequestId || /[\r\n]/.test(deliveryRequestId)) {
    throw new EmailDeliveryError("Password reset request ID is invalid");
  }
  if (!new Set(["http:", "https:"]).has(parsedResetUrl.protocol)) {
    throw new EmailDeliveryError("Password reset URL must use HTTP or HTTPS");
  }
  return { to: recipient, resetUrl: parsedResetUrl.toString(), requestId: deliveryRequestId };
}

function passwordResetMessage(resetUrl) {
  const safeUrl = escapeHtml(resetUrl);
  return {
    subject: "Восстановление пароля Rollapp",
    text: [
      "Здравствуйте!",
      "",
      "Мы получили запрос на восстановление пароля в Rollapp.",
      `Чтобы задать новый пароль, откройте ссылку: ${resetUrl}`,
      "",
      "Срок действия ссылки ограничен. Если вы не запрашивали восстановление, просто проигнорируйте это письмо.",
    ].join("\n"),
    html: [
      "<!doctype html>",
      '<html lang="ru"><body>',
      "<p>Здравствуйте!</p>",
      "<p>Мы получили запрос на восстановление пароля в Rollapp.</p>",
      `<p><a href="${safeUrl}">Задать новый пароль</a></p>`,
      "<p>Срок действия ссылки ограничен. Если вы не запрашивали восстановление, просто проигнорируйте это письмо.</p>",
      "</body></html>",
    ].join(""),
  };
}

function providerMessageId(payload, fallback) {
  return payload?.MessageId
    || payload?.messageId
    || payload?.SendEmailResponse?.MessageId
    || fallback;
}

async function sendViaYandex(payload, { env, fetchImpl }) {
  const from = String(env.EMAIL_FROM || "").trim();
  if (!from || /[\r\n]/.test(from)) {
    throw new EmailDeliveryError("EMAIL_FROM must contain a valid sender address");
  }

  const iamToken = await loadVmIamToken(fetchImpl, env);
  const message = passwordResetMessage(payload.resetUrl);
  let response;
  try {
    response = await fetchImpl(env.YC_POSTBOX_ENDPOINT || YANDEX_POSTBOX_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-YaCloud-SubjectToken": iamToken,
      },
      body: JSON.stringify({
        FromEmailAddress: from,
        Destination: { ToAddresses: [payload.to] },
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: "UTF-8" },
            Body: {
              Text: { Data: message.text, Charset: "UTF-8" },
              Html: { Data: message.html, Charset: "UTF-8" },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (cause) {
    throw new EmailDeliveryError("Yandex Postbox delivery failed", { cause });
  }

  const responsePayload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerCode = responsePayload?.Code || responsePayload?.code || responsePayload?.Type || "unknown";
    throw new EmailDeliveryError(`Yandex Postbox rejected email delivery (${response.status}, ${providerCode})`);
  }
  return { providerMessageId: providerMessageId(responsePayload, payload.requestId) };
}

export async function sendPasswordResetEmail(input, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const config = getEmailConfig(env);
  const payload = normalizePayload(input);

  if (config.provider === "console") {
    console.info(`[email:console] Password reset for ${payload.to}: ${payload.resetUrl} (request ${payload.requestId})`);
    return { providerMessageId: `console-${payload.requestId}` };
  }
  if (config.provider === "test") {
    const outboxPath = String(env.EMAIL_TEST_OUTBOX_PATH || "").trim();
    if (outboxPath) {
      try {
        await appendFile(outboxPath, `${JSON.stringify({ type: "password-reset", ...payload })}\n`, "utf8");
      } catch (cause) {
        throw new EmailDeliveryError("Test email outbox could not be written", { cause });
      }
    }
    return { providerMessageId: `test-${payload.requestId}` };
  }
  if (config.provider === "yandex") {
    return sendViaYandex(payload, { env, fetchImpl });
  }
  throw new EmailDeliveryError("Email delivery is disabled");
}

export function resetEmailTokenCacheForTests() {
  cachedIamToken = "";
  cachedIamTokenExpiresAt = 0;
}
