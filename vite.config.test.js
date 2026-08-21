import assert from "node:assert/strict";
import test from "node:test";
import viteConfig from "./vite.config.js";

test("the dev API proxy preserves the browser-facing host for CSRF checks", () => {
  const apiProxy = viteConfig.server.proxy["/api"];

  assert.equal(typeof apiProxy, "object");
  assert.equal(apiProxy.target, "http://127.0.0.1:8080");
  assert.equal(apiProxy.changeOrigin, false);
});
