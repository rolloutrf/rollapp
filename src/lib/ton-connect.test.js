import test from "node:test";
import assert from "node:assert/strict";
import { createTonStorage, loadTonConfig, walletConnectionSource } from "./ton-connect.js";

test("unpublished or unreachable configuration is surfaced before a wallet can launch", async () => {
  await assert.rejects(loadTonConfig({ fetchImpl: async () => Response.json({ error: "Манифест не опубликован" }, { status: 503 }) }), /Манифест не опубликован/);
  await assert.rejects(loadTonConfig({ fetchImpl: async () => { throw new Error("timeout"); } }), /Сервер не отвечает/);
  await assert.rejects(loadTonConfig({ fetchImpl: async () => new Response("<html>SPA</html>") }), /пока не настроено/);
  assert.deepEqual(await loadTonConfig({ fetchImpl: async () => Response.json({ manifestUrl: "https://example.com/tonconnect-manifest.json" }) }), { manifestUrl: "https://example.com/tonconnect-manifest.json" });
});

test("TON sessions persist per account and disconnect cannot delete another account's session", async () => {
  const entries = new Map();
  const browserStorage = { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key) };
  const first = createTonStorage("first", browserStorage);
  const second = createTonStorage("second", browserStorage);
  await first.setItem("connection", "first encrypted session");
  assert.equal(await second.getItem("connection"), null);
  await second.setItem("connection", "second encrypted session");
  assert.equal(await createTonStorage("first", browserStorage).getItem("connection"), "first encrypted session");
  await first.removeItem("connection");
  assert.equal(await first.getItem("connection"), null);
  assert.equal(await second.getItem("connection"), "second encrypted session");
  assert.throws(() => createTonStorage("", browserStorage));
});

test("storage failures are reported, never replaced with volatile sessions", async () => {
  const storage = createTonStorage("user", { setItem() { throw new Error("Storage denied"); } });
  await assert.rejects(storage.setItem("connection", "session"), /Storage denied/);
});

test("cancelled QR requests cannot restore on reload; confirmed sessions survive", async () => {
  const entries = new Map();
  const browserStorage = { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key) };
  const storage = createTonStorage("user", browserStorage);
  storage.beginConnection();
  await storage.setItem("connection", "pending QR request");
  storage.cancelConnection();
  assert.equal(await createTonStorage("user", browserStorage).getItem("connection"), null);
  storage.beginConnection();
  await storage.setItem("connection", "pending second request");
  await storage.setItem("connection", "confirmed session");
  storage.commitConnection();
  storage.cancelConnection();
  assert.equal(await createTonStorage("user", browserStorage).getItem("connection"), "confirmed session");
  storage.beginConnection();
  await storage.setItem("connection", "this tab's pending request");
  await createTonStorage("user", browserStorage).setItem("connection", "new session from another tab");
  storage.cancelConnection();
  assert.equal(await storage.getItem("connection"), "new session from another tab");
});

test("installed wallets use JS bridge; remote wallets use official universal link and bridge", () => {
  const wallet = { jsBridgeKey: "tonkeeper", bridgeUrl: "https://bridge.tonapi.io/bridge", universalLink: "https://app.tonkeeper.com/ton-connect" };
  assert.deepEqual(walletConnectionSource(wallet), { bridgeUrl: wallet.bridgeUrl, universalLink: wallet.universalLink });
  assert.deepEqual(walletConnectionSource({ ...wallet, injected: true }), { jsBridgeKey: "tonkeeper" });
  assert.deepEqual(walletConnectionSource({ ...wallet, embedded: true }), { jsBridgeKey: "tonkeeper" });
  assert.throws(() => walletConnectionSource({}));
});
