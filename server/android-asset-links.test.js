import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import express from "express";
import { registerAndroidAssetLinks } from "./android-asset-links.js";

test("Android association serves release-only JSON before the SPA fallback", async (context) => {
  const publicDirectory = new URL("../public/", import.meta.url);
  const expected = JSON.parse(await readFile(new URL(".well-known/assetlinks.json", publicDirectory), "utf8"));
  assert.ok(Array.isArray(expected));
  const androidBuild = await readFile(new URL("../android/app/build.gradle", import.meta.url), "utf8");
  const [, packageName] = androidBuild.match(/applicationId\s*=\s*"([^"]+)"/);
  for (const statement of expected) {
    assert.deepEqual(statement.relation, ["delegate_permission/common.handle_all_urls"]);
    assert.equal(statement.target.namespace, "android_app");
    assert.equal(statement.target.package_name, packageName);
    assert.ok(statement.target.sha256_cert_fingerprints.length > 0);
    for (const fingerprint of statement.target.sha256_cert_fingerprints) {
      assert.match(fingerprint, /^(?:[0-9a-f]{2}:){31}[0-9a-f]{2}$/i);
    }
  }

  const app = express();
  registerAndroidAssetLinks(app, fileURLToPath(publicDirectory));
  app.get("*splat", (_req, res) => res.send("<!doctype html>"));
  const server = app.listen(0, "127.0.0.1");
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  await once(server, "listening");

  const result = await fetch(`http://127.0.0.1:${server.address().port}/.well-known/assetlinks.json`, { redirect: "error" });
  assert.equal(result.status, 200);
  assert.match(result.headers.get("content-type"), /^application\/json\b/);
  assert.doesNotMatch(result.headers.get("cache-control"), /immutable/);
  assert.deepEqual(await result.json(), expected);
});
