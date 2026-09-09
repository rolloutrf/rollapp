import assert from "node:assert/strict";
import test from "node:test";
import {
  courseLogoCandidatesFromHtml,
  createCourseLogoHandler,
  createCourseLogoLoader,
  createCourseLogoResolver,
} from "./course-logo-resolver.js";
import { MetadataFetchError } from "./metadata-fetch.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

function createResponse() {
  return {
    body: null,
    ended: false,
    headers: {},
    jsonBody: null,
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
    json(body) {
      this.jsonBody = body;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

test("extracts relative icons and Open Graph fallbacks in quality order", () => {
  const html = `
    <base href="/static/brand/">
    <link href="favicon-32.png?a=1&amp;b=2" sizes="32x32" rel="shortcut ICON">
    <link rel="icon" sizes="128x128" href="//cdn.example.com/logo-128.png">
    <link sizes="180x180" href="../touch.png" rel="apple-touch-icon">
    <meta content="../social.jpg" property="og:image">
    <meta property="og:image:secure_url" content="https://cdn.example.com/social-secure.jpg">
  `;

  assert.deepEqual(courseLogoCandidatesFromHtml(html, "https://academy.example.com/course/intro"), [
    "https://academy.example.com/static/touch.png",
    "https://cdn.example.com/logo-128.png",
    "https://academy.example.com/static/brand/favicon-32.png?a=1&b=2",
    "https://cdn.example.com/social-secure.jpg",
    "https://academy.example.com/static/social.jpg",
  ]);
});

test("supports unquoted attributes, precomposed touch icons, and og:image:url", () => {
  const html = `
    <link rel=apple-touch-icon-precomposed href=/touch.webp>
    <meta property=og:image:url content=preview.jpg>
  `;
  assert.deepEqual(courseLogoCandidatesFromHtml(html, "https://school.example/path/course"), [
    "https://school.example/touch.webp",
    "https://school.example/path/preview.jpg",
  ]);
});

test("deduplicates candidates and ignores inactive or unsafe markup", () => {
  const html = `
    <!-- <link rel="icon" href="https://tracker.example/comment.png"> -->
    <script>const fake = '<link rel="icon" href="https://tracker.example/script.png">';</script>
    <style>.x { background: url('<link rel="icon" href="https://tracker.example/style.png">') }</style>
    <template><link rel="icon" href="https://tracker.example/template.png"></template>
    <link rel="icon" href="data:image/png;base64,AAAA">
    <link rel="icon" href="javascript:alert(1)">
    <link rel="icon" href="ftp://files.example/logo.png">
    <link rel="icon" href="https://user:secret@school.example/logo.png">
    <link rel="icon" href="https://school.example:8443/logo.png">
    <link rel="icon" href="#favicon">
    <link rel="apple-touch-icon" href="/logo.png">
    <link rel="icon" href="/logo.png">
  `;
  assert.deepEqual(courseLogoCandidatesFromHtml(html, "https://school.example/course"), [
    "https://school.example/logo.png",
  ]);
});

test("uses the final page URL and passes bounded fetch options", async () => {
  const calls = [];
  const resolve = createCourseLogoResolver({
    fetchHtml: async (url, options) => {
      calls.push({ kind: "html", url, options });
      return {
        html: '<link rel="icon" href="../assets/logo.png">',
        url: new URL("https://redirected.example/courses/product/"),
      };
    },
    fetchImage: async (url, options) => {
      calls.push({ kind: "image", url, options });
      return { body: PNG, mimeType: "image/png" };
    },
  });

  const result = await resolve("https://short.example/course");
  assert.deepEqual(result, { body: PNG, mimeType: "image/png" });
  assert.deepEqual(calls, [
    {
      kind: "html",
      url: "https://short.example/course",
      options: { timeoutMs: 10_000, maxBytes: 512_000, maxRedirects: 3 },
    },
    {
      kind: "image",
      url: "https://redirected.example/courses/assets/logo.png",
      options: { timeoutMs: 10_000, maxBytes: 2_000_000, maxRedirects: 3 },
    },
  ]);
});

test("falls back when a preferred candidate fails or has an invalid payload", async () => {
  const requested = [];
  const resolve = createCourseLogoResolver({
    fetchHtml: async () => ({
      html: `
        <link rel="apple-touch-icon" href="/touch.svg">
        <link rel="icon" href="/broken.png">
        <meta property="og:image" content="/working.jpg">
      `,
      url: "https://school.example/course",
    }),
    fetchImage: async (url) => {
      requested.push(url);
      if (url.endsWith("touch.svg")) return { body: Buffer.from("<svg/>"), mimeType: "image/svg+xml" };
      if (url.endsWith("broken.png")) throw new MetadataFetchError("broken image");
      return { body: JPEG, mimeType: "image/jpeg" };
    },
  });

  assert.deepEqual(await resolve("https://school.example/course"), { body: JPEG, mimeType: "image/jpeg" });
  assert.deepEqual(requested, [
    "https://school.example/touch.svg",
    "https://school.example/broken.png",
    "https://school.example/working.jpg",
  ]);
});

test("reports a stable not-found error without issuing an image request", async () => {
  let imageRequests = 0;
  const resolve = createCourseLogoResolver({
    fetchHtml: async () => ({ html: "<title>Course</title>", url: "https://school.example/course" }),
    fetchImage: async () => { imageRequests += 1; },
  });

  await assert.rejects(resolve("https://school.example/course"), (error) => {
    assert.equal(error instanceof MetadataFetchError, true);
    assert.equal(error.code, "course_logo_unavailable");
    assert.equal(error.status, 404);
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.equal(imageRequests, 0);
});

test("preserves the last safe image error as the unavailable error cause", async () => {
  const finalFailure = new MetadataFetchError("image unavailable", { code: "upstream_status" });
  const resolve = createCourseLogoResolver({
    fetchHtml: async () => ({
      html: '<link rel="icon" href="/favicon.png">',
      url: "https://school.example/course",
    }),
    fetchImage: async () => { throw finalFailure; },
  });

  await assert.rejects(resolve("https://school.example/course"), (error) => {
    assert.equal(error.code, "course_logo_unavailable");
    assert.equal(error.cause, finalFailure);
    return true;
  });
});

test("limits failed candidate downloads and does not hide programming errors", async () => {
  const html = Array.from({ length: 10 }, (_, index) => (
    `<link rel="icon" href="/logo-${index}.png">`
  )).join("");
  let requests = 0;
  const limitedResolve = createCourseLogoResolver({
    maxCandidates: 3,
    fetchHtml: async () => ({ html, url: "https://school.example/course" }),
    fetchImage: async () => {
      requests += 1;
      throw new MetadataFetchError("missing");
    },
  });
  await assert.rejects(limitedResolve("https://school.example/course"), { code: "course_logo_unavailable" });
  assert.equal(requests, 3);

  const programmingError = new TypeError("resolver integration bug");
  const strictResolve = createCourseLogoResolver({
    fetchHtml: async () => ({ html: '<link rel="icon" href="/logo.png">', url: "https://school.example/course" }),
    fetchImage: async () => { throw programmingError; },
  });
  await assert.rejects(strictResolve("https://school.example/course"), (error) => error === programmingError);
});

test("keeps metadata fetch security errors from the page request intact", async () => {
  const unsafe = new MetadataFetchError("Локальные адреса не поддерживаются", {
    status: 400,
    code: "unsafe_address",
  });
  const resolve = createCourseLogoResolver({
    fetchHtml: async () => { throw unsafe; },
    fetchImage: async () => assert.fail("image fetch must not run"),
  });

  await assert.rejects(resolve("http://127.0.0.1/course"), (error) => error === unsafe);
});

test("loader coalesces equivalent URLs and caches a validated logo with ETag", async () => {
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const load = createCourseLogoLoader({
    resolver: async () => {
      calls += 1;
      await pending;
      return { body: PNG, mimeType: "image/png" };
    },
  });

  const first = load("https://school.example/course#overview");
  const simultaneous = load("https://school.example/course");
  release();
  const [firstLogo, simultaneousLogo] = await Promise.all([first, simultaneous]);
  const cached = await load("https://school.example/course#other-section");

  assert.equal(calls, 1);
  assert.equal(firstLogo, simultaneousLogo);
  assert.equal(firstLogo, cached);
  assert.equal(firstLogo.body, PNG);
  assert.equal(firstLogo.mimeType, "image/png");
  assert.match(firstLogo.etag, /^"[A-Za-z0-9_-]{32}"$/u);
});

test("loader briefly caches expected failures and retries after expiry", async () => {
  let calls = 0;
  let currentTime = 10_000;
  const unavailable = new MetadataFetchError("not found", { status: 404, code: "course_logo_unavailable" });
  const load = createCourseLogoLoader({
    failureTtlMs: 1_000,
    now: () => currentTime,
    resolver: async () => {
      calls += 1;
      if (calls === 1) throw unavailable;
      return { body: JPEG, mimeType: "image/jpeg" };
    },
  });

  await assert.rejects(load("https://school.example/course"), (error) => error === unavailable);
  await assert.rejects(load("https://school.example/course"), (error) => error === unavailable);
  assert.equal(calls, 1);

  currentTime += 1_001;
  const retried = await load("https://school.example/course");
  assert.equal(calls, 2);
  assert.equal(retried.mimeType, "image/jpeg");
});

test("loader bounds its success cache and does not cache unexpected errors", async () => {
  const calls = new Map();
  const load = createCourseLogoLoader({
    maxEntries: 2,
    resolver: async (url) => {
      calls.set(url, (calls.get(url) || 0) + 1);
      if (url.includes("bug")) throw new TypeError("integration bug");
      return { body: Buffer.concat([PNG, Buffer.from(url)]), mimeType: "image/png" };
    },
  });

  await load("https://school.example/one");
  await load("https://school.example/two");
  await load("https://school.example/one");
  await load("https://school.example/three");
  await load("https://school.example/two");
  assert.equal(calls.get("https://school.example/one"), 1);
  assert.equal(calls.get("https://school.example/two"), 2);

  await assert.rejects(load("https://school.example/bug"), TypeError);
  await assert.rejects(load("https://school.example/bug"), TypeError);
  assert.equal(calls.get("https://school.example/bug"), 2);
});

test("Express handler serves a private cacheable image and honors weak or multiple ETags", async () => {
  const logo = { body: PNG, mimeType: "image/png", etag: '"course-logo"' };
  const calls = [];
  const handler = createCourseLogoHandler({
    loader: async (url) => {
      calls.push(url);
      return logo;
    },
  });
  const response = createResponse();
  await handler({ query: { url: " https://school.example/course " }, get: () => "" }, response);

  assert.deepEqual(calls, ["https://school.example/course"]);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, PNG);
  assert.equal(response.headers["Content-Type"], "image/png");
  assert.equal(response.headers["Content-Length"], String(PNG.length));
  assert.equal(response.headers.ETag, logo.etag);
  assert.equal(response.headers["X-Content-Type-Options"], "nosniff");
  assert.match(response.headers["Cache-Control"], /^private,/u);

  const notModified = createResponse();
  await handler({
    query: { url: "https://school.example/course" },
    get: () => '"unrelated", W/"course-logo"',
  }, notModified);
  assert.equal(notModified.statusCode, 304);
  assert.equal(notModified.ended, true);
  assert.equal(notModified.body, null);
  assert.equal(notModified.headers["Content-Length"], undefined);
});

test("Express handler validates its query and maps safe resolver failures", async () => {
  let calls = 0;
  const handler = createCourseLogoHandler({
    loader: async () => {
      calls += 1;
      throw new MetadataFetchError("Локальные адреса не поддерживаются", {
        status: 400,
        code: "unsafe_address",
      });
    },
  });

  for (const query of [{}, { url: ["https://one.example", "https://two.example"] }, { url: "x".repeat(2_001) }]) {
    const response = createResponse();
    await handler({ query, get: () => "" }, response);
    assert.equal(response.statusCode, 400);
    assert.equal(response.headers["Cache-Control"], "private, no-store");
    assert.equal(response.jsonBody.code, "course_logo_url_required");
  }
  assert.equal(calls, 0);

  const unsafeResponse = createResponse();
  await handler({ query: { url: "http://127.0.0.1/course" }, get: () => "" }, unsafeResponse);
  assert.equal(unsafeResponse.statusCode, 400);
  assert.equal(unsafeResponse.headers["Cache-Control"], "private, no-store");
  assert.deepEqual(unsafeResponse.jsonBody, {
    error: "Локальные адреса не поддерживаются",
    code: "unsafe_address",
  });
});

test("Express handler does not hide unexpected loader failures", async () => {
  const programmingError = new TypeError("loader integration bug");
  const handler = createCourseLogoHandler({ loader: async () => { throw programmingError; } });
  await assert.rejects(
    handler({ query: { url: "https://school.example/course" }, get: () => "" }, createResponse()),
    (error) => error === programmingError,
  );
});
