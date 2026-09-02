import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

const port = 31_000 + (process.pid % 1_000);
const baseUrl = `http://127.0.0.1:${port}/api`;

async function waitForServer(child) {
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

async function request(route, { method = "GET", body, cookie = "" } = {}) {
  return fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test("stores a user's OpenRouter key without returning the secret", async (t) => {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      DEMO_MODE: "true",
      DATABASE_URL: "",
      PGHOST: "",
      PORT: String(port),
      USER_CREDENTIALS_SECRET: "integration-secret-that-is-longer-than-thirty-two-bytes",
      OPENROUTER_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  await waitForServer(child);

  const login = await request("/auth/login", {
    method: "POST",
    body: { email: "demo@rollapp.test", password: "demo1234" },
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";", 1)[0];

  const initial = await request("/me/openrouter", { cookie });
  assert.equal(initial.status, 200);
  assert.deepEqual(await initial.json(), {
    available: true,
    configured: false,
    keyHint: "",
    serverFallbackConfigured: false,
  });

  const apiKey = "sk-or-v1-integration-private-key-1234";
  const saved = await request("/me/openrouter", { method: "POST", body: { apiKey }, cookie });
  assert.equal(saved.status, 200);
  const savedText = await saved.text();
  assert.equal(savedText.includes(apiKey), false);
  assert.deepEqual(JSON.parse(savedText), {
    available: true,
    configured: true,
    keyHint: "sk-or-v1-••••1234",
    serverFallbackConfigured: false,
  });

  const reloaded = await request("/me/openrouter", { cookie });
  const reloadedText = await reloaded.text();
  assert.equal(reloadedText.includes(apiKey), false);
  assert.equal(JSON.parse(reloadedText).configured, true);

  const removed = await request("/me/openrouter", { method: "DELETE", cookie });
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).configured, false);
});
