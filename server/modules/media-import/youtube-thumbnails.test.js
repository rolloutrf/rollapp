import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { registerYouTubeThumbnailRoutes } from "./youtube-thumbnails.js";

test("thumbnail route validates IDs, coalesces concurrent requests, and caches only successful images", async () => {
  const app = express();
  const calls = [];
  const body = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  registerYouTubeThumbnailRoutes(app, {
    async fetchImage(url, options) {
      calls.push(url);
      assert.deepEqual(options, { timeoutMs: 5000, maxBytes: 256_000, maxRedirects: 0 });
      if (url.includes("abcdefghijk")) throw new Error("CDN unavailable");
      await held;
      return { body, mimeType: "image/jpeg" };
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const request = (path) => fetch(`http://127.0.0.1:${server.address().port}/api/media/youtube-thumbnail/${path}`);
  try {
    const invalid = await request("localhost");
    assert.equal(invalid.status, 404);
    assert.deepEqual(calls, []);

    const requests = [request("dQw4w9WgXcQ"), request("dQw4w9WgXcQ")];
    release();
    for (const response of [...await Promise.all(requests), await request("dQw4w9WgXcQ")]) {
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/jpeg");
      assert.match(response.headers.get("cache-control"), /public, max-age=3600/);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), body);
    }
    assert.deepEqual(calls, ["https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"]);

    for (let attempt = 0; attempt < 2; attempt++) {
      const failure = await request("abcdefghijk");
      assert.equal(failure.status, 502);
      assert.equal(failure.headers.get("cache-control"), "no-store");
    }
    assert.equal(calls.length, 3);
  } finally {
    release();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
