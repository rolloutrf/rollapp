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

async function remove(path, cookie = "") {
  return fetch(`${baseUrl}${path}`, {
    method: "DELETE",
    headers: cookie ? { Cookie: cookie } : {},
  });
}

async function login() {
  const response = await post("/auth/login", { email: "demo@rollapp.test", password: "demo1234" });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";", 1)[0];
}

async function createWish(title, cookie, space = "products") {
  const response = await post("/wishes", { title, listIds: [], space }, cookie);
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
  assert.equal(group.space, "products");

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
  const winningWishId = concurrentGroup.wishIds.find((wishId) => wishId !== shared.id);

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

  const missingMemberResponse = await remove(`/lists/${list.id}/groups/${group.id}/wishes/${fourth.id}`, cookie);
  assert.equal(missingMemberResponse.status, 404);
  assert.deepEqual(await missingMemberResponse.json(), { error: "Желание не найдено в группе" });

  const removeThirdResponse = await remove(`/lists/${list.id}/groups/${group.id}/wishes/${third.id}`, cookie);
  const removeThirdPayload = await removeThirdResponse.json();
  assert.equal(removeThirdResponse.status, 200, JSON.stringify(removeThirdPayload));
  assert.equal(removeThirdPayload.dissolved, false);
  assert.deepEqual(new Set(removeThirdPayload.group.wishIds), new Set([first.id, second.id]));

  const afterSingleRemovalResponse = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: cookie } });
  assert.equal(afterSingleRemovalResponse.status, 200);
  const afterSingleRemoval = await afterSingleRemovalResponse.json();
  assert.deepEqual(
    new Set(afterSingleRemoval.groups.find((item) => item.id === group.id)?.wishIds),
    new Set([first.id, second.id]),
  );
  assert.ok(afterSingleRemoval.wishes.find((wish) => wish.id === third.id)?.listIds.includes(list.id));

  const dissolveResponse = await remove(`/lists/${list.id}/groups/${group.id}/wishes/${first.id}`, cookie);
  const dissolvePayload = await dissolveResponse.json();
  assert.equal(dissolveResponse.status, 200, JSON.stringify(dissolvePayload));
  assert.equal(dissolvePayload.dissolved, true);
  assert.equal(dissolvePayload.group, null);

  const afterDissolveResponse = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: cookie } });
  assert.equal(afterDissolveResponse.status, 200);
  const afterDissolve = await afterDissolveResponse.json();
  assert.equal(afterDissolve.groups.some((item) => item.id === group.id), false);
  for (const wishId of [first.id, second.id, third.id]) {
    assert.ok(afterDissolve.wishes.find((wish) => wish.id === wishId)?.listIds.includes(list.id));
  }

  const disbandResponse = await remove(`/lists/${list.id}/groups/${concurrentGroup.id}`, cookie);
  assert.equal(disbandResponse.status, 200);
  assert.deepEqual(await disbandResponse.json(), { ok: true });
  const disbandedDashboardResponse = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: cookie } });
  const disbandedDashboard = await disbandedDashboardResponse.json();
  assert.equal(disbandedDashboardResponse.status, 200);
  assert.ok(!disbandedDashboard.groups.some((item) => item.id === concurrentGroup.id));
  for (const wishId of [shared.id, winningWishId]) {
    assert.ok(disbandedDashboard.wishes.find((wish) => wish.id === wishId)?.listIds.includes(list.id));
  }

  const generalListResponse = await post("/lists", {
    title: "Мои желания",
    description: "Всё, чему я буду рад",
    space: "products",
  }, cookie);
  assert.equal(generalListResponse.status, 201);
  const generalList = (await generalListResponse.json()).list;
  const scopedFirst = await createWish("Товар один", cookie, "products");
  const scopedSecond = await createWish("Товар два", cookie, "products");
  const transportWish = await createWish("Поездка", cookie, "transport");
  const scopedCreateResponse = await post(`/lists/${generalList.id}/groups`, {
    wishIds: [scopedFirst.id, scopedSecond.id],
    space: "products",
  }, cookie);
  const scopedCreatePayload = await scopedCreateResponse.json();
  assert.equal(scopedCreateResponse.status, 201, `${JSON.stringify(scopedCreatePayload)}\n${serverErrors}`);
  assert.equal(scopedCreatePayload.group.space, "products");

  const transportListResponse = await post("/lists", { title: "Поездки", space: "transport" }, cookie);
  assert.equal(transportListResponse.status, 201);
  const transportList = (await transportListResponse.json()).list;
  const attachResponse = await post(`/wishes/${scopedFirst.id}/lists/${transportList.id}`, {}, cookie);
  assert.equal(attachResponse.status, 200);
  const transportGroupResponse = await post(`/lists/${generalList.id}/groups`, {
    wishIds: [scopedFirst.id, transportWish.id],
    space: "transport",
  }, cookie);
  const transportGroupPayload = await transportGroupResponse.json();
  assert.equal(transportGroupResponse.status, 201, JSON.stringify(transportGroupPayload));
  assert.equal(transportGroupPayload.group.space, "transport");

  const scopedDashboard = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: cookie } }).then((response) => response.json());
  const savedGroup = scopedDashboard.groups.find((item) => item.id === scopedCreatePayload.group.id);
  assert.equal(savedGroup.space, "products");
  assert.deepEqual(new Set(savedGroup.wishIds), new Set([scopedFirst.id, scopedSecond.id]));
  const savedTransportGroup = scopedDashboard.groups.find((item) => item.id === transportGroupPayload.group.id);
  assert.equal(savedTransportGroup.space, "transport");
  assert.deepEqual(new Set(savedTransportGroup.wishIds), new Set([scopedFirst.id, transportWish.id]));
});
