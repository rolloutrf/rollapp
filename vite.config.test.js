import assert from "node:assert/strict";
import test from "node:test";
import viteConfig from "./vite.config.js";

test("the dev API proxy preserves the browser-facing host for CSRF checks", () => {
  const apiProxy = viteConfig.server.proxy["/api"];

  assert.equal(typeof apiProxy, "object");
  assert.equal(apiProxy.target, `http://127.0.0.1:${process.env.PORT || 8080}`);
  assert.equal(apiProxy.changeOrigin, false);
});

test("an isolated dev backend keeps API and manifest on the configured port", async () => {
  const previous = process.env.PORT;
  process.env.PORT = "8087";
  try {
    const { default: isolated } = await import("./vite.config.js?isolated-backend-test");
    for (const path of ["/api", "/tonconnect-manifest.json"]) {
      assert.equal(isolated.server.proxy[path].target, "http://127.0.0.1:8087");
      assert.equal(isolated.server.proxy[path].changeOrigin, false);
    }
  } finally {
    if (previous === undefined) delete process.env.PORT;
    else process.env.PORT = previous;
  }
});
