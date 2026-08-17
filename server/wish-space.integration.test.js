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

test("wish space: желание без списка хранит собственное space, патч обновляет и не сбрасывает", async (t) => {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", DEMO_MODE: "true", DATABASE_URL: "", PGHOST: "", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  await waitForServer(child);

  const ownerCookie = await login("demo@rollapp.test");

  // POST /wishes с пустым listIds и space='events' → 201, желание живёт в пространстве без списка
  const spacelessResponse = await post("/wishes", { title: "Прогулка на каяках", listIds: [], space: "events" }, ownerCookie);
  assert.equal(spacelessResponse.status, 201);
  const spacelessWish = (await spacelessResponse.json()).wish;
  assert.equal(spacelessWish.space, "events");
  assert.deepEqual(spacelessWish.listIds, []);

  // В dashboard у желания space='events' и пустой listIds
  const dashboardResponse = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: ownerCookie } });
  assert.equal(dashboardResponse.status, 200);
  const dashboard = await dashboardResponse.json();
  const spacelessInDashboard = dashboard.wishes.find((item) => item.id === spacelessWish.id);
  assert.ok(spacelessInDashboard);
  assert.equal(spacelessInDashboard.space, "events");
  assert.deepEqual(spacelessInDashboard.listIds, []);

  // POST /wishes с пустым listIds БЕЗ space → 201, space=null (фронтенд сам разрулит fallback)
  const noSpaceResponse = await post("/wishes", { title: "Желание без пространства", listIds: [] }, ownerCookie);
  assert.equal(noSpaceResponse.status, 201);
  const noSpaceWish = (await noSpaceResponse.json()).wish;
  assert.equal(noSpaceWish.space, null);
  assert.deepEqual(noSpaceWish.listIds, []);

  // Невалидный space по-прежнему отклоняется
  const invalidSpaceResponse = await post("/wishes", { title: "Странное желание", listIds: [], space: "weird" }, ownerCookie);
  assert.equal(invalidSpaceResponse.status, 400);

  // Желание со списком space='events' и space='events': привязка и пространство согласованы
  const eventsListResponse = await post("/lists", { title: "События", space: "events" }, ownerCookie);
  assert.equal(eventsListResponse.status, 201);
  const eventsList = (await eventsListResponse.json()).list;
  assert.equal(eventsList.space, "events");

  const linkedResponse = await post("/wishes", { title: "Билет на концерт", listIds: [eventsList.id], space: "events" }, ownerCookie);
  assert.equal(linkedResponse.status, 201);
  const linkedWish = (await linkedResponse.json()).wish;
  assert.deepEqual(linkedWish.listIds, [eventsList.id]);
  assert.equal(linkedWish.space, "events");

  const linkedDashboardResponse = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: ownerCookie } });
  assert.equal(linkedDashboardResponse.status, 200);
  const linkedDashboard = await linkedDashboardResponse.json();
  const linkedInDashboard = linkedDashboard.wishes.find((item) => item.id === linkedWish.id);
  assert.deepEqual(linkedInDashboard.listIds, [eventsList.id]);
  assert.equal(linkedInDashboard.space, "events");
  assert.deepEqual(
    linkedInDashboard.listIds.map((listId) => linkedDashboard.lists.find((list) => list.id === listId)?.space),
    ["events"],
  );

  // PATCH со сменой space обновляет значение
  const moveSpaceResponse = await patch(`/wishes/${linkedWish.id}`, { space: "places" }, ownerCookie);
  assert.equal(moveSpaceResponse.status, 200);
  assert.equal((await moveSpaceResponse.json()).wish.space, "places");

  // PATCH без space не сбрасывает значение (merge-семантика)
  const keepSpaceResponse = await patch(`/wishes/${linkedWish.id}`, { title: "Билет на фестиваль" }, ownerCookie);
  assert.equal(keepSpaceResponse.status, 200);
  const keptWish = (await keepSpaceResponse.json()).wish;
  assert.equal(keptWish.title, "Билет на фестиваль");
  assert.equal(keptWish.space, "places");

  // PATCH с listIds: [] по-прежнему разрешён для намеренной отвязки
  const detachResponse = await patch(`/wishes/${linkedWish.id}`, { listIds: [] }, ownerCookie);
  assert.equal(detachResponse.status, 200);
  assert.deepEqual((await detachResponse.json()).wish.listIds, []);
});
