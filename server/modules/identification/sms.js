import { randomUUID } from "node:crypto";

const METADATA_TOKEN_URL = "http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token";
const YANDEX_CNS_URL = "https://notifications.yandexcloud.net/";
let cachedIamToken = "";
let cachedIamTokenExpiresAt = 0;

export class SmsDeliveryError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "SmsDeliveryError";
  }
}

export function getSmsConfig(env = process.env) {
  const requestedProvider = String(env.SMS_PROVIDER || "disabled").trim().toLowerCase();
  if (requestedProvider === "test") {
    const allowed = env.NODE_ENV === "test";
    return { provider: allowed ? "test" : "disabled", enabled: allowed, testMode: allowed };
  }
  if (requestedProvider === "yandex") {
    return { provider: "yandex", enabled: true, testMode: false };
  }
  return { provider: "disabled", enabled: false, testMode: false };
}

async function loadVmIamToken(fetchImpl, env) {
  const now = Date.now();
  if (cachedIamToken && cachedIamTokenExpiresAt - 60_000 > now) return cachedIamToken;
  const response = await fetchImpl(env.YC_METADATA_TOKEN_URL || METADATA_TOKEN_URL, {
    headers: { "Metadata-Flavor": "Google" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new SmsDeliveryError(`Metadata IAM token request failed with status ${response.status}`);
  const payload = await response.json();
  if (!payload?.access_token) throw new SmsDeliveryError("Metadata IAM token response did not contain an access token");
  const lifetimeSeconds = Number(payload.expires_in || 3_600);
  cachedIamToken = payload.access_token;
  cachedIamTokenExpiresAt = now + Math.max(120, lifetimeSeconds) * 1_000;
  return cachedIamToken;
}

function messageIdFromPayload(payload) {
  return payload?.PublishResponse?.PublishResult?.MessageId
    || payload?.PublishResponse?.MessageId
    || payload?.MessageId
    || payload?.ResponseMetadata?.RequestId
    || "";
}

async function sendViaYandex({ phone, code }, { env, fetchImpl }) {
  const iamToken = await loadVmIamToken(fetchImpl, env);
  const params = new URLSearchParams({
    Action: "Publish",
    PhoneNumber: phone,
    Message: `Код для входа в Rollapp: ${code}. Никому его не сообщайте.`,
    ResponseFormat: "JSON",
    "MessageAttributes.entry.1.key": "AWS.SNS.SMS.SMSType",
    "MessageAttributes.entry.1.value": JSON.stringify({
      DataType: "String",
      StringValue: "Transactional",
    }),
  });
  const senderId = String(env.YC_CNS_SENDER_ID || "").trim();
  if (senderId) {
    params.set("MessageAttributes.entry.2.key", "AWS.SNS.SMS.SenderID");
    params.set("MessageAttributes.entry.2.value", JSON.stringify({
      DataType: "String",
      StringValue: senderId,
    }));
  }
  const response = await fetchImpl(env.YC_CNS_ENDPOINT || YANDEX_CNS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${iamToken}`,
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    },
    body: params,
    signal: AbortSignal.timeout(8_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerCode = payload?.ErrorResponse?.Error?.SubCode || payload?.ErrorResponse?.Error?.Code || "unknown";
    throw new SmsDeliveryError(`Yandex CNS rejected SMS delivery (${response.status}, ${providerCode})`);
  }
  return { providerMessageId: messageIdFromPayload(payload) || randomUUID() };
}

export async function sendSms(payload, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const config = getSmsConfig(env);
  if (config.provider === "test") {
    return { providerMessageId: `test-${randomUUID()}` };
  }
  if (config.provider === "yandex") {
    try {
      return await sendViaYandex(payload, { env, fetchImpl });
    } catch (error) {
      if (error instanceof SmsDeliveryError) throw error;
      throw new SmsDeliveryError("Yandex CNS delivery failed", { cause: error });
    }
  }
  throw new SmsDeliveryError("SMS delivery is disabled");
}

export function resetSmsTokenCacheForTests() {
  cachedIamToken = "";
  cachedIamTokenExpiresAt = 0;
}
