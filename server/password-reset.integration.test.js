import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const basePort = 23_000 + (process.pid % 1_000);

async function waitForServer(child, baseUrl) {
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Test server exited early:\n${output}`);
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {
      // The isolated in-memory database is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Test server did not become ready:\n${output}`);
}

function startServer(port, env = {}) {
  return spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      DEMO_MODE: "true",
      DATABASE_URL: "",
      PGHOST: "",
      PORT: String(port),
      PUBLIC_APP_URL: `http://127.0.0.1:${port}`,
      PASSWORD_RESET_IP_REQUEST_LIMIT: "100",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function post(baseUrl, route, body, cookie = "") {
  return fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function readOutbox(outboxPath) {
  try {
    const content = await readFile(outboxPath, "utf8");
    return content.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function waitForOutbox(outboxPath, expectedCount) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const messages = await readOutbox(outboxPath);
    if (messages.length >= expectedCount) {
      // The test provider writes before the route records the successful delivery.
      await new Promise((resolve) => setTimeout(resolve, 50));
      return messages;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Expected ${expectedCount} password reset email(s)`);
}

function tokenFromMessage(message) {
  const resetUrl = new URL(message.resetUrl);
  return {
    origin: resetUrl.origin,
    pathname: resetUrl.pathname,
    token: new URLSearchParams(resetUrl.hash.slice(1)).get("token"),
  };
}

test("password reset is private, single-use, invalidates older links and revokes sessions", async (t) => {
  const port = basePort;
  const baseUrl = `http://127.0.0.1:${port}/api`;
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "rollapp-password-reset-"));
  const outboxPath = path.join(tempDirectory, "outbox.jsonl");
  const child = startServer(port, {
    EMAIL_PROVIDER: "test",
    EMAIL_TEST_OUTBOX_PATH: outboxPath,
    PASSWORD_RESET_TTL_SECONDS: "60",
    PASSWORD_RESET_COOLDOWN_SECONDS: "0",
    PASSWORD_RESET_DAILY_LIMIT: "2",
  });
  t.after(async () => {
    child.kill("SIGTERM");
    await rm(tempDirectory, { recursive: true, force: true });
  });
  await waitForServer(child, baseUrl);

  const loggedIn = await post(baseUrl, "/auth/login", {
    email: "demo@rollapp.test",
    password: "demo1234",
  });
  assert.equal(loggedIn.status, 200);
  const oldSessionCookie = loggedIn.headers.get("set-cookie").split(";", 1)[0];
  const unrelatedLogin = await post(baseUrl, "/auth/login", {
    email: "max@rollapp.test",
    password: "demo1234",
  });
  assert.equal(unrelatedLogin.status, 200);
  const unrelatedSessionCookie = unrelatedLogin.headers.get("set-cookie").split(";", 1)[0];

  const unknown = await post(baseUrl, "/auth/password-reset/request", {
    email: "nobody@rollapp.test",
  });
  assert.equal(unknown.status, 202);
  const unknownPayload = await unknown.json();
  assert.deepEqual(await readOutbox(outboxPath), []);

  const firstRequest = await post(baseUrl, "/auth/password-reset/request", {
    email: "  DEMO@ROLLAPP.TEST ",
  });
  assert.equal(firstRequest.status, 202);
  assert.deepEqual(await firstRequest.json(), unknownPayload);
  const firstMessages = await waitForOutbox(outboxPath, 1);
  assert.equal(firstMessages[0].type, "password-reset");
  assert.equal(firstMessages[0].to, "demo@rollapp.test");
  const firstLink = tokenFromMessage(firstMessages[0]);
  assert.deepEqual(
    { origin: firstLink.origin, pathname: firstLink.pathname },
    { origin: `http://127.0.0.1:${port}`, pathname: "/reset-password" },
  );
  assert.match(firstLink.token, /^[A-Za-z0-9_-]{43}$/);

  const secondRequest = await post(baseUrl, "/auth/password-reset/request", {
    email: "demo@rollapp.test",
  });
  assert.equal(secondRequest.status, 202);
  assert.deepEqual(await secondRequest.json(), unknownPayload);
  const messages = await waitForOutbox(outboxPath, 2);
  const secondLink = tokenFromMessage(messages[1]);
  assert.notEqual(secondLink.token, firstLink.token);

  const oldLink = await post(baseUrl, "/auth/password-reset/confirm", {
    token: firstLink.token,
    password: "new-password-123",
  });
  assert.equal(oldLink.status, 400);
  assert.equal((await oldLink.json()).code, "PASSWORD_RESET_INVALID");

  const weakPassword = await post(baseUrl, "/auth/password-reset/confirm", {
    token: secondLink.token,
    password: "short",
  });
  assert.equal(weakPassword.status, 400);
  assert.equal((await weakPassword.json()).code, "PASSWORD_RESET_PASSWORD_INVALID");

  const [racingOldPasswordLogin, confirmed] = await Promise.all([
    post(baseUrl, "/auth/login", {
      email: "demo@rollapp.test",
      password: "demo1234",
    }),
    post(baseUrl, "/auth/password-reset/confirm", {
      token: secondLink.token,
      password: "new-password-123",
    }, unrelatedSessionCookie),
  ]);
  assert.equal(confirmed.status, 200);
  assert.deepEqual(await confirmed.json(), { ok: true });
  assert.equal(confirmed.headers.get("set-cookie"), null);
  const unrelatedSession = await fetch(`${baseUrl}/me`, { headers: { Cookie: unrelatedSessionCookie } });
  assert.equal((await unrelatedSession.json()).user.email, "max@rollapp.test");
  assert([200, 401].includes(racingOldPasswordLogin.status));
  if (racingOldPasswordLogin.status === 200) {
    const racingCookie = racingOldPasswordLogin.headers.get("set-cookie").split(";", 1)[0];
    const racingSession = await fetch(`${baseUrl}/me`, { headers: { Cookie: racingCookie } });
    assert.deepEqual(await racingSession.json(), { user: null });
  }

  const replay = await post(baseUrl, "/auth/password-reset/confirm", {
    token: secondLink.token,
    password: "another-password-123",
  });
  assert.equal(replay.status, 400);
  assert.equal((await replay.json()).code, "PASSWORD_RESET_INVALID");

  const oldSession = await fetch(`${baseUrl}/me`, { headers: { Cookie: oldSessionCookie } });
  assert.equal(oldSession.status, 200);
  assert.deepEqual(await oldSession.json(), { user: null });

  const oldPassword = await post(baseUrl, "/auth/login", {
    email: "demo@rollapp.test",
    password: "demo1234",
  });
  assert.equal(oldPassword.status, 401);
  const newPassword = await post(baseUrl, "/auth/login", {
    email: "demo@rollapp.test",
    password: "new-password-123",
  });
  assert.equal(newPassword.status, 200);

  const accountLimited = await post(baseUrl, "/auth/password-reset/request", {
    email: "demo@rollapp.test",
  });
  assert.equal(accountLimited.status, 202);
  assert.deepEqual(await accountLimited.json(), unknownPayload);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal((await readOutbox(outboxPath)).length, 2);
});

test("expired reset links fail and unavailable delivery is reported uniformly", async (t) => {
  const expiringPort = basePort + 1;
  const expiringBaseUrl = `http://127.0.0.1:${expiringPort}/api`;
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "rollapp-password-expiry-"));
  const outboxPath = path.join(tempDirectory, "outbox.jsonl");
  const expiringServer = startServer(expiringPort, {
    EMAIL_PROVIDER: "test",
    EMAIL_TEST_OUTBOX_PATH: outboxPath,
    PASSWORD_RESET_TTL_SECONDS: "1",
    PASSWORD_RESET_COOLDOWN_SECONDS: "0",
  });
  t.after(async () => {
    expiringServer.kill("SIGTERM");
    await rm(tempDirectory, { recursive: true, force: true });
  });
  await waitForServer(expiringServer, expiringBaseUrl);

  const requested = await post(expiringBaseUrl, "/auth/password-reset/request", {
    email: "max@rollapp.test",
  });
  assert.equal(requested.status, 202);
  const messages = await waitForOutbox(outboxPath, 1);
  const { token } = tokenFromMessage(messages[0]);
  await new Promise((resolve) => setTimeout(resolve, 1_100));

  const expired = await post(expiringBaseUrl, "/auth/password-reset/confirm", {
    token,
    password: "expired-password-123",
  });
  assert.equal(expired.status, 400);
  assert.equal((await expired.json()).code, "PASSWORD_RESET_INVALID");

  const unavailablePort = basePort + 2;
  const unavailableBaseUrl = `http://127.0.0.1:${unavailablePort}/api`;
  const unavailableServer = startServer(unavailablePort, { EMAIL_PROVIDER: "disabled" });
  t.after(() => unavailableServer.kill("SIGTERM"));
  await waitForServer(unavailableServer, unavailableBaseUrl);

  for (const email of ["demo@rollapp.test", "nobody@rollapp.test"]) {
    const response = await post(unavailableBaseUrl, "/auth/password-reset/request", { email });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "PASSWORD_RESET_UNAVAILABLE");
  }
});
