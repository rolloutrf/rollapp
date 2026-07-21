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

  const meResponse = await fetch(`${baseUrl}/me`, { headers: { Cookie: ownerCookie } });
  assert.equal(meResponse.status, 200);
  assert.equal(typeof (await meResponse.json()).unreadCount, "number");

  const notificationsResponse = await fetch(`${baseUrl}/notifications`, { headers: { Cookie: ownerCookie } });
  assert.equal(notificationsResponse.status, 200);
  assert.ok(Array.isArray((await notificationsResponse.json()).notifications));

  const readNotificationsResponse = await post("/notifications/read", {}, ownerCookie);
  assert.equal(readNotificationsResponse.status, 200);

  const dashboardResponse = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: ownerCookie } });
  assert.equal(dashboardResponse.status, 200);
  const dashboard = await dashboardResponse.json();
  assert.deepEqual(dashboard.games, []);

  const legacyWish = dashboard.wishes.find((wish) => wish.id === "demo-wish-camera");
  assert.ok(legacyWish);
  assert.equal(legacyWish.imageUrl, "/art/camera.svg");
  const sourceList = dashboard.lists.find((list) => legacyWish.listIds.includes(list.id));
  const targetList = dashboard.lists.find((list) => !legacyWish.listIds.includes(list.id));
  assert.ok(sourceList);
  assert.ok(targetList);

  const protocolRelativeImageResponse = await post("/wishes", {
    title: "Unsafe protocol-relative image",
    imageUrl: "//cdn.example/image.jpg",
    listIds: [sourceList.id],
  }, ownerCookie);
  assert.equal(protocolRelativeImageResponse.status, 400);
  await protocolRelativeImageResponse.json();

  const backslashImageResponse = await post("/wishes", {
    title: "Unsafe backslash image",
    imageUrl: "/art\\camera.svg",
    listIds: [sourceList.id],
  }, ownerCookie);
  assert.equal(backslashImageResponse.status, 400);
  await backslashImageResponse.json();

  const moveWishResponse = await patch(`/wishes/${legacyWish.id}`, { listIds: [targetList.id] }, ownerCookie);
  assert.equal(moveWishResponse.status, 200);
  const movedWish = (await moveWishResponse.json()).wish;
  assert.deepEqual(movedWish.listIds, [targetList.id]);

  const movedDashboardResponse = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: ownerCookie } });
  assert.equal(movedDashboardResponse.status, 200);
  const movedDashboard = await movedDashboardResponse.json();
  assert.deepEqual(movedDashboard.wishes.find((wish) => wish.id === legacyWish.id).listIds, [targetList.id]);
  assert.equal(movedDashboard.lists.find((list) => list.id === sourceList.id).wishCount, sourceList.wishCount - 1);
  assert.equal(movedDashboard.lists.find((list) => list.id === targetList.id).wishCount, targetList.wishCount + 1);

  const emptyListsResponse = await patch(`/wishes/${legacyWish.id}`, { listIds: [] }, ownerCookie);
  assert.equal(emptyListsResponse.status, 400);
  await emptyListsResponse.json();

  const duplicateListsResponse = await patch(`/wishes/${legacyWish.id}`, { listIds: [targetList.id, targetList.id] }, ownerCookie);
  assert.equal(duplicateListsResponse.status, 400);
  await duplicateListsResponse.json();

  const viewerDashboardResponse = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: viewerCookie } });
  assert.equal(viewerDashboardResponse.status, 200);
  const viewerDashboard = await viewerDashboardResponse.json();
  const foreignListId = viewerDashboard.lists[0].id;
  const foreignListResponse = await patch(`/wishes/${legacyWish.id}`, { listIds: [foreignListId] }, ownerCookie);
  assert.equal(foreignListResponse.status, 403);
  await foreignListResponse.json();

  const unchangedDashboardResponse = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: ownerCookie } });
  assert.equal(unchangedDashboardResponse.status, 200);
  const unchangedDashboard = await unchangedDashboardResponse.json();
  assert.deepEqual(unchangedDashboard.wishes.find((wish) => wish.id === legacyWish.id).listIds, [targetList.id]);
  assert.equal(unchangedDashboard.lists.find((list) => list.id === sourceList.id).wishCount, sourceList.wishCount - 1);
  assert.equal(unchangedDashboard.lists.find((list) => list.id === targetList.id).wishCount, targetList.wishCount + 1);

  const removedApiResponse = await fetch(`${baseUrl}/santa`, { headers: { Cookie: ownerCookie } });
  assert.equal(removedApiResponse.status, 404);
  assert.match(removedApiResponse.headers.get("content-type"), /^application\/json/);
  assert.deepEqual(await removedApiResponse.json(), { error: "Маршрут API не найден" });

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
