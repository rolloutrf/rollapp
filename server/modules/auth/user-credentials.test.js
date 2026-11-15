import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decryptUserCredential,
  encryptUserCredential,
  userCredentialHint,
  userCredentialsConfigured,
  UserCredentialsError,
} from "./user-credentials.js";

const env = { USER_CREDENTIALS_SECRET: "a-stable-secret-that-is-longer-than-thirty-two-bytes" };

test("encrypts a personal key and binds it to the user and provider", () => {
  const apiKey = "sk-or-v1-a-private-openrouter-key";
  const encrypted = encryptUserCredential(apiKey, {
    userId: "user-1",
    provider: "openrouter",
    env,
    randomBytesImpl: () => Buffer.alloc(12, 7),
  });

  assert.equal(encrypted.includes(apiKey), false);
  assert.equal(decryptUserCredential(encrypted, { userId: "user-1", provider: "openrouter", env }), apiKey);
  assert.throws(
    () => decryptUserCredential(encrypted, { userId: "user-2", provider: "openrouter", env }),
    (error) => error instanceof UserCredentialsError && error.code === "user_credential_decryption_failed",
  );
});

test("rejects tampered credential envelopes", () => {
  const encrypted = encryptUserCredential("sk-or-v1-private-key", {
    userId: "user-1",
    provider: "openrouter",
    env,
  });
  const [version, iv, tag, encryptedValue] = encrypted.split(".");
  const tamperedValue = Buffer.from(encryptedValue, "base64url");
  tamperedValue[0] ^= 1;
  const tamperedEnvelope = [version, iv, tag, tamperedValue.toString("base64url")].join(".");
  assert.throws(
    () => decryptUserCredential(tamperedEnvelope, { userId: "user-1", provider: "openrouter", env }),
    (error) => error instanceof UserCredentialsError && error.code === "user_credential_decryption_failed",
  );
});

test("requires a dedicated stable encryption secret", () => {
  assert.equal(userCredentialsConfigured({}), false);
  assert.equal(userCredentialsConfigured({ USER_CREDENTIALS_SECRET: "short" }), false);
  assert.equal(userCredentialsConfigured(env), true);
  assert.throws(
    () => encryptUserCredential("sk-or-v1-private-key", { userId: "user-1", provider: "openrouter", env: {} }),
    UserCredentialsError,
  );
});

test("returns only a masked credential hint", () => {
  const apiKey = "sk-or-v1-super-secret-1234";
  const hint = userCredentialHint(apiKey);
  assert.equal(hint, "sk-or-v1-••••1234");
  assert.equal(hint.includes("super-secret"), false);
});
