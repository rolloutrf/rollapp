import { decryptUserCredential, UserCredentialsError } from "./user-credentials.js";

function serverCredential(apiKey) {
  const normalized = String(apiKey || "").trim();
  return {
    apiKey: normalized,
    source: normalized ? "server" : "none",
  };
}

export function resolveOpenRouterCredential(credential, {
  userId,
  serverApiKey = process.env.OPENROUTER_API_KEY,
  env = process.env,
} = {}) {
  const fallback = serverCredential(serverApiKey);
  if (!credential) return { ...fallback, warning: null };

  try {
    return {
      apiKey: decryptUserCredential(credential.encrypted_secret ?? credential.encryptedSecret, {
        userId,
        provider: "openrouter",
        env,
      }),
      source: "user",
      warning: null,
    };
  } catch (error) {
    if (!(error instanceof UserCredentialsError)) throw error;
    return {
      ...fallback,
      warning: {
        code: error.code,
        message: error.message,
      },
    };
  }
}
