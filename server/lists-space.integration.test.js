import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

const port = 19_000 + (process.pid % 1_000);
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

async function patch(path, body, cookie = "") {
  return fetch(`${baseUrl}${path}`, {
    method: "PATCH",
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

test("list spaces: default, valid values, validation and propagation", async (t) => {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", DEMO_MODE: "true", DATABASE_URL: "", PGHOST: "", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  await waitForServer(child);

  const ownerCookie = await login("demo@rollapp.test");

  // Создание без space → по умолчанию "products"
  const defaultListResponse = await post("/lists", { title: "Без спейса" }, ownerCookie);
  assert.equal(defaultListResponse.status, 201);
  const defaultList = (await defaultListResponse.json()).list;
  assert.equal(defaultList.space, "products");

  // Создание с валидным space для каждого значения enum
  for (const space of ["products", "places", "events", "media", "food"]) {
    const response = await post("/lists", { title: `Спейс ${space}`, space }, ownerCookie);
    assert.equal(response.status, 201);
    assert.equal((await response.json()).list.space, space);
  }

  // Создание с невалидным space → 400
  const invalidCreateResponse = await post("/lists", { title: "Невалидный спейс", space: "unknown" }, ownerCookie);
  assert.equal(invalidCreateResponse.status, 400);
  await invalidCreateResponse.json();

  // Патч с валидным space
  const patchSpaceResponse = await patch(`/lists/${defaultList.id}`, { space: "events" }, ownerCookie);
  assert.equal(patchSpaceResponse.status, 200);
  assert.equal((await patchSpaceResponse.json()).list.space, "events");

  // Патч без space не должен сбрасывать значение
  const patchTitleResponse = await patch(`/lists/${defaultList.id}`, { title: "Переименованный" }, ownerCookie);
  assert.equal(patchTitleResponse.status, 200);
  const patchedList = (await patchTitleResponse.json()).list;
  assert.equal(patchedList.title, "Переименованный");
  assert.equal(patchedList.space, "events");

  // Патч с невалидным space → 400
  const invalidPatchResponse = await patch(`/lists/${defaultList.id}`, { space: "bogus" }, ownerCookie);
  assert.equal(invalidPatchResponse.status, 400);
  await invalidPatchResponse.json();

  // space присутствует в ответе dashboard для всех списков
  const dashboardResponse = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: ownerCookie } });
  assert.equal(dashboardResponse.status, 200);
  const dashboard = await dashboardResponse.json();
  assert.ok(dashboard.lists.length > 0);
  for (const list of dashboard.lists) {
    assert.ok(["products", "places", "events", "media", "food"].includes(list.space));
  }
  // Существующие (сидированные) списки получили 'products' миграцией
  const birthdayList = dashboard.lists.find((list) => list.title === "День рождения");
  assert.ok(birthdayList);
  assert.equal(birthdayList.space, "products");
  const patchedInDashboard = dashboard.lists.find((list) => list.id === defaultList.id);
  assert.equal(patchedInDashboard.space, "events");

  // space присутствует в ответе публичного профиля
  const profileResponse = await fetch(`${baseUrl}/profile/alisa`);
  assert.equal(profileResponse.status, 200);
  const profile = await profileResponse.json();
  assert.ok(profile.lists.length > 0);
  for (const list of profile.lists) {
    assert.ok(["products", "places", "events", "media", "food"].includes(list.space));
  }

  // space присутствует в ответе shared-страницы
  const sharedResponse = await fetch(`${baseUrl}/shared/${birthdayList.shareToken}`);
  assert.equal(sharedResponse.status, 200);
  const shared = await sharedResponse.json();
  assert.equal(shared.list.space, "products");
});
