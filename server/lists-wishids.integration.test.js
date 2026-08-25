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

async function login(email) {
  const response = await post("/auth/login", { email, password: "demo1234" });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";", 1)[0];
}

test("lists wishIds: создание списка с привязкой желаний и проверки владения", async (t) => {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", DEMO_MODE: "true", DATABASE_URL: "", PGHOST: "", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  await waitForServer(child);

  const ownerCookie = await login("demo@rollapp.test");

  // Готовим два собственных желания владельца
  const firstWishResponse = await post("/wishes", { title: "Наушники", listIds: [] }, ownerCookie);
  assert.equal(firstWishResponse.status, 201);
  const firstWish = (await firstWishResponse.json()).wish;

  const secondWishResponse = await post("/wishes", { title: "Рюкзак", listIds: [] }, ownerCookie);
  assert.equal(secondWishResponse.status, 201);
  const secondWish = (await secondWishResponse.json()).wish;

  // (а) Создание списка с двумя своими wishIds → 201, желания получают новый listId
  const groupResponse = await post("/lists", {
    title: "Группа подарков",
    wishIds: [firstWish.id, secondWish.id, firstWish.id],
  }, ownerCookie);
  assert.equal(groupResponse.status, 201);
  const group = (await groupResponse.json()).list;
  assert.equal(group.title, "Группа подарков");

  const dashboardResponse = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: ownerCookie } });
  assert.equal(dashboardResponse.status, 200);
  const dashboard = await dashboardResponse.json();
  assert.ok(dashboard.lists.some((list) => list.id === group.id));

  for (const wishId of [firstWish.id, secondWish.id]) {
    const wishInDashboard = dashboard.wishes.find((item) => item.id === wishId);
    assert.ok(wishInDashboard, `желание ${wishId} должно быть в dashboard`);
    assert.ok(
      wishInDashboard.listIds.includes(group.id),
      `желание ${wishId} должно быть привязано к списку ${group.id}`,
    );
  }

  // (б) wishIds с несуществующим id → 400
  const missingResponse = await post("/lists", {
    title: "Список с фантомом",
    wishIds: ["00000000-0000-0000-0000-000000000000"],
  }, ownerCookie);
  assert.equal(missingResponse.status, 400);

  // (в) wishIds с чужим желанием → 400
  const registered = await post("/auth/register", {
    name: "Чужой владелец",
    email: `lists-wishids-${process.pid}@rollapp.test`,
    password: "demo1234",
  });
  assert.equal(registered.status, 201);
  const strangerCookie = registered.headers.get("set-cookie").split(";", 1)[0];

  const strangerWishResponse = await post("/wishes", { title: "Чужое желание", listIds: [] }, strangerCookie);
  assert.equal(strangerWishResponse.status, 201);
  const strangerWish = (await strangerWishResponse.json()).wish;

  const foreignResponse = await post("/lists", {
    title: "Список с чужим желанием",
    wishIds: [strangerWish.id],
  }, ownerCookie);
  assert.equal(foreignResponse.status, 400);

  // (г) Без wishIds — поведение прежнее
  const plainResponse = await post("/lists", { title: "Обычный список" }, ownerCookie);
  assert.equal(plainResponse.status, 201);
  const plainList = (await plainResponse.json()).list;
  assert.equal(plainList.title, "Обычный список");

  const plainDashboardResponse = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: ownerCookie } });
  const plainDashboard = await plainDashboardResponse.json();
  assert.ok(plainDashboard.lists.some((list) => list.id === plainList.id));
  assert.ok(
    plainDashboard.wishes.every((wish) => !wish.listIds.includes(plainList.id)),
    "к пустому списку ничего не должно привязываться",
  );
});
