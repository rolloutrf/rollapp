import assert from "node:assert/strict";
import { test } from "node:test";
import { encryptUserCredential } from "./user-credentials.js";
import { resolveOpenRouterCredential } from "./openrouter-credential.js";

const userId = "marketplace-user";
const workingEnv = { USER_CREDENTIALS_SECRET: "stable-test-secret-with-at-least-32-characters" };

test("uses a stored OpenRouter credential when it can be decrypted", () => {
  const apiKey = "sk-or-v1-personal-test-key";
  const credential = {
    encrypted_secret: encryptUserCredential(apiKey, { userId, provider: "openrouter", env: workingEnv }),
  };

  assert.deepEqual(resolveOpenRouterCredential(credential, {
    userId,
    serverApiKey: "sk-or-v1-server-key",
    env: workingEnv,
  }), {
    apiKey,
    source: "user",
    warning: null,
  });
});

test("falls back to the server credential when a stored credential cannot be decrypted", () => {
  const result = resolveOpenRouterCredential({ encrypted_secret: "invalid-envelope" }, {
    userId,
    serverApiKey: "sk-or-v1-server-key",
    env: workingEnv,
  });

  assert.equal(result.apiKey, "sk-or-v1-server-key");
  assert.equal(result.source, "server");
  assert.equal(result.warning.code, "user_credential_decryption_failed");
});

test("keeps direct marketplace search available when credential storage is not configured", () => {
  const result = resolveOpenRouterCredential({ encrypted_secret: "v1.any.value.envelope" }, {
    userId,
    serverApiKey: "",
    env: {},
  });

  assert.equal(result.apiKey, "");
  assert.equal(result.source, "none");
  assert.equal(result.warning.code, "user_credentials_unavailable");
  assert.equal(JSON.stringify(result).includes("v1.any.value.envelope"), false);
});
