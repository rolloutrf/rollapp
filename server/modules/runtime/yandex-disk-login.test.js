import assert from "node:assert/strict";
import test from "node:test";
import { connectYandexDiskOnLogin } from "./yandex-disk-login.js";

const environment = { USER_CREDENTIALS_SECRET: "a".repeat(32) };
const config = { enabled: true, autoConnect: true, clientId: "rollapp-client" };
const tokens = { accessToken: "access-token", refreshToken: "refresh-token", expiresAt: Date.now() + 60_000 };

function fixture(existing) {
  const calls = [];
  const client = { query: async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.startsWith("SELECT id FROM users")) return { rowCount: 1, rows: [{ id: params[0] }] };
    if (sql.includes("FROM yandex_disk_notes")) return { rowCount: existing ? 1 : 0, rows: existing ? [existing] : [] };
    return { rowCount: 1, rows: [] };
  } };
  const diskCalls = [];
  const disk = {
    createFolder: async (...args) => diskCalls.push(["create", ...args]),
    checkFolder: async (...args) => diskCalls.push(["check", ...args]),
  };
  return { calls, client, disk, diskCalls };
}

test("Yandex login creates one app-folder connection and enables scheduled account copies", async () => {
  const { calls, client, disk, diskCalls } = fixture(null);
  const result = await connectYandexDiskOnLogin(client, {
    userId: "user-1", config, tokens, environment, disk,
  });
  assert.equal(result.created, true);
  assert.match(result.folderId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(diskCalls, [["create", "access-token", `app:/rollapp-notes-${result.folderId}`]]);
  assert(calls.some(({ sql, params }) => sql.startsWith("INSERT INTO yandex_disk_notes")
    && params[0] === "user-1" && params[1] === "rollapp-client" && !params[3].includes("refresh-token")));
  assert(calls.some(({ sql, params }) => sql.includes("INSERT INTO yandex_disk_sync")
    && params[0] === "user-1" && params[1] === "rollapp-client"));
});

test("repeated Yandex login keeps the folder and rotates only encrypted tokens", async () => {
  const existing = { folder_id: "0f459446-37e4-4807-8d66-d94da301f5dc", revision: null };
  const { calls, client, disk, diskCalls } = fixture(existing);
  const result = await connectYandexDiskOnLogin(client, {
    userId: "user-1", config, tokens, environment, disk,
  });
  assert.deepEqual(result, { folderId: existing.folder_id, created: false });
  assert.deepEqual(diskCalls, [["check", "access-token", `app:/rollapp-notes-${existing.folder_id}`]]);
  assert(calls.some(({ sql }) => sql.includes("ON CONFLICT (user_id,oauth_client_id) DO UPDATE")));
});

test("automatic Disk connection fails closed without refreshable credentials", async () => {
  const { client, disk } = fixture(null);
  await assert.rejects(connectYandexDiskOnLogin(client, {
    userId: "user-1", config, tokens: { accessToken: "access-token" }, environment, disk,
  }), { code: "DISK_UNAVAILABLE" });
});
