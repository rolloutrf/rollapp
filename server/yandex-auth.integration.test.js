import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { test } from "node:test";

const appPort = 28_000 + ((process.pid % 1_000) * 2);
const oauthPort = appPort + 1;
const origin = `http://127.0.0.1:${appPort}`;
const baseUrl = `${origin}/api`;
const oauthOrigin = `http://127.0.0.1:${oauthPort}`;
const clientId = "rollapp-yandex-integration";
const clientSecret = "integration-secret-that-stays-on-the-server";

function responseCookies(response) {
  if (typeof response.headers.getSetCookie === "function") return response.headers.getSetCookie();
  const combined = response.headers.get("set-cookie");
  return combined ? [combined] : [];
}

function cookiePair(setCookie) {
  return setCookie.split(";", 1)[0];
}

function findCookie(response, name) {
  const cookie = responseCookies(response).find((value) => value.startsWith(`${name}=`));
  return cookie ? cookiePair(cookie) : "";
}

function findCookieByPrefix(response, prefix) {
  const cookie = responseCookies(response).find((value) => value.startsWith(prefix));
  return cookie ? cookiePair(cookie) : "";
}

async function waitForServer(child) {
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  for (let attempt = 0; attempt < 160; attempt += 1) {
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

async function startFlow({ next = "/app/wishes", sessionCookie = "", link = false } = {}) {
  const params = new URLSearchParams({ next });
  if (link) params.set("link", "1");
  const response = await fetch(`${baseUrl}/auth/yandex/start?${params}`, {
    headers: sessionCookie ? { Cookie: sessionCookie } : {},
    redirect: "manual",
  });
  const location = response.headers.get("location");
  return {
    response,
    authorizationUrl: location?.startsWith("http") ? new URL(location) : null,
    stateCookie: findCookieByPrefix(response, "rw_yandex_oauth_"),
  };
}

async function finishFlow(flow, code, sessionCookie = "") {
  const state = flow.authorizationUrl.searchParams.get("state");
  const cookies = [sessionCookie, flow.stateCookie].filter(Boolean).join("; ");
  return fetch(`${baseUrl}/auth/yandex/callback?${new URLSearchParams({ code, state })}`, {
    headers: { Cookie: cookies },
    redirect: "manual",
  });
}

async function login(email = "demo@rollapp.test") {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234" }),
  });
  assert.equal(response.status, 200);
  return findCookie(response, "rw_session");
}

