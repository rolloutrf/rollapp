import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

const port = 24_000 + (process.pid % 1_000);
const origin = `http://127.0.0.1:${port}`;
const baseUrl = `${origin}/api`;

async function waitForServer(child) {
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Test server exited early:\n${output}`);
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {
      // The isolated in-memory server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Test server did not become ready:\n${output}`);
}

async function post(path, body, cookie = "") {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

async function login(email) {
  const response = await post("/auth/login", { email, password: "demo1234" });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";", 1)[0];
}

async function createWish(cookie, title, listIds = []) {
  const response = await post("/wishes", { title, listIds, space: "products" }, cookie);
  assert.equal(response.status, 201);
  return (await response.json()).wish;
}

test("gift suggestions reveal only active wishes from public lists", async (t) => {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", DEMO_MODE: "true", DATABASE_URL: "", PGHOST: "", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  await waitForServer(child);

  const ownerCookie = await login("demo@rollapp.test");
  const participantCookie = await login("max@rollapp.test");
  const publicTitle = "Термокружка для приватного теста";
  const privateTitle = "Секретный подарок для приватного теста";
  const linkTitle = "Подарок по ссылке для приватного теста";

  for (const title of [publicTitle, privateTitle, linkTitle]) {
    const source = await createWish(ownerCookie, title);
    const fulfilledResponse = await post(`/wishes/${source.id}/fulfilled`, { fulfilled: true }, ownerCookie);
    assert.equal(fulfilledResponse.status, 200);
  }

  const publicListResponse = await post("/lists", { title: "Публичные совпадения", privacy: "public", space: "products" }, participantCookie);
  assert.equal(publicListResponse.status, 201);
  const publicList = (await publicListResponse.json()).list;
  const privateListResponse = await post("/lists", { title: "Скрытые совпадения", privacy: "private", space: "products" }, participantCookie);
  assert.equal(privateListResponse.status, 201);
  const privateList = (await privateListResponse.json()).list;
  const linkListResponse = await post("/lists", { title: "Совпадения по ссылке", privacy: "link", space: "products" }, participantCookie);
  assert.equal(linkListResponse.status, 201);
  const linkList = (await linkListResponse.json()).list;

  await createWish(participantCookie, publicTitle, [publicList.id]);
  await createWish(participantCookie, privateTitle, [privateList.id]);
  await createWish(participantCookie, linkTitle, [linkList.id]);

  const response = await fetch(`${baseUrl}/gift-suggestions`, { headers: { Cookie: ownerCookie } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const payload = await response.json();

  assert.deepEqual(payload.items.map((item) => item.title), [publicTitle]);
  assert.equal(payload.items[0].participantCount, 1);
  assert.equal(payload.items[0].participants[0].username, "max");
});
