import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

const port = 18_000 + (process.pid % 1_000);
const baseUrl = `http://127.0.0.1:${port}/api`;

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
      // The server is still initializing its in-memory schema.
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

async function login(email) {
  const response = await post("/auth/login", { email, password: "demo1234" });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";", 1)[0];
}

test("private lists stay private while link lists remain reservable", async (t) => {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", DEMO_MODE: "true", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  await waitForServer(child);

  const ownerCookie = await login("demo@rollapp.test");
  const viewerCookie = await login("max@rollapp.test");

  const privateListResponse = await post("/lists", { title: "Private", privacy: "private" }, ownerCookie);
  assert.equal(privateListResponse.status, 201);
  const privateList = (await privateListResponse.json()).list;
  const privateWishResponse = await post("/wishes", { title: "Secret", listIds: [privateList.id] }, ownerCookie);
  assert.equal(privateWishResponse.status, 201);
  const privateWish = (await privateWishResponse.json()).wish;

  const privateShare = await fetch(`${baseUrl}/shared/${privateList.shareToken}`, { headers: { Cookie: viewerCookie } });
  assert.equal(privateShare.status, 404);
  const privateReserve = await post(`/wishes/${privateWish.id}/reserve`, {}, viewerCookie);
  assert.equal(privateReserve.status, 404);

  const linkListResponse = await post("/lists", { title: "By link", privacy: "link" }, ownerCookie);
  assert.equal(linkListResponse.status, 201);
  const linkList = (await linkListResponse.json()).list;
  const linkWishResponse = await post("/wishes", { title: "Shared", listIds: [linkList.id] }, ownerCookie);
  assert.equal(linkWishResponse.status, 201);
  const linkWish = (await linkWishResponse.json()).wish;

  const linkShare = await fetch(`${baseUrl}/shared/${linkList.shareToken}`, { headers: { Cookie: viewerCookie } });
  assert.equal(linkShare.status, 200);
  const linkReserve = await post(`/wishes/${linkWish.id}/reserve`, { shareToken: linkList.shareToken }, viewerCookie);
  assert.equal(linkReserve.status, 201);

  for (let attempt = 0; attempt < 18; attempt += 1) {
    const rejected = await post("/auth/login", { email: "invalid", password: "short" });
    assert.equal(rejected.status, 400);
    await rejected.text();
  }
  const rateLimited = await post("/auth/login", { email: "invalid", password: "short" });
  assert.equal(rateLimited.status, 429);
});
