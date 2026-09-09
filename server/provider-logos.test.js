import assert from "node:assert/strict";
import test from "node:test";
import { MetadataFetchError } from "./metadata-fetch.js";
import {
  createProviderLogoHandler,
  createProviderLogoLoader,
  providerLogoSourceUrl,
} from "./provider-logos.js";

function createResponse() {
  return {
    body: null,
    ended: false,
    headers: {},
    statusCode: 200,
    set(name, value) {
      if (typeof name === "object") Object.assign(this.headers, name);
      else this.headers[name] = value;
      return this;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    type(mimeType) {
      this.headers["Content-Type"] = mimeType;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

test("provider logo sources are a fixed allowlist", () => {
  assert.equal(
    providerLogoSourceUrl("GoPractice"),
    "https://www.google.com/s2/favicons?domain_url=https%3A%2F%2Fgopractice.ru&sz=128",
  );
  assert.equal(
    providerLogoSourceUrl("productstar"),
    "https://www.google.com/s2/favicons?domain_url=https%3A%2F%2Fproductstar.ru&sz=128",
  );
  assert.equal(providerLogoSourceUrl("https://attacker.example/tracker.png"), "");
  assert.equal(providerLogoSourceUrl("unknown-provider"), "");
});

test("provider logo loader never fetches unknown keys and caches valid images", async () => {
  const imageBody = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const requests = [];
  const load = createProviderLogoLoader({
    fetchImage: async (url, options) => {
      requests.push({ url, options });
      return { body: imageBody, mimeType: "image/png" };
    },
  });

  assert.equal(await load("https://attacker.example/tracker.png"), null);
  const first = await load("gopractice");
  const second = await load("GoPractice");

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, providerLogoSourceUrl("gopractice"));
  assert.deepEqual(requests[0].options, { timeoutMs: 7_000, maxBytes: 256_000, maxRedirects: 2 });
  assert.equal(first, second);
  assert.equal(first.body, imageBody);
  assert.equal(first.mimeType, "image/png");
  assert.match(first.etag, /^"[A-Za-z0-9_-]{32}"$/u);
});

test("provider logo loader coalesces simultaneous requests and briefly caches failures", async () => {
  const imageBody = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  let requests = 0;
  let now = 1_000;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const load = createProviderLogoLoader({
    failureTtlMs: 1_000,
    now: () => now,
    fetchImage: async () => {
      requests += 1;
      if (requests === 1) {
        await pending;
        throw new MetadataFetchError("temporary failure");
      }
      return { body: imageBody, mimeType: "image/jpeg" };
    },
  });

  const first = load("productstar");
  const simultaneous = load("productstar");
  release();
  await assert.rejects(first, MetadataFetchError);
  await assert.rejects(simultaneous, MetadataFetchError);
  assert.equal(requests, 1);

  await assert.rejects(load("productstar"), MetadataFetchError);
  assert.equal(requests, 1);

  now += 1_001;
  const retried = await load("productstar");
  assert.equal(requests, 2);
  assert.equal(retried.mimeType, "image/jpeg");
});

test("provider logo handler returns cacheable image and honors ETag", async () => {
  const image = {
    body: Buffer.from([0x52, 0x49, 0x46, 0x46]),
    mimeType: "image/webp",
    etag: '"provider-logo"',
  };
  const handler = createProviderLogoHandler({ loader: async () => image });
  const response = createResponse();
  await handler({ params: { providerKey: "gopractice" }, get: () => "" }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, image.body);
  assert.equal(response.headers["Content-Type"], "image/webp");
  assert.equal(response.headers["Content-Length"], String(image.body.length));
  assert.equal(response.headers.ETag, image.etag);
  assert.equal(response.headers["X-Content-Type-Options"], "nosniff");
  assert.match(response.headers["Cache-Control"], /max-age=86400/u);

  const notModified = createResponse();
  await handler(
    { params: { providerKey: "gopractice" }, get: (name) => name === "if-none-match" ? image.etag : "" },
    notModified,
  );
  assert.equal(notModified.statusCode, 304);
  assert.equal(notModified.body, null);
  assert.equal(notModified.headers.ETag, image.etag);
  assert.equal(notModified.headers["Content-Length"], undefined);
});

test("provider logo handler hides unavailable upstreams and rejects unknown keys", async () => {
  const missing = createResponse();
  await createProviderLogoHandler({ loader: async () => null })(
    { params: { providerKey: "unknown" }, get: () => "" },
    missing,
  );
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.ended, true);

  const unavailable = createResponse();
  await createProviderLogoHandler({
    loader: async () => { throw new MetadataFetchError("private upstream detail"); },
  })({ params: { providerKey: "gopractice" }, get: () => "" }, unavailable);
  assert.equal(unavailable.statusCode, 502);
  assert.equal(unavailable.headers["Cache-Control"], "no-store");
  assert.equal(unavailable.ended, true);
});
