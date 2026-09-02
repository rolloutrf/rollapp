import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ENVELOPE_VERSION = "v1";
const IV_BYTES = 12;
const MIN_SECRET_LENGTH = 32;

export class UserCredentialsError extends Error {
  constructor(message, { code = "user_credentials_unavailable", cause } = {}) {
    super(message, { cause });
    this.name = "UserCredentialsError";
    this.code = code;
  }
}

function configuredSecret(env = process.env) {
  const secret = String(env.USER_CREDENTIALS_SECRET || "");
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new UserCredentialsError("Хранилище персональных ключей пока не настроено");
  }
  return secret;
}

function encryptionKey(env) {
  return createHash("sha256")
    .update("rollapp:user-credentials:v1\0", "utf8")
    .update(configuredSecret(env), "utf8")
    .digest();
}

function additionalData(userId, provider) {
  return Buffer.from(`rollapp:${ENVELOPE_VERSION}:${provider}:${userId}`, "utf8");
}

export function userCredentialsConfigured(env = process.env) {
  try {
    configuredSecret(env);
    return true;
  } catch {
    return false;
  }
}

export function encryptUserCredential(value, {
  userId,
  provider,
  env = process.env,
  randomBytesImpl = randomBytes,
} = {}) {
  if (!userId || !provider || !value) {
    throw new UserCredentialsError("Не удалось сохранить персональный ключ", {
      code: "user_credential_invalid",
    });
  }
  const iv = randomBytesImpl(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(env), iv);
  cipher.setAAD(additionalData(userId, provider));
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENVELOPE_VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptUserCredential(envelope, {
  userId,
  provider,
  env = process.env,
} = {}) {
  try {
    const [version, ivValue, tagValue, encryptedValue, ...extra] = String(envelope || "").split(".");
    if (version !== ENVELOPE_VERSION || !ivValue || !tagValue || !encryptedValue || extra.length) throw new Error("Invalid envelope");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(env), Buffer.from(ivValue, "base64url"));
    decipher.setAAD(additionalData(userId, provider));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (cause) {
    if (cause instanceof UserCredentialsError) throw cause;
    throw new UserCredentialsError("Не удалось прочитать персональный ключ", {
      code: "user_credential_decryption_failed",
      cause,
    });
  }
}

export function userCredentialHint(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  const prefix = normalized.startsWith("sk-or-v1-") ? "sk-or-v1-" : `${normalized.slice(0, 3)}…`;
  return `${prefix}••••${normalized.slice(-4)}`;
}
