import assert from "node:assert/strict";
import test from "node:test";
import { createDiskProfileStorage, editableProfile, readDiskProfile } from "./yandex-disk-profile.js";

const folderId = "11111111-1111-4111-8111-111111111111";

function fixture() {
  let user = {
    id: "owner", username: "profile", name: "Имя", bio: "Описание", birthday: new Date(2000, 4, 3),
    avatar_url: "/api/media/fixture", wishlist_links: { ozon: "https://ozon.ru/my/favorites" },
    email: "private@example.invalid", password_hash: "excluded", disk_profile_head: null,
  };
  const files = new Map();
  const calls = [];
  let pendingCommit = Promise.resolve();
  const environment = {
    ROLLAPP_YANDEX_DISK_PROFILE_ENABLED: "true", NODE_ENV: "production", USER_CREDENTIALS_SECRET: "a".repeat(32),
    YANDEX_DISK_OAUTH_CLIENT_ID: "disk-client", YANDEX_DISK_OAUTH_CLIENT_SECRET: "disk-secret",
    YANDEX_DISK_OAUTH_REDIRECT_URI: "https://example.com/api/private-notes/connection/callback",
  };
  const connection = {
    token: "token", row: { folder_id: folderId },
    disk: {
      async read(token, path, options) {
        assert.equal(token, "token");
        if (!files.has(path)) throw options.missing();
        return files.get(path);
      },
      async write(token, path, text, options) {
        assert.equal(token, "token");
        assert.equal(options.contentType, "application/json; charset=utf-8");
        assert.equal(files.has(path), false);
        files.set(path, text);
        calls.push("verified-upload");
      },
    },
  };
  const query = async (_sql, [id]) => {
    assert.equal(id, user.id);
    return { rows: [user], rowCount: 1 };
  };
  const storage = createDiskProfileStorage({
    query, environment, transaction: (work) => work({ query }),
    authorize: async (_client, id, config) => {
      assert.equal(id, user.id);
      assert.equal(config.clientId, "disk-client");
      return connection;
    },
    updateProfile(id, patch, prepare) {
      const commit = pendingCommit.then(async () => {
        assert.equal(id, user.id);
        if (!prepare) {
          calls.push("database-only");
          user = { ...user, ...patch };
        } else {
          const { next, nextHead } = await prepare({ query });
          calls.push("commit");
          user = { ...user, ...next, disk_profile_head: nextHead };
        }
        return user;
      });
      pendingCommit = commit.catch(() => {});
      return commit;
    },
  });
  return { storage, connection, calls, files, current: () => user, environment };
}

test("profile opt-in copies only editable fields and commits after a verified upload", async () => {
  const { storage, current, files, calls } = fixture();
  await storage.save(current(), { bio: "До подключения" });
  assert.equal(files.size, 0);
  const first = await storage.save(current(), {}, { activate: true });
  assert.deepEqual(calls, ["database-only", "verified-upload", "commit"]);
  assert.deepEqual(await storage.state(first), { enabled: true, connected: true, active: true });
  const record = JSON.parse([...files.values()][0]);
  assert.deepEqual(record, { format: "rollapp-profile", version: 1, ownerId: "owner", profile: editableProfile(first) });
  const saved = await storage.save(first, { birthday: null, wishlistLinks: { ozon: null } });
  assert.equal(saved.birthday, null);
  assert.deepEqual(saved.wishlist_links, {});
  assert.deepEqual(await storage.read(saved), saved);
  await assert.rejects(storage.read({ ...saved, bio: "new SQL-only write" }), { code: "DISK_PROFILE_PROJECTION_CONFLICT" });
  await storage.save(saved, { birthday: null, wishlistLinks: { ozon: null } });
  assert.equal(files.size, 2);
});

test("a failed upload or a concurrent write cannot replace the current head", async () => {
  const { storage, current, connection, calls } = fixture();
  const initial = await storage.save(current(), {}, { activate: true });
  const write = connection.disk.write;
  connection.disk.write = async () => { throw new Error("upload failed"); };
  await assert.rejects(storage.save(initial, { name: "Не сохранено" }), /upload failed/);
  assert.equal(current().disk_profile_head, initial.disk_profile_head);
  connection.disk.write = write;
  const results = await Promise.allSettled([
    storage.save(initial, { name: "Первый" }),
    storage.save(initial, { name: "Второй" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.code, "DISK_PROFILE_CONFLICT");
  assert.equal(calls.filter((call) => call === "commit").length, 2);
  assert.equal((await storage.read(current())).name, current().name);
});

test("wrong account, altered files and missing files fail closed", async () => {
  const { storage, current, files, connection, environment } = fixture();
  const active = await storage.save(current(), {}, { activate: true });
  const [path] = files.keys();
  await assert.rejects(readDiskProfile(connection, "outsider", active.disk_profile_head), { code: "DISK_PROFILE_UNAVAILABLE" });
  files.set(path, files.get(path).replace("Имя", "Подмена"));
  await assert.rejects(storage.read(active), { code: "DISK_PROFILE_UNAVAILABLE" });
  files.delete(path);
  await assert.rejects(storage.read(active), { code: "DISK_PROFILE_MISSING" });
  environment.ROLLAPP_YANDEX_DISK_PROFILE_ENABLED = "false";
  await assert.rejects(storage.save(active, { name: "Другая попытка" }), { code: "DISK_PROFILE_MISSING" });
});
