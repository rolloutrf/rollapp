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

test("wish fundraisingUrl: create, read, patch and validation", async (t) => {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", DEMO_MODE: "true", DATABASE_URL: "", PGHOST: "", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  await waitForServer(child);

  const ownerCookie = await login("demo@rollapp.test");

  const listResponse = await post("/lists", { title: "Список со сборами" }, ownerCookie);
  assert.equal(listResponse.status, 201);
  const listId = (await listResponse.json()).list.id;

  // Создание с fundraisingUrl → значение возвращается как есть
  const createResponse = await post("/wishes", { title: "Подарок со сбором", fundraisingUrl: "https://example.com/fund/123", listIds: [listId] }, ownerCookie);
  assert.equal(createResponse.status, 201);
  const created = (await createResponse.json()).wish;
  assert.equal(created.fundraisingUrl, "https://example.com/fund/123");

  // Создание без fundraisingUrl → пустая строка по умолчанию
  const noUrlResponse = await post("/wishes", { title: "Без сбора", listIds: [listId] }, ownerCookie);
  assert.equal(noUrlResponse.status, 201);
  assert.equal((await noUrlResponse.json()).wish.fundraisingUrl, "");

  // Создание с пустой строкой → пустая строка
  const emptyUrlResponse = await post("/wishes", { title: "Пустая строка", fundraisingUrl: "", listIds: [listId] }, ownerCookie);
  assert.equal(emptyUrlResponse.status, 201);
  assert.equal((await emptyUrlResponse.json()).wish.fundraisingUrl, "");

  // Невалидные значения → 400
  for (const bad of ["not-a-url", "example.com/fund", `https://example.com/${"a".repeat(2_000)}`]) {
    const response = await post("/wishes", { title: "Невалидная ссылка", fundraisingUrl: bad, listIds: [listId] }, ownerCookie);
    assert.equal(response.status, 400, `fundraisingUrl=${bad.slice(0, 40)} должен отклоняться`);
    await response.json();
  }

  // fundraisingUrl присутствует в ответе dashboard
  const dashboardResponse = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: ownerCookie } });
  assert.equal(dashboardResponse.status, 200);
  const dashboard = await dashboardResponse.json();
  const inDashboard = dashboard.wishes.find((wish) => wish.id === created.id);
  assert.ok(inDashboard);
  assert.equal(inDashboard.fundraisingUrl, "https://example.com/fund/123");

  // PATCH с новой ссылкой
  const patchUrlResponse = await patch(`/wishes/${created.id}`, { fundraisingUrl: "https://boosty.to/gift" }, ownerCookie);
  assert.equal(patchUrlResponse.status, 200);
  assert.equal((await patchUrlResponse.json()).wish.fundraisingUrl, "https://boosty.to/gift");

  // PATCH без fundraisingUrl не должен сбрасывать значение
  const patchTitleResponse = await patch(`/wishes/${created.id}`, { title: "Переименованный" }, ownerCookie);
  assert.equal(patchTitleResponse.status, 200);
  const patched = (await patchTitleResponse.json()).wish;
  assert.equal(patched.title, "Переименованный");
  assert.equal(patched.fundraisingUrl, "https://boosty.to/gift");

  // PATCH с пустой строкой очищает ссылку
  const clearResponse = await patch(`/wishes/${created.id}`, { fundraisingUrl: "" }, ownerCookie);
  assert.equal(clearResponse.status, 200);
  assert.equal((await clearResponse.json()).wish.fundraisingUrl, "");

  // PATCH с невалидной ссылкой → 400
  const invalidPatchResponse = await patch(`/wishes/${created.id}`, { fundraisingUrl: "просто текст" }, ownerCookie);
  assert.equal(invalidPatchResponse.status, 400);
  await invalidPatchResponse.json();
});
