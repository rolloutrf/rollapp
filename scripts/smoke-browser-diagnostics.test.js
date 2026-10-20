import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { instrumentSmokeBrowser, smokeBrowserDiagnostics } from "./smoke-browser-diagnostics.mjs";

function fixture() {
  const context = Object.assign(new EventEmitter(), { pages: () => [page] });
  const page = Object.assign(new EventEmitter(), { context: () => context });
  const browser = { async newPage() { assert.equal(this, browser);return page; }, async newContext() { assert.equal(this, browser);return context; }, close() { assert.equal(this, browser);return "closed"; } };
  return { page, context, wrapped: instrumentSmokeBrowser(browser) };
}
test("browser diagnostics delegate native pages/contexts/methods without changing ownership", async () => {
  const { wrapped, page, context } = fixture();
  assert.equal(await wrapped.newPage(), page);assert.equal(await wrapped.newContext(), context);assert.equal(wrapped.close(), "closed");
  assert.equal(wrapped.newPage, wrapped.newPage);assert.equal(page.listenerCount("request"), 1);
  const popup = new EventEmitter();context.emit("page", popup);popup.emit("pageerror", new Error("popup error"));
  assert.equal(smokeBrowserDiagnostics(popup).trail[0].message, "popup error");
});
test("network diagnostics distinguish pending/failed/HTTP modules and strip query strings", async () => {
  const { wrapped, page } = fixture();await wrapped.newPage();
  const request = { url: () => "http://127.0.0.1:1234/module.js?private=DO-NOT-STORE", failure: () => ({ errorText: "net::ERR_ABORTED" }) };
  page.emit("request", request);assert.equal(smokeBrowserDiagnostics(page).pending[0].url, "http://127.0.0.1:1234/module.js");
  page.emit("requestfinished", request);assert.equal(smokeBrowserDiagnostics(page).pending.length, 0);
  page.emit("request", request);page.emit("requestfailed", request);
  page.emit("response", { url: request.url, status: () => 504 });
  page.emit("console", { type: () => "error", text: () => "module failed" });
  const result = smokeBrowserDiagnostics(page);assert.equal(result.pending.length, 0);assert.deepEqual(result.trail.map(x => x.kind), ["requestfailed", "http", "error"]);
  assert(!JSON.stringify(result).includes("DO-NOT-STORE"));
});
test("browser traces remain bounded and never retain successfully completed requests", async () => {
  const { wrapped, page } = fixture();await wrapped.newPage();
  for (let i=0;i<240;i++) { page.emit("request", { url: () => `http://127.0.0.1/${i}` });page.emit("pageerror", new Error(`error${i}`)); }
  assert.equal(smokeBrowserDiagnostics(page).pending.length, 200);assert.equal(smokeBrowserDiagnostics(page).trail.length, 80);
  assert.deepEqual(smokeBrowserDiagnostics(new EventEmitter()), { trail: [], pending: [] });
});
