import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

const port = 21_000 + (process.pid % 1_000);
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

async function login() {
  const response = await post("/auth/login", { email: "demo@rollapp.test", password: "demo1234" });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";", 1)[0];
}

async function createWish(title, cookie) {
  const response = await post("/wishes", { title, listIds: [], space: "products" }, cookie);
  assert.equal(response.status, 201);
  return (await response.json()).wish;
}

test("group mutations attach unlisted wishes in the same request", async (t) => {
  let serverErrors = "";
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", DEMO_MODE: "true", DATABASE_URL: "", PGHOST: "", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", (chunk) => { serverErrors += chunk; });
  t.after(() => child.kill("SIGTERM"));
  await waitForServer(child);

  const cookie = await login();
  const listResponse = await post("/lists", { title: "Быстрая группа", space: "products" }, cookie);
  assert.equal(listResponse.status, 201);
  const list = (await listResponse.json()).list;
  const first = await createWish("Первая карточка", cookie);
  const second = await createWish("Вторая карточка", cookie);
  const third = await createWish("Третья карточка", cookie);
  const fourth = await createWish("Четвёртая карточка", cookie);
  assert.deepEqual(first.listIds, []);
  assert.deepEqual(second.listIds, []);

  const createResponse = await post(`/lists/${list.id}/groups`, { wishIds: [first.id, second.id] }, cookie);
  const createPayload = await createResponse.json();
  assert.equal(createResponse.status, 201, JSON.stringify(createPayload));
  const group = createPayload.group;
  assert.deepEqual(group.wishIds, [first.id, second.id]);

  const addResponse = await post(`/lists/${list.id}/groups/${group.id}/wishes`, { wishId: third.id }, cookie);
  assert.equal(addResponse.status, 201);
  assert.deepEqual(await addResponse.json(), { wishId: third.id });

  const conflictResponse = await post(`/lists/${list.id}/groups`, { wishIds: [third.id, fourth.id] }, cookie);
  assert.equal(conflictResponse.status, 409);
  assert.deepEqual(await conflictResponse.json(), { error: "Желание уже в группе" });

  const shared = await createWish("Общая карточка", cookie);
  const left = await createWish("Левая карточка", cookie);
  const right = await createWish("Правая карточка", cookie);
  const concurrentResponses = await Promise.all([
    post(`/lists/${list.id}/groups`, { wishIds: [shared.id, left.id] }, cookie),
    post(`/lists/${list.id}/groups`, { wishIds: [shared.id, right.id] }, cookie),
  ]);
  const concurrentPayloads = await Promise.all(concurrentResponses.map((response) => response.json()));
  assert.deepEqual(concurrentResponses.map((response) => response.status).sort(), [201, 409]);
  const concurrentGroup = concurrentPayloads.find((payload) => payload.group)?.group;
  const losingWishId = concurrentGroup.wishIds.includes(left.id) ? right.id : left.id;

  const dashboardResponse = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: cookie } });
  const dashboard = await dashboardResponse.json();
  assert.equal(dashboardResponse.status, 200, `${JSON.stringify(dashboard)}\n${serverErrors}`);
  assert.deepEqual(
    new Set(dashboard.groups.find((item) => item.id === group.id)?.wishIds),
    new Set([first.id, second.id, third.id]),
  );
  assert.equal(dashboard.groups.filter((item) => item.listId === list.id).length, 2);
  for (const wishId of [first.id, second.id, third.id]) {
    assert.ok(dashboard.wishes.find((wish) => wish.id === wishId)?.listIds.includes(list.id));
  }
  assert.ok(!dashboard.wishes.find((wish) => wish.id === fourth.id)?.listIds.includes(list.id));
  assert.ok(dashboard.wishes.find((wish) => wish.id === shared.id)?.listIds.includes(list.id));
  assert.ok(!dashboard.wishes.find((wish) => wish.id === losingWishId)?.listIds.includes(list.id));
});
