import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

const port = 20_000 + (process.pid % 1_000);
const origin = `http://127.0.0.1:${port}`;
const baseUrl = `${origin}/api`;

async function waitForServer(child, targetBaseUrl = baseUrl) {
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Test server exited early:\n${output}`);
    try {
      const response = await fetch(`${targetBaseUrl}/healthz`);
      if (response.ok) return;
    } catch {
      // Database initialization is still in progress.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Test server did not become ready:\n${output}`);
}

async function post(path, body, cookie = "") {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function emailLogin(email = "demo@rollapp.test") {
  const response = await post("/auth/login", { email, password: "demo1234" });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";", 1)[0];
}

function differentCode(code) {
  return code === "000000" ? "000001" : "000000";
}

test("phone linking and OTP login preserve the existing account and session flow", async (t) => {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      DEMO_MODE: "true",
      DATABASE_URL: "",
      PGHOST: "",
      PORT: String(port),
      SMS_PROVIDER: "test",
      PHONE_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
      PHONE_OTP_MAX_ATTEMPTS: "3",
      PHONE_OTP_RESEND_SECONDS: "1",
      PHONE_OTP_PHONE_REQUEST_LIMIT: "8",
      PHONE_OTP_IP_REQUEST_LIMIT: "20",
      PHONE_OTP_GLOBAL_DAILY_LIMIT: "20",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  await waitForServer(child);

  const configResponse = await fetch(`${baseUrl}/auth/phone/config`);
  assert.equal(configResponse.status, 200);
  assert.deepEqual(await configResponse.json(), {
    enabled: true,
    testMode: true,
    country: "RU",
    codeLength: 6,
    expiresInSeconds: 300,
    resendAfterSeconds: 1,
  });

  for (const phone of ["+1 202 555 0100", "+7 (495) 123-45-67"]) {
    const invalidPhone = await post("/auth/phone/request", { phone });
    assert.equal(invalidPhone.status, 400);
    assert.deepEqual(await invalidPhone.json(), {
      error: "Введите российский мобильный номер",
    });
  }

  const ownerCookie = await emailLogin();
  const linkRequest = await post("/me/phone/request", { phone: "8 (999) 123-45-67" }, ownerCookie);
  assert.equal(linkRequest.status, 202);
  const linkChallenge = await linkRequest.json();
  assert.match(linkChallenge.challengeId, /^[0-9a-f-]{36}$/);
  assert.equal(linkChallenge.phoneMasked, "+7 ••• •••-45-67");
  assert.match(linkChallenge.testCode, /^\d{6}$/);

  const wrongLinkCode = await post("/me/phone/verify", {
    challengeId: linkChallenge.challengeId,
    code: differentCode(linkChallenge.testCode),
  }, ownerCookie);
  assert.equal(wrongLinkCode.status, 401);

  const linkVerify = await post("/me/phone/verify", {
    challengeId: linkChallenge.challengeId,
    code: linkChallenge.testCode,
  }, ownerCookie);
  assert.equal(linkVerify.status, 200);
  const linkedUser = (await linkVerify.json()).user;
  assert.equal(linkedUser.email, "demo@rollapp.test");
  assert.equal(linkedUser.hasPhone, true);
  assert.equal(linkedUser.phoneMasked, "+7 ••• •••-45-67");
  assert.equal("phoneHash" in linkedUser, false);

  const loginRequest = await post("/auth/phone/request", { phone: "+7 999 123 45 67" });
  assert.equal(loginRequest.status, 202);
  const loginChallenge = await loginRequest.json();
  assert.deepEqual(
    Object.keys(loginChallenge).sort(),
    ["challengeId", "expiresInSeconds", "phoneMasked", "resendAfterSeconds", "testCode"].sort(),
  );
  const loginVerify = await post("/auth/phone/verify", {
    challengeId: loginChallenge.challengeId,
    code: loginChallenge.testCode,
  });
  assert.equal(loginVerify.status, 200);
  const phoneCookie = loginVerify.headers.get("set-cookie").split(";", 1)[0];
  const meResponse = await fetch(`${baseUrl}/me`, { headers: { Cookie: phoneCookie } });
  assert.equal(meResponse.status, 200);
  assert.equal((await meResponse.json()).user.email, "demo@rollapp.test");

  const replay = await post("/auth/phone/verify", {
    challengeId: loginChallenge.challengeId,
    code: loginChallenge.testCode,
  });
  assert.equal(replay.status, 401);

  const unknownRequest = await post("/auth/phone/request", { phone: "+7 999 765-43-21" });
  assert.equal(unknownRequest.status, 202);
  const unknownChallenge = await unknownRequest.json();
  assert.deepEqual(Object.keys(unknownChallenge).sort(), Object.keys(loginChallenge).sort());
  const unknownVerify = await post("/auth/phone/verify", {
    challengeId: unknownChallenge.challengeId,
    code: unknownChallenge.testCode,
  });
  assert.equal(unknownVerify.status, 401);

  const resend = await post("/auth/phone/request", { phone: "+7 999 765-43-21" });
  assert.equal(resend.status, 429);
  assert.ok(Number((await resend.json()).retryAfterSeconds) > 0);

  const unauthenticatedLink = await post("/me/phone/request", { phone: "+7 999 111-22-33" });
  assert.equal(unauthenticatedLink.status, 401);

  const emailLoginStillWorks = await emailLogin();
  assert.match(emailLoginStillWorks, /^rw_session=/);

  const secondOwnerCookie = await emailLogin("max@rollapp.test");
  const secondPhone = "+7 999 222-33-44";
  const secondLinkRequest = await post("/me/phone/request", { phone: secondPhone }, secondOwnerCookie);
  assert.equal(secondLinkRequest.status, 202);
  const secondLinkChallenge = await secondLinkRequest.json();
  const secondLinkVerify = await post("/me/phone/verify", {
    challengeId: secondLinkChallenge.challengeId,
    code: secondLinkChallenge.testCode,
  }, secondOwnerCookie);
  assert.equal(secondLinkVerify.status, 200);
  assert.equal((await secondLinkVerify.json()).user.phoneMasked, "+7 ••• •••-33-44");

  const exhaustedRequest = await post("/auth/phone/request", { phone: secondPhone });
  assert.equal(exhaustedRequest.status, 202);
  const exhaustedChallenge = await exhaustedRequest.json();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const wrongAttempt = await post("/auth/phone/verify", {
      challengeId: exhaustedChallenge.challengeId,
      code: differentCode(exhaustedChallenge.testCode),
    });
    assert.equal(wrongAttempt.status, 401);
  }
  const correctAfterExhaustion = await post("/auth/phone/verify", {
    challengeId: exhaustedChallenge.challengeId,
    code: exhaustedChallenge.testCode,
  });
  assert.equal(correctAfterExhaustion.status, 401);
  assert.equal(correctAfterExhaustion.headers.get("set-cookie"), null);

  const earlyConflictRequest = await post("/me/phone/request", { phone: secondPhone }, ownerCookie);
  assert.equal(earlyConflictRequest.status, 429);
  const retryAfterSeconds = Number((await earlyConflictRequest.json()).retryAfterSeconds);
  assert.ok(retryAfterSeconds > 0 && retryAfterSeconds <= 1);
  await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1_000 + 100));

  const conflictRequest = await post("/me/phone/request", { phone: secondPhone }, ownerCookie);
  assert.equal(conflictRequest.status, 202);
  const conflictChallenge = await conflictRequest.json();
  const conflictVerify = await post("/me/phone/verify", {
    challengeId: conflictChallenge.challengeId,
    code: conflictChallenge.testCode,
  }, ownerCookie);
  assert.equal(conflictVerify.status, 409);
  assert.deepEqual(await conflictVerify.json(), {
    error: "Этот номер уже привязан к другому аккаунту",
  });

  const [ownerMeResponse, secondOwnerMeResponse] = await Promise.all([
    fetch(`${baseUrl}/me`, { headers: { Cookie: ownerCookie } }),
    fetch(`${baseUrl}/me`, { headers: { Cookie: secondOwnerCookie } }),
  ]);
  assert.equal(ownerMeResponse.status, 200);
  assert.equal(secondOwnerMeResponse.status, 200);
  const ownerAfterConflict = (await ownerMeResponse.json()).user;
  const secondOwnerAfterConflict = (await secondOwnerMeResponse.json()).user;
  assert.equal(ownerAfterConflict.email, "demo@rollapp.test");
  assert.equal(ownerAfterConflict.phoneMasked, "+7 ••• •••-45-67");
  assert.equal(secondOwnerAfterConflict.email, "max@rollapp.test");
  assert.equal(secondOwnerAfterConflict.phoneMasked, "+7 ••• •••-33-44");

  const secondOwnerLoginRequest = await post("/auth/phone/request", { phone: secondPhone });
  assert.equal(secondOwnerLoginRequest.status, 202);
  const secondOwnerLoginChallenge = await secondOwnerLoginRequest.json();
  const secondOwnerLoginVerify = await post("/auth/phone/verify", {
    challengeId: secondOwnerLoginChallenge.challengeId,
    code: secondOwnerLoginChallenge.testCode,
  });
  assert.equal(secondOwnerLoginVerify.status, 200);
  const secondOwnerPhoneCookie = secondOwnerLoginVerify.headers.get("set-cookie").split(";", 1)[0];
  const secondOwnerPhoneMe = await fetch(`${baseUrl}/me`, {
    headers: { Cookie: secondOwnerPhoneCookie },
  });
  assert.equal(secondOwnerPhoneMe.status, 200);
  assert.equal((await secondOwnerPhoneMe.json()).user.email, "max@rollapp.test");
});

test("disabled phone auth is reported consistently and rejects OTP requests", async (t) => {
  const disabledPort = port + 1_001;
  const disabledBaseUrl = `http://127.0.0.1:${disabledPort}/api`;
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      DEMO_MODE: "true",
      DATABASE_URL: "",
      PGHOST: "",
      PORT: String(disabledPort),
      SMS_PROVIDER: "disabled",
      PHONE_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  await waitForServer(child, disabledBaseUrl);

  const configResponse = await fetch(`${disabledBaseUrl}/auth/phone/config`);
  assert.equal(configResponse.status, 200);
  assert.deepEqual(await configResponse.json(), {
    enabled: false,
    testMode: false,
    country: "RU",
    codeLength: 6,
    expiresInSeconds: 300,
    resendAfterSeconds: 60,
  });

  const requestResponse = await fetch(`${disabledBaseUrl}/auth/phone/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "+7 999 123-45-67" }),
  });
  assert.equal(requestResponse.status, 503);
  assert.deepEqual(await requestResponse.json(), {
    error: "Вход по телефону временно недоступен",
  });
});
