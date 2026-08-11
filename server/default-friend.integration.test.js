import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

const port = 19_000 + (process.pid % 1_000);
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
      // The isolated in-memory server is still starting.
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

test("new accounts start with the configured default friend and may unfollow", async (t) => {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      DEMO_MODE: "true",
      DEFAULT_FRIEND_USERNAME: "max",
      DATABASE_URL: "",
      PGHOST: "",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  await waitForServer(child);

  const registered = await post("/auth/register", {
    name: "Новый пользователь",
    email: `default-friend-${process.pid}@rollapp.test`,
    password: "demo1234",
  });
  assert.equal(registered.status, 201);
  const cookie = registered.headers.get("set-cookie").split(";", 1)[0];

  const subscriptions = await fetch(`${baseUrl}/people?scope=subscriptions`, {
    headers: { Cookie: cookie },
  });
  assert.equal(subscriptions.status, 200);
  assert.deepEqual((await subscriptions.json()).people.map((person) => person.username), ["max"]);

  const profile = await fetch(`${baseUrl}/profile/max`, { headers: { Cookie: cookie } });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).isFollowing, true);

  const unfollow = await post("/profile/max/follow", {}, cookie);
  assert.equal(unfollow.status, 200);
  assert.equal((await unfollow.json()).following, false);
  const afterUnfollow = await fetch(`${baseUrl}/people?scope=subscriptions`, {
    headers: { Cookie: cookie },
  });
  assert.deepEqual((await afterUnfollow.json()).people, []);
});
