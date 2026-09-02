import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

const port = 32_000 + (process.pid % 1_000);
const baseUrl = `http://127.0.0.1:${port}/api`;

async function waitForServer(child) {
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Test server exited early:\n${output}`);
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {
      // The isolated in-memory database is still starting.
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

async function login(email) {
  const response = await request("/auth/login", {
    method: "POST",
    body: { email, password: "demo1234" },
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";", 1)[0];
}

test("business accounts request section access and the owner keeps consent control", async (t) => {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      DEMO_MODE: "true",
      DATABASE_URL: "",
      PGHOST: "",
      DEFAULT_FRIEND_USERNAME: "alisa",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  await waitForServer(child);

  const registration = await request("/auth/register", {
    method: "POST",
    body: {
      name: "Клиника Тест",
      email: "business-access@rollapp.test",
      password: "business1234",
      accountType: "business",
    },
  });
  assert.equal(registration.status, 201);
  const registrationPayload = await registration.json();
  assert.equal(registrationPayload.user.accountType, "business");
  const businessCookie = registration.headers.get("set-cookie").split(";", 1)[0];
  const ownerCookie = await login("demo@rollapp.test");

  const businessCandidates = await request(
    "/sphere-shares/candidates?sphere=identity&section=mission&search=klinika",
    { cookie: ownerCookie },
  );
  assert.equal(businessCandidates.status, 200);
  const candidate = (await businessCandidates.json()).people.find((person) => person.id === registrationPayload.user.id);
  assert.equal(candidate?.accountType, "business");

  const directGrant = await request("/sphere-shares", {
    method: "POST",
    cookie: ownerCookie,
    body: { viewerId: registrationPayload.user.id, sphere: "identity", section: "mission", granted: true },
  });
  assert.equal(directGrant.status, 200);
  assert.equal((await directGrant.json()).granted, true);
  const directlyReadable = await request("/identity/content/mission?owner=alisa", { cookie: businessCookie });
  assert.equal(directlyReadable.status, 200);
  const removeDirectGrant = await request("/sphere-shares", {
    method: "POST",
    cookie: ownerCookie,
    body: { viewerId: registrationPayload.user.id, sphere: "identity", section: "mission", granted: false },
  });
  assert.equal(removeDirectGrant.status, 200);

  const personalRegistration = await request("/auth/register", {
    method: "POST",
    body: { name: "Личный Тест", email: "personal-access@rollapp.test", password: "personal1234" },
  });
  assert.equal(personalRegistration.status, 201);
  assert.equal((await personalRegistration.json()).user.accountType, "personal");
  const personalCookie = personalRegistration.headers.get("set-cookie").split(";", 1)[0];
  const forbiddenBusinessSearch = await request("/business-access/users", { cookie: personalCookie });
  assert.equal(forbiddenBusinessSearch.status, 403);

  const peopleResponse = await request("/business-access/users?search=alisa", { cookie: businessCookie });
  assert.equal(peopleResponse.status, 200);
  const people = (await peopleResponse.json()).people;
  assert.equal(people.length, 1);
  assert.equal(people[0].username, "alisa");

  const createRequest = await request("/business-access/requests", {
    method: "POST",
    cookie: businessCookie,
    body: {
      ownerId: people[0].id,
      sphere: "identity",
      section: "values",
      message: "Нужен доступ для консультации",
    },
  });
  assert.equal(createRequest.status, 201);
  const accessRequest = (await createRequest.json()).request;
  assert.equal(accessRequest.status, "pending");

  const noShareYet = await request("/sphere-shares/incoming", { cookie: businessCookie });
  assert.deepEqual((await noShareYet.json()).shares, []);

  const ownerContext = await request("/sphere-shares/context?sphere=identity&section=values", { cookie: ownerCookie });
  assert.equal(ownerContext.status, 200);
  const ownerContextPayload = await ownerContext.json();
  assert.equal(ownerContextPayload.requests.length, 1);
  assert.equal(ownerContextPayload.requests[0].requester.accountType, "business");
  assert.equal(ownerContextPayload.requests[0].message, "Нужен доступ для консультации");

  const unrelatedCookie = await login("max@rollapp.test");
  const forbiddenApproval = await request(`/sphere-access-requests/${accessRequest.id}/respond`, {
    method: "POST",
    cookie: unrelatedCookie,
    body: { decision: "approved" },
  });
  assert.equal(forbiddenApproval.status, 403);

  const approval = await request(`/sphere-access-requests/${accessRequest.id}/respond`, {
    method: "POST",
    cookie: ownerCookie,
    body: { decision: "approved" },
  });
  assert.equal(approval.status, 200);
  assert.equal((await approval.json()).decision, "approved");

  const outgoing = await request("/business-access/requests", { cookie: businessCookie });
  assert.equal(outgoing.status, 200);
  assert.equal((await outgoing.json()).requests[0].status, "approved");
  const incoming = await request("/sphere-shares/incoming", { cookie: businessCookie });
  const incomingPayload = await incoming.json();
  assert.equal(incomingPayload.shares.length, 1);
  assert.equal(incomingPayload.shares[0].owner.username, "alisa");

  const readable = await request("/identity/content/values?owner=alisa", { cookie: businessCookie });
  assert.equal(readable.status, 200);
  const writeForbidden = await request("/identity/content/values?owner=alisa", {
    method: "PATCH",
    cookie: businessCookie,
    body: { content: [] },
  });
  assert.equal(writeForbidden.status, 403);

  const revoke = await request("/sphere-shares", {
    method: "POST",
    cookie: ownerCookie,
    body: { viewerId: registrationPayload.user.id, sphere: "identity", section: "values", granted: false },
  });
  assert.equal(revoke.status, 200);
  const revokedRead = await request("/identity/content/values?owner=alisa", { cookie: businessCookie });
  assert.equal(revokedRead.status, 403);
});
