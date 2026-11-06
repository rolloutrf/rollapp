import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createProductSuggestions, normalizeProductQuery, productSuggestionsFrom, registerProductSuggestionRoutes } from "./product-suggestions.js";

const claim = (id, rank = "normal") => ({ rank, mainsnak: { datavalue: { value: { id } } } });
const response = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });
const candidate = { id: "Q123", label: "Example Phone", description: "A product" };
const entities = { Q123: { claims: { P176: [claim("Q312")] } } };

test("queries are bounded, normalized and reject controls/non-text", () => {
  for (const value of [null, {}, [], "ab", " ", "a".repeat(161), "abc\n"]) assert.equal(normalizeProductQuery(value), null);
  assert.equal(normalizeProductQuery("  iPhone   16 "), "iPhone 16");
  assert.equal(normalizeProductQuery("чайник"), "чайник");
});

test("product evidence excludes people, missing entities, deprecated statements and duplicates", () => {
  const search = [candidate, { id: "Q124", label: "example phone" }, { id: "Q125", label: "Person" },
    { id: "Q126", label: "Missing" }, { id: "Q127", label: "Old claim" }, { id: "Q128", label: "Shoe" }, { id: "Q129", label: "Brand" }];
  const result = productSuggestionsFrom(search, { ...entities,
    Q124: entities.Q123, Q125: { claims: { P31: [claim("Q5")], P176: [claim("Q312")] } },
    Q126: { missing: "" }, Q127: { claims: { P176: [claim("Q312", "deprecated")] } },
    Q128: { claims: { P31: [claim("Q33612712")] } }, Q129: { claims: {} },
  });
  assert.deepEqual(result.map((item) => item.id), ["Q123", "Q128"]);
});

test("two fixed-host reads, bounded cache and expiry; search does not expose arbitrary external URLs", async () => {
  let time = 1_000_000;
  const calls = [];
  const service = createProductSuggestions({ now: () => time, fetchImpl: async (url, options) => {
    assert.equal(url.origin + url.pathname, "https://www.wikidata.org/w/api.php");
    assert.equal(options.redirect, "error"); assert(options.signal);
    calls.push(url);
    return response(url.searchParams.get("action") === "wbsearchentities" ? { search: [candidate] } : { entities });
  } });
  assert.equal((await service.search("phone")).length, 1);
  assert.equal((await service.search(" PHONE ")).length, 1);
  assert.equal(calls.length, 2);
  time += 300_001;
  await service.search("phone"); assert.equal(calls.length, 4);
  await service.search("ab"); assert.equal(calls.length, 4);
});

test("identical requests coalesce; other searches fail busy instead of accumulating keystrokes", async () => {
  let release;
  let calls = 0;
  const service = createProductSuggestions({ fetchImpl: async () => {
    calls += 1;
    await new Promise((resolve) => { release = resolve; });
    return response({ search: [] });
  } });
  const first = service.search("phone");
  const same = service.search("PHONE");
  await assert.rejects(service.search("computer"), { status: 429 });
  release();
  assert.deepEqual(await first, []); assert.deepEqual(await same, []); assert.equal(calls, 1);
});

test("upstream rate limiting honors cooldown; network/schema/size errors remain visible and are not cached", async () => {
  let time = 1_000_000; let calls = 0;
  const service = createProductSuggestions({ now: () => time, fetchImpl: async () => {
    calls += 1; return calls === 1 ? response({}, 429, { "Retry-After": "120" }) : response({ search: [] });
  } });
  await assert.rejects(service.search("phone"), { status: 429, retryAfterSeconds: 120 });
  await assert.rejects(service.search("other"), { status: 429 }); assert.equal(calls, 1);
  time += 120_001; assert.deepEqual(await service.search("phone"), []);
  for (const fetchImpl of [async () => { throw new Error("private upstream detail"); }, async () => response({}), async () => response({ error: { code: "maxlag" } }), async () => new Response("x".repeat(2_000_001))]) {
    const failed = createProductSuggestions({ fetchImpl });
    await assert.rejects(failed.search("phone"), { status: 503 });
    await assert.rejects(failed.search("phone"), { status: 503 });
  }
});

test("global search budget applies across different queries", async () => {
  const service = createProductSuggestions({ fetchImpl: async () => response({ search: [] }) });
  for (let i = 0; i < 20; i++) await service.search(`model ${i}`);
  await assert.rejects(service.search("new model"), { status: 429 });
  assert.deepEqual(await service.search("model 0"), []);
});

test("endpoint requires authentication and valid query; read-only result has no-store", async (t) => {
  const app = express(); app.use(express.json());
  let calls = 0;
  registerProductSuggestionRoutes(app, {
    requireAuth: (req, res, next) => req.get("authorization") === "test" ? (req.user = { id: "test-user" }, next()) : res.sendStatus(401),
    service: { search: async () => { calls += 1; return []; } },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/api/catalog/product-suggestions`;
  const send = (query, authorization = "test") => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", authorization }, body: JSON.stringify({ query }) });
  assert.equal((await send("phone", "")).status, 401);
  assert.equal((await send("ab")).status, 400); assert.equal(calls, 0);
  const ok = await send("phone"); assert.equal(ok.status, 200); assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.deepEqual(await ok.json(), { items: [], source: "Wikidata" }); assert.equal(calls, 1);
});
