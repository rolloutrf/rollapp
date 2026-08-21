import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

const port = 23_000 + (process.pid % 1_000);
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
      // The in-memory schema is still initializing.
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

test("wish reorder persists the complete owned order in the demo database", async (t) => {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", DEMO_MODE: "true", DATABASE_URL: "", PGHOST: "", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  await waitForServer(child);

  const loginResponse = await request("/auth/login", {
    method: "POST",
    body: { email: "demo@rollapp.test", password: "demo1234" },
  });
  assert.equal(loginResponse.status, 200);
  const cookie = loginResponse.headers.get("set-cookie").split(";", 1)[0];

  const initialResponse = await request("/dashboard", { cookie });
  assert.equal(initialResponse.status, 200);
  const initial = await initialResponse.json();
  const generalList = initial.lists.find((list) => (
    list.title === "Мои желания" && list.description === "Всё, чему я буду рад"
  ));
  assert.ok(generalList);
  assert.ok(initial.wishes.length > 1);
  for (const wish of initial.wishes) assert.ok(wish.listIds.includes(generalList.id));

  const reversedIds = initial.wishes.map((wish) => wish.id).reverse();
  const reorderResponse = await request("/wishes/reorder", {
    method: "PATCH",
    body: { wishIds: reversedIds },
    cookie,
  });
  assert.equal(reorderResponse.status, 200, JSON.stringify(await reorderResponse.json()));

  const reorderedResponse = await request("/dashboard", { cookie });
  assert.equal(reorderedResponse.status, 200);
  const reordered = await reorderedResponse.json();
  assert.deepEqual(reordered.wishes.map((wish) => wish.id), reversedIds);

  const fulfilledIds = reversedIds.slice(-2);
  for (const wishId of fulfilledIds) {
    const fulfilledResponse = await request(`/wishes/${wishId}/fulfilled`, {
      method: "POST",
      body: { fulfilled: true },
      cookie,
    });
    assert.equal(fulfilledResponse.status, 200);
  }

  const mixedBeforeResponse = await request("/dashboard", { cookie });
  assert.equal(mixedBeforeResponse.status, 200);
  const mixedBefore = await mixedBeforeResponse.json();
  const activeBefore = mixedBefore.wishes
    .filter((wish) => wish.status === "active")
    .map((wish) => wish.id);
  const fulfilledBefore = mixedBefore.wishes
    .filter((wish) => wish.status === "fulfilled")
    .map((wish) => wish.id);
  const reorderedActiveIds = [...activeBefore].reverse();

  const sameStatusReorderResponse = await request("/wishes/reorder", {
    method: "PATCH",
    body: { wishIds: [...reorderedActiveIds, ...fulfilledBefore] },
    cookie,
  });
  assert.equal(sameStatusReorderResponse.status, 200);

  const mixedAfterResponse = await request("/dashboard", { cookie });
  assert.equal(mixedAfterResponse.status, 200);
  const mixedAfter = await mixedAfterResponse.json();
  assert.deepEqual(
    mixedAfter.wishes.filter((wish) => wish.status === "active").map((wish) => wish.id),
    reorderedActiveIds,
  );
  assert.deepEqual(
    mixedAfter.wishes.filter((wish) => wish.status === "fulfilled").map((wish) => wish.id),
    fulfilledBefore,
  );

  const foreignResponse = await request("/wishes/reorder", {
    method: "PATCH",
    body: { wishIds: [...reversedIds, "not-an-owned-wish"] },
    cookie,
  });
  assert.equal(foreignResponse.status, 404);
});