test("Yandex ID creates, repeats and explicitly links Rollapp accounts with one-time state", async (t) => {
  const tokenRequests = [];
  const oauthServer = http.createServer(async (req, res) => {
    if (req.url === "/token" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const form = new URLSearchParams(body);
      tokenRequests.push({ authorization: req.headers.authorization, form });
      assert.equal(req.headers.authorization, `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`);
      assert.match(form.get("code_verifier") || "", /^[A-Za-z0-9_-]{43,128}$/);
      assert.equal(form.has("redirect_uri"), false);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ access_token: `token:${form.get("code")}`, token_type: "bearer" }));
      return;
    }
    if (req.url === "/info?format=json" && req.method === "GET") {
      const code = String(req.headers.authorization || "").replace(/^OAuth token:/, "");
      const profiles = {
        "new-user": { id: "9000001", default_email: "oauth-user@example.com", first_name: "Яна", last_name: "Яндексова" },
        "same-user": { id: "9000001", default_email: "oauth-user@example.com", first_name: "Яна", last_name: "Яндексова" },
        "username-conflict": { id: "9000003", default_email: "oauth-name@example.com", first_name: "Алиса" },
        "existing-email": { id: "9000002", default_email: "demo@rollapp.test", first_name: "Алиса", last_name: "Морозова" },
        "link-existing": { id: "9000002", default_email: "demo@rollapp.test", first_name: "Алиса", last_name: "Морозова" },
      };
      const profile = profiles[code];
      if (!profile) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_token" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ...profile, login: `user-${profile.id}`, client_id: clientId }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise((resolve) => oauthServer.listen(oauthPort, "127.0.0.1", resolve));
  t.after(() => oauthServer.close());

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      DEMO_MODE: "true",
      DATABASE_URL: "",
      PGHOST: "",
      PORT: String(appPort),
      APP_ORIGIN: origin,
      PUBLIC_APP_URL: origin,
      YANDEX_OAUTH_CLIENT_ID: clientId,
      YANDEX_OAUTH_CLIENT_SECRET: clientSecret,
      YANDEX_OAUTH_TEST_AUTHORIZE_URL: `${oauthOrigin}/authorize`,
      YANDEX_OAUTH_TEST_TOKEN_URL: `${oauthOrigin}/token`,
      YANDEX_OAUTH_TEST_USER_INFO_URL: `${oauthOrigin}/info`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  await waitForServer(child);

  const configResponse = await fetch(`${baseUrl}/auth/yandex/config`);
  assert.deepEqual(await configResponse.json(), { enabled: true });

  const first = await startFlow({ next: "/app/friends/subscriptions?from=yandex" });
  assert.equal(first.response.status, 302);
  assert.ok(first.stateCookie.startsWith("rw_yandex_oauth_"));
  const stateCookieHeader = responseCookies(first.response).find((value) => value.startsWith("rw_yandex_oauth_"));
  assert.match(stateCookieHeader, /HttpOnly/i);
  assert.match(stateCookieHeader, /SameSite=Lax/i);
  assert.match(stateCookieHeader, /Path=\/api\/auth\/yandex\/callback/i);
  assert.equal(first.authorizationUrl.searchParams.get("code_challenge_method"), "S256");

  const created = await finishFlow(first, "new-user");
  assert.equal(created.status, 303);
  assert.equal(created.headers.get("location"), "/app/friends/subscriptions?from=yandex");
  const createdSession = findCookie(created, "rw_session");
  assert.ok(createdSession);
  const createdMe = await fetch(`${baseUrl}/me`, { headers: { Cookie: createdSession } }).then((response) => response.json());
  assert.ok(createdMe.user, JSON.stringify(createdMe));
  assert.equal(createdMe.user.email, "oauth-user@example.com");
  assert.equal(createdMe.user.hasYandex, true);

  const replay = await finishFlow(first, "same-user");
  assert.equal(replay.status, 303);
  assert.match(replay.headers.get("location"), /auth_error=YANDEX_STATE_INVALID/);
  assert.equal(tokenRequests.length, 1);

  const repeat = await startFlow({ next: "/app/wishes" });
  const repeatedLogin = await finishFlow(repeat, "same-user");
  assert.equal(repeatedLogin.status, 303);
  const repeatedSession = findCookie(repeatedLogin, "rw_session");
  const repeatedMe = await fetch(`${baseUrl}/me`, { headers: { Cookie: repeatedSession } }).then((response) => response.json());
  assert.equal(repeatedMe.user.id, createdMe.user.id);

  const parallelFirst = await startFlow({ next: "/app/wishes?tab=first" });
  const parallelSecond = await startFlow({ next: "/app/wishes?tab=second" });
  assert.notEqual(parallelFirst.stateCookie, parallelSecond.stateCookie);
  const parallelFirstResult = await finishFlow(parallelFirst, "same-user", parallelSecond.stateCookie);
  const parallelSecondResult = await finishFlow(parallelSecond, "same-user", parallelFirst.stateCookie);
  assert.equal(parallelFirstResult.headers.get("location"), "/app/wishes?tab=first");
  assert.equal(parallelSecondResult.headers.get("location"), "/app/wishes?tab=second");

  const usernameCollision = await startFlow();
  const usernameCollisionResult = await finishFlow(usernameCollision, "username-conflict");
  const usernameCollisionSession = findCookie(usernameCollisionResult, "rw_session");
  const usernameCollisionMe = await fetch(`${baseUrl}/me`, { headers: { Cookie: usernameCollisionSession } }).then((response) => response.json());
  assert.equal(usernameCollisionMe.user.email, "oauth-name@example.com");
  assert.equal(usernameCollisionMe.user.username, "alisa-2");

  const collision = await startFlow({ next: "/app/wishes" });
  const collisionResponse = await finishFlow(collision, "existing-email");
  assert.match(collisionResponse.headers.get("location"), /auth_error=YANDEX_LINK_REQUIRED/);
  assert.equal(findCookie(collisionResponse, "rw_session"), "");

  const noSessionLink = await startFlow({ link: true });
  assert.equal(noSessionLink.response.status, 303);
  assert.match(noSessionLink.response.headers.get("location"), /auth_error=YANDEX_LINK_LOGIN_REQUIRED/);

  const demoSession = await login();
  const link = await startFlow({ link: true, sessionCookie: demoSession, next: "/app/wishes?linked=1" });
  const linked = await finishFlow(link, "link-existing", demoSession);
  assert.equal(linked.status, 303);
  assert.match(linked.headers.get("location"), /^\/login\?/);
  assert.match(linked.headers.get("location"), /auth_success=YANDEX_LINKED/);
  const linkedSession = findCookie(linked, "rw_session");
  const linkedMe = await fetch(`${baseUrl}/me`, { headers: { Cookie: linkedSession } }).then((response) => response.json());
  assert.equal(linkedMe.user.email, "demo@rollapp.test");
  assert.equal(linkedMe.user.hasYandex, true);
  const immediateLogin = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "demo@rollapp.test", password: "demo1234" }),
  });
  assert.equal((await immediateLogin.json()).user.hasYandex, true);

  const malicious = await startFlow({ next: "//evil.example/steal" });
  const safeRedirect = await finishFlow(malicious, "same-user");
  assert.equal(safeRedirect.headers.get("location"), "/app/wishes");

  const cancelled = await startFlow({ next: "/app/wishes" });
  const cancelState = cancelled.authorizationUrl.searchParams.get("state");
  const cancelledResponse = await fetch(`${baseUrl}/auth/yandex/callback?${new URLSearchParams({ error: "access_denied", state: cancelState })}`, {
    headers: { Cookie: cancelled.stateCookie },
    redirect: "manual",
  });
  assert.match(cancelledResponse.headers.get("location"), /auth_error=YANDEX_CANCELLED/);
});
