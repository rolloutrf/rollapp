import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

const port = 19_500 + (process.pid % 400);
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

async function login(baseUrl, email) {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234" }),
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";", 1)[0];
}

test("private sphere APIs are owner-only while the wishlist profile stays public", async (t) => {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", DEMO_MODE: "true", DEFAULT_FRIEND_USERNAME: "alisa", DATABASE_URL: "", PGHOST: "", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  await waitForServer(child);

  const anonymous = await fetch(`${baseUrl}/contacts`);
  assert.equal(anonymous.status, 401);
  const anonymousHealth = await fetch(`${baseUrl}/health/lab-results`);
  assert.equal(anonymousHealth.status, 401);
  const publicWishlist = await fetch(`${baseUrl}/profile/alisa`);
  assert.equal(publicWishlist.status, 200);
  assert.ok((await publicWishlist.json()).wishes.length > 0);

  const ownerCookie = await login(baseUrl, "demo@rollapp.test");
  const visitorCookie = await login(baseUrl, "max@rollapp.test");
  const visitorContacts = await fetch(`${baseUrl}/contacts`, { headers: { Cookie: visitorCookie } });
  assert.equal(visitorContacts.status, 403);
  const visitorHealth = await fetch(`${baseUrl}/health/lab-results`, { headers: { Cookie: visitorCookie } });
  assert.equal(visitorHealth.status, 403);
  const visitorUpload = await fetch(`${baseUrl}/health/lab-results/uploads`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf", Cookie: visitorCookie },
    body: Buffer.from("%PDF-1.4"),
  });
  assert.equal(visitorUpload.status, 403);
  const visitorPdf = await fetch(`${baseUrl}/health/lab-results/uploads/00000000-0000-0000-0000-000000000000/pdf`, { headers: { Cookie: visitorCookie } });
  assert.equal(visitorPdf.status, 403);
  const ownerHealth = await fetch(`${baseUrl}/health/lab-results`, { headers: { Cookie: ownerCookie } });
  assert.equal(ownerHealth.status, 200);

  const search = await fetch(`${baseUrl}/contacts?search=${encodeURIComponent("Витя Лушин")}`, { headers: { Cookie: ownerCookie } });
  assert.equal(search.status, 200);
  const result = await search.json();
  assert.equal(result.total, 1);
  assert.equal(result.contacts[0].name, "Витя Лушин");
  assert.equal("notes" in result.contacts[0], false);

  const deniedDetail = await fetch(`${baseUrl}/contacts/${result.contacts[0].id}`, { headers: { Cookie: visitorCookie } });
  assert.equal(deniedDetail.status, 403);
  const deniedAvatar = await fetch(`${baseUrl}/contacts/${result.contacts[0].id}/avatar`, { headers: { Cookie: visitorCookie } });
  assert.equal(deniedAvatar.status, 403);
  const deniedEdit = await fetch(`${baseUrl}/contacts/${result.contacts[0].id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: visitorCookie },
    body: JSON.stringify({}),
  });
  assert.equal(deniedEdit.status, 403);
  const deniedCreate = await fetch(`${baseUrl}/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: visitorCookie },
    body: JSON.stringify({}),
  });
  assert.equal(deniedCreate.status, 403);

  const detail = await fetch(`${baseUrl}/contacts/${result.contacts[0].id}`, { headers: { Cookie: ownerCookie } });
  assert.equal(detail.status, 200);
  assert.match((await detail.json()).contact.notes, /нейронки/u);

  const facebookContact = await fetch(`${baseUrl}/contacts?search=${encodeURIComponent("Алёна Каширкина")}`, { headers: { Cookie: ownerCookie } });
  assert.equal(facebookContact.status, 200);
  assert.match((await facebookContact.json()).contacts[0].avatarUrl, /^\/api\/contacts\/[a-f0-9]+\/avatar$/u);

  const create = await fetch(`${baseUrl}/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({
      name: "Тестовый новый контакт",
      company: "Rollapp",
      role: "Партнёр",
      category: "Founder",
      status: "Познакомились",
      links: [{ label: "Telegram", url: "https://t.me/rollapp_contact" }],
      notes: "Добавлен через новый сценарий",
    }),
  });
  assert.equal(create.status, 201);
  const created = (await create.json()).contact;
  assert.match(created.id, /^[0-9a-f-]{36}$/u);
  assert.equal(created.favorite, false);

  const createdSearch = await fetch(`${baseUrl}/contacts?search=${encodeURIComponent("новый сценарий")}`, { headers: { Cookie: ownerCookie } });
  assert.equal(createdSearch.status, 200);
  const createdSearchResult = await createdSearch.json();
  assert.equal(createdSearchResult.total, 1);
  assert.equal(createdSearchResult.contacts[0].id, created.id);
  assert.equal("notes" in createdSearchResult.contacts[0], false);

  const favoriteCreated = await fetch(`${baseUrl}/contacts/${created.id}/favorite`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ favorite: true }),
  });
  assert.equal(favoriteCreated.status, 200);

  const updateCreated = await fetch(`${baseUrl}/contacts/${created.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({
      name: "Тестовый новый контакт — обновлён",
      company: "Rollapp",
      role: "Партнёр",
      category: "Founder",
      status: "В работе",
      links: [],
      notes: "Обновлён через карточку",
    }),
  });
  assert.equal(updateCreated.status, 200);
  const updated = (await updateCreated.json()).contact;
  assert.equal(updated.name, "Тестовый новый контакт — обновлён");
  assert.equal(updated.favorite, true);
});
