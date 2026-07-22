import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

const port = 18_000 + (process.pid % 1_000);
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

async function remove(path, cookie = "") {
  return fetch(`${baseUrl}${path}`, {
    method: "DELETE",
    headers: cookie ? { Cookie: cookie } : {},
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

  for (const [legacyPath, expectedLocation] of [
    ["/u/alisa?view=fulfilled", "/alisa?view=fulfilled"],
    ["/u/alisa/lists/list-1", "/alisa/lists/list-1"],
    ["/users/alisa/wishes/wish-1", "/alisa/wishes/wish-1"],
  ]) {
    const legacyResponse = await fetch(`${origin}${legacyPath}`, { redirect: "manual" });
    assert.equal(legacyResponse.status, 301);
    assert.equal(legacyResponse.headers.get("location"), expectedLocation);
  }

  const ownerCookie = await login("demo@rollapp.test");
  const viewerCookie = await login("max@rollapp.test");
  const secondFollowerCookie = await login("sonya@rollapp.test");
  const nonFollowerCookie = await login("lev@rollapp.test");

  const meResponse = await fetch(`${baseUrl}/me`, { headers: { Cookie: ownerCookie } });
  assert.equal(meResponse.status, 200);
  assert.equal(typeof (await meResponse.json()).unreadCount, "number");

  const reservedUsernameResponse = await patch("/me", { username: "app" }, ownerCookie);
  assert.equal(reservedUsernameResponse.status, 409);
  assert.deepEqual(await reservedUsernameResponse.json(), { error: "Этот адрес зарезервирован сервисом — выберите другое имя профиля" });

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
  assert.equal(emptyListsResponse.status, 200);
  assert.deepEqual((await emptyListsResponse.json()).wish.listIds, []);

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
  assert.deepEqual(unchangedDashboard.wishes.find((wish) => wish.id === legacyWish.id).listIds, []);
  assert.equal(unchangedDashboard.lists.find((list) => list.id === sourceList.id).wishCount, sourceList.wishCount - 1);
  assert.equal(unchangedDashboard.lists.find((list) => list.id === targetList.id).wishCount, targetList.wishCount);

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

  const mixedPublicListResponse = await post("/lists", { title: "Mixed public", privacy: "public" }, ownerCookie);
  assert.equal(mixedPublicListResponse.status, 201);
  const mixedPublicList = (await mixedPublicListResponse.json()).list;
  const mixedWishResponse = await post("/wishes", { title: "Mixed visibility", listIds: [mixedPublicList.id, privateList.id] }, ownerCookie);
  assert.equal(mixedWishResponse.status, 201);
  const mixedWish = (await mixedWishResponse.json()).wish;
  const anonymousMixedProfileResponse = await fetch(`${baseUrl}/profile/alisa`);
  assert.equal(anonymousMixedProfileResponse.status, 200);
  const anonymousMixedProfile = await anonymousMixedProfileResponse.json();
  assert.equal(anonymousMixedProfile.lists.some((list) => list.id === privateList.id), false);
  assert.deepEqual(anonymousMixedProfile.wishes.find((wish) => wish.id === mixedWish.id).listIds, [mixedPublicList.id]);

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

  const nonFollowerReserve = await post(`/wishes/${linkWish.id}/reserve`, { shareToken: linkList.shareToken }, nonFollowerCookie);
  assert.equal(nonFollowerReserve.status, 403);

  const viewerDashboardWithReservation = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: viewerCookie } });
  assert.equal(viewerDashboardWithReservation.status, 200);
  assert.equal((await viewerDashboardWithReservation.json()).reservations.some((item) => item.wish_id === linkWish.id), true);
  const makeReservedWishPrivate = await patch(`/wishes/${linkWish.id}`, { privacy: "private" }, ownerCookie);
  assert.equal(makeReservedWishPrivate.status, 200);
  const viewerDashboardAfterPrivacyChange = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: viewerCookie } });
  assert.equal(viewerDashboardAfterPrivacyChange.status, 200);
  assert.equal((await viewerDashboardAfterPrivacyChange.json()).reservations.some((item) => item.wish_id === linkWish.id), false);

  const privacyTransitionListResponse = await post("/lists", { title: "Privacy transition", privacy: "public" }, ownerCookie);
  assert.equal(privacyTransitionListResponse.status, 201);
  const privacyTransitionList = (await privacyTransitionListResponse.json()).list;
  const privacyTransitionWishResponse = await post("/wishes", { title: "Hidden reservation", listIds: [privacyTransitionList.id] }, ownerCookie);
  assert.equal(privacyTransitionWishResponse.status, 201);
  const privacyTransitionWish = (await privacyTransitionWishResponse.json()).wish;
  const privacyTransitionReserve = await post(`/wishes/${privacyTransitionWish.id}/reserve`, {}, viewerCookie);
  assert.equal(privacyTransitionReserve.status, 201);
  const makeReservedListPrivate = await patch(`/lists/${privacyTransitionList.id}`, { privacy: "private" }, ownerCookie);
  assert.equal(makeReservedListPrivate.status, 200);
  const viewerDashboardAfterListPrivacyChange = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: viewerCookie } });
  assert.equal(viewerDashboardAfterListPrivacyChange.status, 200);
  assert.equal((await viewerDashboardAfterListPrivacyChange.json()).reservations.some((item) => item.wish_id === privacyTransitionWish.id), false);

  const exclusiveWishResponse = await post("/wishes", {
    title: "Exclusive race",
    listIds: [sourceList.id],
    allowMultiple: false,
  }, ownerCookie);
  assert.equal(exclusiveWishResponse.status, 201);
  const exclusiveWish = (await exclusiveWishResponse.json()).wish;
  const exclusiveResults = await Promise.all([
    post(`/wishes/${exclusiveWish.id}/reserve`, {}, viewerCookie),
    post(`/wishes/${exclusiveWish.id}/reserve`, {}, secondFollowerCookie),
  ]);
  assert.deepEqual(exclusiveResults.map((response) => response.status).sort(), [201, 409]);
  await Promise.all(exclusiveResults.map((response) => response.text()));

  const ownerAfterReservation = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: ownerCookie } });
  const ownerReservedWish = (await ownerAfterReservation.json()).wishes.find((wish) => wish.id === exclusiveWish.id);
  assert.equal(ownerReservedWish.reservationCount, 0);
  assert.equal(ownerReservedWish.reservedByMe, false);
  const ownerAfterReservationMe = await fetch(`${baseUrl}/me`, { headers: { Cookie: ownerCookie } });
  assert.equal((await ownerAfterReservationMe.json()).unreadCount, 0);

  const unfollowRaceWishResponse = await post("/wishes", {
    title: "Reserve while unfollowing",
    listIds: [sourceList.id],
    allowMultiple: false,
  }, ownerCookie);
  assert.equal(unfollowRaceWishResponse.status, 201);
  const unfollowRaceWish = (await unfollowRaceWishResponse.json()).wish;
  const [raceReserveResponse, raceUnfollowResponse] = await Promise.all([
    post(`/wishes/${unfollowRaceWish.id}/reserve`, {}, viewerCookie),
    post("/profile/alisa/follow", {}, viewerCookie),
  ]);
  assert.ok([201, 403].includes(raceReserveResponse.status));
  assert.equal(raceUnfollowResponse.status, 200);
  assert.equal((await raceUnfollowResponse.json()).following, false);
  await raceReserveResponse.text();
  const reserveAfterUnfollowRace = await post(`/wishes/${unfollowRaceWish.id}/reserve`, {}, secondFollowerCookie);
  assert.equal(reserveAfterUnfollowRace.status, 201);
  await reserveAfterUnfollowRace.text();
  const restoreViewerFollow = await post("/profile/alisa/follow", {}, viewerCookie);
  assert.equal(restoreViewerFollow.status, 200);
  assert.equal((await restoreViewerFollow.json()).following, true);

  const multipleWishResponse = await post("/wishes", {
    title: "Multiple race",
    listIds: [sourceList.id],
    allowMultiple: true,
  }, ownerCookie);
  assert.equal(multipleWishResponse.status, 201);
  const multipleWish = (await multipleWishResponse.json()).wish;
  const multipleResults = await Promise.all([
    post(`/wishes/${multipleWish.id}/reserve`, {}, viewerCookie),
    post(`/wishes/${multipleWish.id}/reserve`, {}, secondFollowerCookie),
  ]);
  assert.deepEqual(multipleResults.map((response) => response.status), [201, 201]);
  await Promise.all(multipleResults.map((response) => response.text()));
  const makeMultipleExclusiveResponse = await patch(`/wishes/${multipleWish.id}`, { allowMultiple: false }, ownerCookie);
  assert.equal(makeMultipleExclusiveResponse.status, 200);
  const viewerProfileAfterExclusive = await fetch(`${baseUrl}/profile/alisa`, { headers: { Cookie: viewerCookie } });
  const exclusiveAgain = (await viewerProfileAfterExclusive.json()).wishes.find((wish) => wish.id === multipleWish.id);
  assert.equal(exclusiveAgain.allowMultiple, false);
  assert.equal(exclusiveAgain.reservationCount, 1);

  const disposableListResponse = await post("/lists", { title: "Disposable", privacy: "public" }, ownerCookie);
  assert.equal(disposableListResponse.status, 201);
  const disposableList = (await disposableListResponse.json()).list;
  const retainedWishResponse = await post("/wishes", { title: "Retained after list delete", listIds: [disposableList.id] }, ownerCookie);
  assert.equal(retainedWishResponse.status, 201);
  const retainedWish = (await retainedWishResponse.json()).wish;
  const deleteDisposableResponse = await remove(`/lists/${disposableList.id}`, ownerCookie);
  assert.equal(deleteDisposableResponse.status, 200);
  const deleteDisposable = await deleteDisposableResponse.json();
  assert.equal(deleteDisposable.reassignedCount, 1);
  const retainedDashboardResponse = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: ownerCookie } });
  const retainedAfterDelete = (await retainedDashboardResponse.json()).wishes.find((wish) => wish.id === retainedWish.id);
  assert.ok(retainedAfterDelete);
  assert.deepEqual(retainedAfterDelete.listIds, [deleteDisposable.fallbackListId]);

  const guardedListResponse = await post("/lists", { title: "Guarded", privacy: "private" }, ownerCookie);
  assert.equal(guardedListResponse.status, 201);
  const guardedList = (await guardedListResponse.json()).list;
  const guardedWishResponse = await post("/wishes", { title: "Never disclose on delete", listIds: [guardedList.id] }, ownerCookie);
  assert.equal(guardedWishResponse.status, 201);
  const guardedWish = (await guardedWishResponse.json()).wish;
  const guardedBeforeDelete = await fetch(`${baseUrl}/profile/alisa`);
  assert.equal((await guardedBeforeDelete.json()).wishes.some((wish) => wish.id === guardedWish.id), false);
  const deleteGuardedResponse = await remove(`/lists/${guardedList.id}`, ownerCookie);
  assert.equal(deleteGuardedResponse.status, 200);
  await deleteGuardedResponse.json();
  const guardedAfterDelete = await fetch(`${baseUrl}/profile/alisa`);
  assert.equal((await guardedAfterDelete.json()).wishes.some((wish) => wish.id === guardedWish.id), false);
  const guardedOwnerDashboard = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: ownerCookie } });
  assert.equal((await guardedOwnerDashboard.json()).wishes.find((wish) => wish.id === guardedWish.id).privacy, "private");

  const countListResponse = await post("/lists", { title: "Active count", privacy: "public" }, ownerCookie);
  assert.equal(countListResponse.status, 201);
  const countList = (await countListResponse.json()).list;
  const countedWishResponse = await post("/wishes", { title: "Fulfilled count", listIds: [countList.id] }, ownerCookie);
  assert.equal(countedWishResponse.status, 201);
  const countedWish = (await countedWishResponse.json()).wish;
  const fulfilledResponse = await post(`/wishes/${countedWish.id}/fulfilled`, {}, ownerCookie);
  assert.equal(fulfilledResponse.status, 200);
  const countListPatchResponse = await patch(`/lists/${countList.id}`, { description: "Count active only" }, ownerCookie);
  assert.equal(countListPatchResponse.status, 200);
  assert.equal((await countListPatchResponse.json()).list.wishCount, 0);

  const concurrentListResponse = await post("/lists", { title: "Concurrent list", privacy: "public" }, ownerCookie);
  assert.equal(concurrentListResponse.status, 201);
  const concurrentList = (await concurrentListResponse.json()).list;
  const concurrentListUpdates = await Promise.all([
    patch(`/lists/${concurrentList.id}`, { title: "Concurrent list renamed" }, ownerCookie),
    patch(`/lists/${concurrentList.id}`, { privacy: "private" }, ownerCookie),
  ]);
  assert.deepEqual(concurrentListUpdates.map((response) => response.status), [200, 200]);
  await Promise.all(concurrentListUpdates.map((response) => response.text()));
  const afterConcurrentListResponse = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: ownerCookie } });
  const afterConcurrentList = (await afterConcurrentListResponse.json()).lists.find((list) => list.id === concurrentList.id);
  assert.equal(afterConcurrentList.title, "Concurrent list renamed");
  assert.equal(afterConcurrentList.privacy, "private");

  const concurrentWishResponse = await post("/wishes", {
    title: "Concurrent wish",
    listIds: [sourceList.id],
  }, ownerCookie);
  assert.equal(concurrentWishResponse.status, 201);
  const concurrentWish = (await concurrentWishResponse.json()).wish;
  const concurrentWishUpdates = await Promise.all([
    patch(`/wishes/${concurrentWish.id}`, { title: "Concurrent wish renamed" }, ownerCookie),
    patch(`/wishes/${concurrentWish.id}`, { privacy: "private" }, ownerCookie),
    patch(`/wishes/${concurrentWish.id}`, { listIds: [targetList.id] }, ownerCookie),
  ]);
  assert.deepEqual(concurrentWishUpdates.map((response) => response.status), [200, 200, 200]);
  await Promise.all(concurrentWishUpdates.map((response) => response.text()));
  const afterConcurrentWishResponse = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: ownerCookie } });
  const afterConcurrentWish = (await afterConcurrentWishResponse.json()).wishes.find((wish) => wish.id === concurrentWish.id);
  assert.equal(afterConcurrentWish.title, "Concurrent wish renamed");
  assert.equal(afterConcurrentWish.privacy, "private");
  assert.deepEqual(afterConcurrentWish.listIds, [targetList.id]);

  const copyResponse = await post(`/wishes/${retainedWish.id}/copy`, {}, viewerCookie);
  assert.equal(copyResponse.status, 201);
  const copiedWishId = (await copyResponse.json()).wish.id;
  const viewerAfterCopy = await fetch(`${baseUrl}/dashboard`, { headers: { Cookie: viewerCookie } });
  assert.ok((await viewerAfterCopy.json()).wishes.some((wish) => wish.id === copiedWishId));

  const anonymousProfileForCountResponse = await fetch(`${baseUrl}/profile/alisa`);
  const anonymousVisibleCount = (await anonymousProfileForCountResponse.json()).wishes.length;
  const peopleResponse = await fetch(`${baseUrl}/people?search=alisa`);
  assert.equal(peopleResponse.status, 200);
  const alisaInPeople = (await peopleResponse.json()).people.find((person) => person.username === "alisa");
  assert.equal(alisaInPeople.wishCount, anonymousVisibleCount);
  const ownerPeopleResponse = await fetch(`${baseUrl}/people?search=alisa`, { headers: { Cookie: ownerCookie } });
  assert.equal((await ownerPeopleResponse.json()).people.some((person) => person.username === "alisa"), false);

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const rejected = await post("/auth/login", { email: "invalid", password: "short" });
    assert.equal(rejected.status, 400);
    await rejected.text();
  }
  const rateLimited = await post("/auth/login", { email: "invalid", password: "short" });
  assert.equal(rateLimited.status, 429);
});
