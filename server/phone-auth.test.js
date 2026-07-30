import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createOtpCode,
  digestIp,
  digestOtp,
  digestPhone,
  getPhoneAuthPolicy,
  maskPhone,
  normalizeRussianPhone,
  requirePhoneAuthSecret,
  verifyOtpDigest,
} from "./phone-auth.js";

const secret = "0123456789abcdef0123456789abcdef";

test("Russian mobile numbers are normalized to E.164", () => {
  for (const input of [
    "+7 999 123-45-67",
    "8 (999) 123 45 67",
    "9991234567",
    "79991234567",
  ]) {
    assert.equal(normalizeRussianPhone(input), "+79991234567");
  }
  for (const input of ["", "+1 202 555 0100", "+7 495 123-45-67", "7999123456", null]) {
    assert.equal(normalizeRussianPhone(input), null);
  }
  assert.equal(maskPhone("4567"), "+7 ••• •••-45-67");
});

test("OTP codes are six decimal digits and HMAC digests are domain separated", () => {
  for (let index = 0; index < 100; index += 1) {
    assert.match(createOtpCode(), /^\d{6}$/);
  }
  const challengeId = "2f626f62-9ba6-4d63-86be-4896a4b79ce8";
  const codeHash = digestOtp(secret, challengeId, "012345");
  assert.equal(verifyOtpDigest(secret, challengeId, "012345", codeHash), true);
  assert.equal(verifyOtpDigest(secret, challengeId, "012346", codeHash), false);
  assert.notEqual(digestPhone(secret, "+79991234567"), digestIp(secret, "+79991234567"));
  assert.notEqual(digestPhone(secret, "+79991234567"), codeHash);
});

test("phone auth requires a strong secret and bounds policy values", () => {
  assert.throws(() => requirePhoneAuthSecret({ PHONE_AUTH_SECRET: "short" }), /at least 32 bytes/);
  assert.equal(requirePhoneAuthSecret({ PHONE_AUTH_SECRET: secret }), secret);
  assert.deepEqual(getPhoneAuthPolicy({
    PHONE_OTP_TTL_SECONDS: "1",
    PHONE_OTP_RESEND_SECONDS: "9999",
    PHONE_OTP_MAX_ATTEMPTS: "8",
    PHONE_OTP_PHONE_REQUEST_LIMIT: "0",
  }), {
    ttlSeconds: 120,
    resendSeconds: 300,
    maxAttempts: 8,
    rateWindowSeconds: 900,
    phoneRequestLimit: 1,
    ipRequestLimit: 10,
    globalDailyLimit: 100,
  });
});

