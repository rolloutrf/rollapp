import assert from "node:assert/strict";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { createYandexBackupJobs, uploadYandexBackup } from "./yandex-disk-backup.js";

const uploader = "https://uploader1.disk.yandex.net/upload?key=signed";
const token = "oauth-token";

test("saves a complete gzip snapshot under a unique root ROLLAPP path and keeps OAuth off the signed PUT", async () => {
  const sample = '{"id":"owner","name":"Пользователь"}';
  const attachment = '{"id":"image","image_data_base64":"AQL/"}';
  const requests = [];
  const filename = await uploadYandexBackup({
    accessToken: token, userId: "owner", now: new Date("2026-11-06T09:00:00Z"), minimumFreeBytes: 0,
    // Unit-only query stub. SQL/cursors are checked separately on production PostgreSQL.
    transaction: (read) => {
      let remaining = [];
      return read({
        async query(sql, params) {
          if (sql.startsWith("DECLARE")) {
            assert.deepEqual(params, ["owner"]);
            remaining = sql.includes("FROM users t") ? [sample] : sql.includes("FROM wish_images t") ? [attachment] : [];
          }
          return { rows: sql.startsWith("FETCH") ? remaining.splice(0).map((record) => ({ record })) : [] };
        },
      });
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (options.method === "PUT" && url.hostname === "cloud-api.yandex.net") {
        return new Response(null, { status: 409 }); // Another request just created it.
      }
      if (url.pathname.endsWith("/resources")) {
        return requests.length === 1 ? new Response(null, { status: 404 }) : Response.json({ type: "dir" });
      }
      if (url.pathname.endsWith("/resources/upload")) return Response.json({ href: uploader, method: "PUT" });
      assert.equal(url.href, uploader);
      const chunks = [];
      for await (const chunk of options.body) chunks.push(chunk);
      const archive = Buffer.concat(chunks);
      assert.equal(options.headers["Content-Length"], String(archive.length));
      const data = JSON.parse(gunzipSync(archive));
      assert.equal(data.version, 1);
      assert.deepEqual(data.tables.users, [JSON.parse(sample)]);
      assert.deepEqual(data.tables.wish_images, [JSON.parse(attachment)]);
      assert.deepEqual(data.tables.identity_report_uploads, []);
      for (const excluded of ["sessions", "user_ai_credentials", "password_reset_tokens", "yandex_oauth_attempts"]) {
        assert.equal(excluded in data.tables, false);
      }
      return new Response(null, { status: 201 });
    },
  });

  assert.match(filename, /^rollapp-2026-11-06T09-00-00\.000Z-[a-f0-9-]{36}\.json\.gz$/);
  assert.deepEqual(requests.map(({ options }) => options.method), ["GET", "PUT", "GET", "GET", "GET", "PUT"]);
  assert.equal(requests[0].url.searchParams.get("path"), "disk:/ROLLAPP");
  assert.equal(requests[1].url.searchParams.get("path"), "disk:/ROLLAPP");
  assert.equal(requests[4].url.searchParams.get("path"), `disk:/ROLLAPP/${filename}`);
  assert.equal(requests[4].url.searchParams.get("overwrite"), "false");
  assert.equal(requests[4].options.headers.Authorization, `OAuth ${token}`);
  assert.equal(requests[5].options.headers.Authorization, undefined);
  assert.ok(requests.every(({ options }) => options.redirect === "error"));
});

test("refused Disk access and shared or public folders do not read account data", async () => {
  for (const [firstStatus, metadata, expected] of [
    [403, null, "permission"],
    [200, { type: "dir", share: { rights: "rw", is_owned: true } }, "folder"],
    [200, { type: "dir", public_key: "published" }, "folder"],
    [200, { type: "file" }, "folder"],
  ]) {
    const backup = createYandexBackupJobs({
      upload: (options) => uploadYandexBackup({
        ...options,
        transaction: () => { assert.fail("Refused before opening the database snapshot"); },
        fetchImpl: async (_url, opts) => {
          assert.equal(opts.method, "GET");
          return Response.json(metadata, { status: firstStatus });
        },
      }),
      log: () => {},
    });
    const { id, task } = backup.start({ userId: "owner", accessToken: token });
    assert.equal(backup.get(id, "another-account"), null);
    await task;
    assert.deepEqual(backup.get(id, "owner"), { status: expected });
  }
});

test("jobs stay owned, coalesce duplicate requests, and limit concurrency", async () => {
  const releases = new Map();
  const jobs = createYandexBackupJobs({
    upload: ({ userId }) => new Promise((resolve) => releases.set(userId, resolve)),
  });
  const first = jobs.start({ userId: "first", accessToken: token });
  const second = jobs.start({ userId: "second", accessToken: token });
  assert.deepEqual(jobs.start({ userId: "first", accessToken: token }), { id: first.id });
  assert.deepEqual(jobs.start({ userId: "third", accessToken: token }), { busy: true });
  assert.equal(jobs.get(first.id, "second"), null);
  assert.deepEqual(jobs.get(first.id, "first"), { status: "pending" });
  await Promise.resolve();
  releases.get("first")("first.json.gz");
  releases.get("second")("second.json.gz");
  await Promise.all([first.task, second.task]);
  assert.deepEqual(jobs.get(first.id, "first"), { status: "complete", filename: "first.json.gz" });
});
