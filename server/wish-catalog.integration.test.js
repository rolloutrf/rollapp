import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

const port = 26_000 + (process.pid % 1_000);
const baseUrl = `http://127.0.0.1:${port}/api`;

async function waitForServer(child) {
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Test server exited early:\n${output}`);
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return () => output;
    } catch {
      // The isolated test database is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Test server did not become ready:\n${output}`);
}

async function request(path, { method = "GET", body, cookie = "" } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function login(email) {
  const response = await request("/auth/login", { method: "POST", body: { email, password: "demo1234" } });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";", 1)[0];
}

async function createList(cookie, title, privacy) {
  const response = await request("/lists", {
    method: "POST",
    cookie,
    body: { title, description: "", privacy, color: "coral", space: "products", wishIds: [] },
  });
  assert.equal(response.status, 201);
  return (await response.json()).list;
}

async function createWish(cookie, body) {
  const response = await request("/wishes", {
    method: "POST",
    cookie,
    body: { title: body.title, space: "products", listIds: body.listIds || [], privacy: body.privacy || "inherit", url: body.url || "" },
  });
  assert.equal(response.status, 201);
  return (await response.json()).wish;
}

test("catalog groups public positions and excludes private or link-only wishes", async (t) => {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", DEMO_MODE: "true", DATABASE_URL: "", PGHOST: "", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  const serverOutput = await waitForServer(child);

  const unauthorized = await request("/catalog?space=products");
  assert.equal(unauthorized.status, 401);

  const firstCookie = await login("demo@rollapp.test");
  const secondCookie = await login("max@rollapp.test");
  const suffix = `${process.pid}-${Date.now()}`;
  const sharedTitle = `Catalog Headphones ${suffix}`;
  await createWish(firstCookie, { title: sharedTitle, url: `https://shop.example.com/headphones/${suffix}?utm_source=first` });
  await createWish(secondCookie, { title: sharedTitle.toLocaleUpperCase("ru-RU"), url: `https://other.example.com/headphones/${suffix}` });

  const privateTitle = `Private Catalog Item ${suffix}`;
  await createWish(firstCookie, { title: privateTitle, privacy: "private" });

  const linkList = await createList(firstCookie, `Link-only ${suffix}`, "link");
  const linkTitle = `Link Catalog Item ${suffix}`;
  await createWish(firstCookie, { title: linkTitle, listIds: [linkList.id] });

  const publicList = await createList(firstCookie, `Public ${suffix}`, "public");
  const privateList = await createList(firstCookie, `Private ${suffix}`, "private");
  const mixedTitle = `Mixed Catalog Item ${suffix}`;
  await createWish(firstCookie, { title: mixedTitle, listIds: [publicList.id, privateList.id] });

  const response = await request("/catalog?space=products&limit=96", { cookie: secondCookie });
  const responseBody = await response.clone().text();
  assert.equal(response.status, 200, `${responseBody}\n${serverOutput()}`);
  const catalog = await response.json();
  const grouped = catalog.items.find((item) => item.title.toLocaleLowerCase("ru-RU") === sharedTitle.toLocaleLowerCase("ru-RU"));
  assert.ok(grouped);
  assert.equal(grouped.ownerCount, 2);
  assert.equal(grouped.wishCount, 2);
  assert.equal(new Set(grouped.owners.map((owner) => owner.id)).size, 2);
  assert.equal(catalog.items.some((item) => item.title === privateTitle), false);
  assert.equal(catalog.items.some((item) => item.title === linkTitle), false);
  assert.equal(catalog.items.some((item) => item.title === mixedTitle), false);
});
