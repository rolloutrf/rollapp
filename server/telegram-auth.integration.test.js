import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import http from "node:http";
import { test } from "node:test";

const port = 22_000 + (process.pid % 700);
const telegramApiPort = port + 701;
const baseUrl = `http://127.0.0.1:${port}/api`;
const botToken = "123456789:AAIntegrationTokenForRollappTests";
const webhookSecret = "integration_webhook_secret-123";

function signedInitData(user, authDate = Math.floor(Date.now() / 1_000)) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "AAIntegrationQuery",
    user: JSON.stringify(user),
  });
  const check = [...params.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const key = createHmac("sha256", "WebAppData").update(botToken).digest();
  params.set("hash", createHmac("sha256", key).update(check).digest("hex"));
  return params.toString();
}

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
      // Database initialization is still running.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Test server did not become ready:\n${output}`);
}

async function post(path, body, cookie = "", headers = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function login(email) {
  const response = await post("/auth/login", { email, password: "demo1234" });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";", 1)[0];
}

test("Telegram Mini App login links an existing account and protects the webhook", async (t) => {
  const botRequests = [];
  const fakeTelegram = http.createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      botRequests.push({ url: req.url, body: JSON.parse(body) });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, result: { message_id: 1 } }));
    });
  });
  await new Promise((resolve) => fakeTelegram.listen(telegramApiPort, "127.0.0.1", resolve));
  t.after(() => fakeTelegram.close());

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      DEMO_MODE: "true",
      DATABASE_URL: "",
      PGHOST: "",
      PORT: String(port),
      TELEGRAM_BOT_TOKEN: botToken,
      TELEGRAM_BOT_USERNAME: "rollappRFbot",
      TELEGRAM_WEBHOOK_SECRET: webhookSecret,
      TELEGRAM_WEB_APP_URL: "https://xn--80avakiab.xn--p1ai/",
      TELEGRAM_BOT_API_BASE: `http://127.0.0.1:${telegramApiPort}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  await waitForServer(child);

  const configResponse = await fetch(`${baseUrl}/auth/telegram/config`);
  assert.equal(configResponse.status, 200);
  assert.deepEqual(await configResponse.json(), {
    enabled: true,
    botUsername: "rollappRFbot",
    botUrl: "https://t.me/rollappRFbot",
  });

  const telegramUser = { id: 9_876_543_210, first_name: "Михаил", last_name: "Колосков", username: "koloskof" };
  const initData = signedInitData(telegramUser);
  const unlinked = await post("/auth/telegram", { initData });
  assert.equal(unlinked.status, 409);
  assert.deepEqual(await unlinked.json(), {
    error: "Привяжите Telegram к существующему аккаунту или создайте новый",
    code: "TELEGRAM_LINK_REQUIRED",
    telegram: { name: "Михаил Колосков", username: "koloskof", photoUrl: "" },
  });

  const ownerCookie = await login("demo@rollapp.test");
  const linked = await post("/me/telegram/link", { initData }, ownerCookie);
  assert.equal(linked.status, 200);
  assert.equal((await linked.json()).user.email, "demo@rollapp.test");

  const telegramLogin = await post("/auth/telegram", { initData });
  assert.equal(telegramLogin.status, 200);
  assert.equal((await telegramLogin.json()).user.email, "demo@rollapp.test");
  const telegramCookie = telegramLogin.headers.get("set-cookie").split(";", 1)[0];
  const me = await fetch(`${baseUrl}/me`, { headers: { Cookie: telegramCookie } });
  assert.equal((await me.json()).user.email, "demo@rollapp.test");

  const csrfBlocked = await post("/auth/logout", {}, telegramCookie, {
    Origin: "https://attacker.example",
    "Sec-Fetch-Site": "cross-site",
  });
  assert.equal(csrfBlocked.status, 403);
  assert.equal((await csrfBlocked.json()).code, "CSRF_ORIGIN_MISMATCH");
  const sessionStillActive = await fetch(`${baseUrl}/me`, { headers: { Cookie: telegramCookie } });
  assert.equal((await sessionStillActive.json()).user.email, "demo@rollapp.test");

  const secondCookie = await login("max@rollapp.test");
  const conflict = await post("/me/telegram/link", { initData }, secondCookie);
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).code, "TELEGRAM_IDENTITY_CONFLICT");

  const tampered = await post("/auth/telegram", { initData: initData.replace("koloskof", "attacker") });
  assert.equal(tampered.status, 401);
  assert.equal((await tampered.json()).code, "TELEGRAM_INIT_DATA_INVALID");

  const rejectedWebhook = await post("/telegram/webhook", { update_id: 1 }, "", {
    "X-Telegram-Bot-Api-Secret-Token": "wrong",
  });
  assert.equal(rejectedWebhook.status, 401);
  assert.equal(botRequests.length, 0);

  const acceptedWebhook = await post("/telegram/webhook", {
    update_id: 2,
    message: {
      text: "/start",
      chat: { id: 987654321, type: "private" },
      from: { first_name: "Михаил" },
    },
  }, "", { "X-Telegram-Bot-Api-Secret-Token": webhookSecret });
  assert.equal(acceptedWebhook.status, 200);
  assert.equal(botRequests.length, 1);
  assert.equal(botRequests[0].url, `/bot${botToken}/sendMessage`);
  assert.equal(botRequests[0].body.reply_markup.inline_keyboard[0][0].web_app.url, "https://xn--80avakiab.xn--p1ai/");
});
