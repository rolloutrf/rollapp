import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import express from "express";
import { createTonReadinessCheck, registerTonConnectRoutes, tonConnectConfig, TON_CONNECT_BRIDGE_ORIGINS } from "./ton-connect.js";

test("TON manifest uses configured HTTPS origin and never request headers", () => {
  const config = tonConnectConfig({ PUBLIC_APP_URL: "http://localhost:5173", TELEGRAM_WEB_APP_URL: "https://роллапп.рф/app/rolls" });
  assert.equal(config.manifestUrl, "https://xn--80avakiab.xn--p1ai/tonconnect-manifest.json");
  assert.equal(config.manifest.iconUrl, "https://xn--80avakiab.xn--p1ai/favicon.png");
  assert.equal(tonConnectConfig({ PUBLIC_APP_URL: "http://localhost:5173" }), null);
  assert.equal(tonConnectConfig({ TON_CONNECT_PUBLIC_URL: "https://user:password@example.com", PUBLIC_APP_URL: "https://example.com" }), null);
  assert.equal(tonConnectConfig({ TON_CONNECT_PUBLIC_URL: "https://localhost" }), null);
  assert.equal(tonConnectConfig({ TON_CONNECT_PUBLIC_URL: "invalid", PUBLIC_APP_URL: "https://example.com" }), null);
});

test("every advertised bridge is HTTPS and allowed by production CSP", async () => {
  const wallets = JSON.parse(await readFile(new URL("../public/tonconnect-wallets.json", import.meta.url), "utf8"));
  assert.deepEqual(new Set(wallets.map((wallet) => wallet.app_name)), new Set(["tonkeeper", "mytonwallet", "telegram-wallet"]));
  const origins = new Set(wallets.flatMap((wallet) => wallet.bridge.filter((bridge) => bridge.type === "sse").map((bridge) => new URL(bridge.url).origin)));
  assert.deepEqual(origins, new Set(TON_CONNECT_BRIDGE_ORIGINS));
  for (const origin of origins) assert.equal(new URL(origin).protocol, "https:");
});

test("manifest is public JSON with CORS; missing configuration fails explicitly", async (t) => {
  const env = { PUBLIC_APP_URL: "https://example.com" };
  const app = express();
  let unavailable = null;
  registerTonConnectRoutes(app, { env, checkReadiness: async () => unavailable });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${origin}/tonconnect-manifest.json`, { headers: { Origin: "https://wallet.example", Host: "attacker.example" } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.equal((await response.json()).url, "https://example.com");
  assert.deepEqual(await (await fetch(`${origin}/api/ton-connect/config`)).json(), { manifestUrl: "https://example.com/tonconnect-manifest.json" });
  unavailable = { code: "TON_MANIFEST_NOT_READY", error: "Манифест не опубликован" };
  const blocked = await fetch(`${origin}/api/ton-connect/config`);
  assert.equal(blocked.status, 503);
  assert.equal((await blocked.json()).code, "TON_MANIFEST_NOT_READY");
  assert.equal((await fetch(`${origin}/tonconnect-manifest.json`)).status, 200, "Readiness must never gate the manifest itself");
  env.PUBLIC_APP_URL = "";
  assert.equal((await fetch(`${origin}/api/ton-connect/config`)).status, 503);
  assert.equal((await fetch(`${origin}/tonconnect-manifest.json`)).status, 503);
});

test("readiness rejects SPA HTML, missing CORS, wrong manifest and unavailable icon", async () => {
  const config = tonConnectConfig({ PUBLIC_APP_URL: "https://example.com" });
  const headers = { "content-type": "application/json", "access-control-allow-origin": "*" };
  const scenarios = [
    () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } }),
    () => Response.json(config.manifest),
    () => Response.json({ ...config.manifest, url: "https://other.example" }, { headers }),
    (url) => url.endsWith(".png") ? new Response("missing", { status: 404 }) : Response.json(config.manifest, { headers }),
  ];
  for (const fetchImpl of scenarios) {
    const result = await createTonReadinessCheck({ fetchImpl })(config);
    assert.equal(result.code, "TON_MANIFEST_NOT_READY");
  }
});

test("readiness times out and allows retry after a cached outage", async () => {
  const config = tonConnectConfig({ PUBLIC_APP_URL: "https://example.com" });
  let clock = 0;
  let healthy = false;
  let requests = 0;
  const check = createTonReadinessCheck({ timeoutMs: 20, now: () => clock, fetchImpl: async (url, { signal }) => {
    requests += 1;
    if (!healthy) return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true }));
    if (url.endsWith(".png")) return new Response("png", { headers: { "content-type": "image/png" } });
    return Response.json(config.manifest, { headers: { "access-control-allow-origin": "*" } });
  } });
  const [first, concurrent] = await Promise.all([check(config), check(config)]);
  assert.equal(first.code, "TON_PUBLIC_UNAVAILABLE");
  assert.deepEqual(first, concurrent);
  assert.equal(requests, 1);
  healthy = true;
  assert.equal((await check(config)).code, "TON_PUBLIC_UNAVAILABLE");
  clock = 5_001;
  assert.equal(await check(config), null);
  assert.equal(requests, 3);
  assert.equal(await check(config), null);
  assert.equal(requests, 3);
});
