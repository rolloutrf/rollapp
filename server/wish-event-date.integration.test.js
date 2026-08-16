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

test("wish eventDate: create, read, patch, reset and validation", async (t) => {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", DEMO_MODE: "true", DATABASE_URL: "", PGHOST: "", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  await waitForServer(child);

  const ownerCookie = await login("demo@rollapp.test");

  // Создание с eventDate → значение возвращается строкой YYYY-MM-DD
  const createResponse = await post("/wishes", { title: "Подарок к событию", eventDate: "2026-12-31", listIds: [] }, ownerCookie);
  assert.equal(createResponse.status, 201);
  const created = (await createResponse.json()).wish;
  assert.equal(created.eventDate, "2026-12-31");

  // Создание без eventDate → null
  const noDateResponse = await post("/wishes", { title: "Без даты", listIds: [] }, ownerCookie);
  assert.equal(noDateResponse.status, 201);
  assert.equal((await noDateResponse.json()).wish.eventDate, null);

  // Создание с явным null → null
  const nullDateResponse = await post("/wishes", { title: "Явный null", eventDate: null, listIds: [] }, ownerCookie);
  assert.equal(nullDateResponse.status, 201);
  assert.equal((await nullDateResponse.json()).wish.eventDate, null);

  // Невалидные форматы → 400
  for (const bad of ["31.12.2026", "2026-13-01", "2026-02-29", "2026-12-31T00:00:00Z", "soon"]) {
    const response = await post("/wishes", { title: "Невалидная дата", eventDate: bad, listIds: [] }, ownerCookie);
    assert.equal(response.status, 400, `eventDate=${bad} должен отклоняться`);
    await response.json();
  }

  // eventDate присутствует в ответе dashboard
  const dashboardResponse = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: ownerCookie } });
  assert.equal(dashboardResponse.status, 200);
  const dashboard = await dashboardResponse.json();
  const inDashboard = dashboard.wishes.find((wish) => wish.id === created.id);
  assert.ok(inDashboard);
  assert.equal(inDashboard.eventDate, "2026-12-31");

  // PATCH с новой датой
  const patchDateResponse = await patch(`/wishes/${created.id}`, { eventDate: "2027-01-15" }, ownerCookie);
  assert.equal(patchDateResponse.status, 200);
  assert.equal((await patchDateResponse.json()).wish.eventDate, "2027-01-15");

  // PATCH без eventDate не должен сбрасывать значение
  const patchTitleResponse = await patch(`/wishes/${created.id}`, { title: "Переименованный" }, ownerCookie);
  assert.equal(patchTitleResponse.status, 200);
  const patched = (await patchTitleResponse.json()).wish;
  assert.equal(patched.title, "Переименованный");
  assert.equal(patched.eventDate, "2027-01-15");

  // PATCH с null сбрасывает дату
  const resetResponse = await patch(`/wishes/${created.id}`, { eventDate: null }, ownerCookie);
  assert.equal(resetResponse.status, 200);
  assert.equal((await resetResponse.json()).wish.eventDate, null);

  // PATCH с невалидным форматом → 400
  const invalidPatchResponse = await patch(`/wishes/${created.id}`, { eventDate: "15.01.2027" }, ownerCookie);
  assert.equal(invalidPatchResponse.status, 400);
  await invalidPatchResponse.json();
});
