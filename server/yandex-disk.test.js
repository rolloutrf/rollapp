import assert from "node:assert/strict";
import test from "node:test";
import { writeDiskNote } from "./yandex-disk-notes-routes.js";
import { createYandexAuthorization } from "./yandex-auth.js";
import { createYandexDiskClient, getYandexDiskConfig, NOTE_MAX_BYTES } from "./yandex-disk.js";

const transfer = (method, href = "https://downloader.disk.yandex.ru/fixture") =>
  Response.json({ href, method, templated: false });

test("Disk OAuth requires its own callback, least-privilege scope and account confirmation", () => {
  const env = {
    NODE_ENV: "production", YANDEX_DISK_OAUTH_CLIENT_ID: "disk-client",
    YANDEX_DISK_OAUTH_CLIENT_SECRET: "disk-secret", USER_CREDENTIALS_SECRET: "a".repeat(32),
    YANDEX_DISK_OAUTH_REDIRECT_URI: "https://example.com/api/private-notes/connection/callback",
  };
  const config = getYandexDiskConfig(env);
  const url = new URL(createYandexAuthorization(config).authorizationUrl);
  assert.equal(url.searchParams.get("scope"), "cloud_api:disk.app_folder");
  assert.equal(url.searchParams.get("optional_scope"), null);
  assert.equal(url.searchParams.get("force_confirm"), "yes");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(getYandexDiskConfig({ ...env, USER_CREDENTIALS_SECRET: "" }).enabled, false);
  assert.equal(getYandexDiskConfig({ ...env, YANDEX_DISK_OAUTH_REDIRECT_URI: "https://example.com/api/auth/yandex/callback" }).enabled, false);
});

test("a note is written create-only and acknowledged after an exact read-back without forwarding the token", async () => {
  const markdown = "\ufeff# Запись\n\nТекст с пробелом.  \n";
  const path = "app:/rollapp-notes-fixture/note.md";
  const responses = [
    transfer("PUT", "https://uploader.disk.yandex.net/fixture"),
    new Response(null, { status: 202 }),
    new Response(null, { status: 404 }),
    transfer("GET"),
    new Response(markdown),
  ];
  const calls = [];
  const disk = createYandexDiskClient({}, { fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return responses.shift();
  } });
  await disk.write("access-token", path, markdown);
  assert.equal(calls.length, 5);
  assert.equal(calls[0].url.searchParams.get("path"), path);
  assert.equal(calls[0].url.searchParams.get("overwrite"), "false");
  assert.equal(calls[0].options.headers.Authorization, "OAuth access-token");
  assert.equal(calls[1].options.method, "PUT");
  assert.equal(calls[1].options.body.toString(), markdown);
  assert.equal(calls[1].options.headers.Authorization, undefined);
  assert.equal(calls[4].options.headers, undefined);
  assert(calls.every(({ options }) => options.redirect === "error"));
});

test("unverified writes, missing files, hostile transfer destinations and oversize downloads fail closed", async () => {
  const run = (responses) => createYandexDiskClient({}, { fetchImpl: async () => {
    assert(responses.length, "unexpected provider request");
    return responses.shift();
  } });
  const path = "app:/note.md";
  await assert.rejects(run([transfer("GET", "https://downloader.disk.yandex.ru.example.com/file")]).read("token", path),
    { code: "DISK_UNAVAILABLE" });
  await assert.rejects(run([transfer("GET"), new Response("x".repeat(NOTE_MAX_BYTES + 1))]).read("token", path),
    { code: "DISK_UNAVAILABLE" });
  await assert.rejects(run([new Response(null, { status: 404 })]).read("token", path),
    { code: "DISK_NOTES_MISSING" });
  await assert.rejects(run([transfer("PUT"), new Response(null, { status: 201 }), transfer("GET"), new Response("old")]).write("token", path, "new"),
    { code: "DISK_UNAVAILABLE" });
  await assert.rejects(run([new Response(null, { status: 507 })]).write("token", path, "new"),
    { code: "DISK_FULL" });
});

test("a stale revision cannot write, including after a committed save loses its response", async () => {
  const row = { folder_id: "fixture", revision: "prior" };
  let content = "Первоначальный текст";
  let writes = 0;
  const disk = {
    read: async () => content,
    write: async (_token, path, markdown) => {
      assert.match(path, /^app:\/rollapp-notes-fixture\/\d{17}-[a-f0-9-]{36}\.md$/);
      writes += 1;
      content = markdown;
    },
  };
  const initial = await writeDiskNote(disk, "token", row, { markdown: content });
  const saved = await writeDiskNote(disk, "token", row, {
    revision: initial.note.revision, markdown: "Обновлённый текст",
  });
  const next = { ...row, revision: saved.head };
  await assert.rejects(writeDiskNote(disk, "token", next, {
    revision: initial.note.revision, markdown: "Правка со второго устройства",
  }), { code: "DISK_NOTE_CONFLICT" });
  assert.deepEqual(await writeDiskNote(disk, "token", next, {
    revision: initial.note.revision, markdown: "Обновлённый текст",
  }), saved);
  assert.equal(writes, 1);
});
