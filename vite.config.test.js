import assert from "node:assert/strict";
import test from "node:test";
import viteConfig from "./vite.config.js";

test("the dev API proxy preserves the browser-facing host for CSRF checks", () => {
  const apiProxy = viteConfig.server.proxy["/api"];

  assert.equal(typeof apiProxy, "object");
  assert.equal(apiProxy.target, `http://127.0.0.1:${process.env.PORT || 8080}`);
  assert.equal(apiProxy.changeOrigin, false);
});


test("isolated development ports proxy API and manifest to the configured backend", async () => {
  const previous = process.env.PORT;
  try {
    process.env.PORT = "8088";
    const { default: config } = await import("./vite.config.js?isolated-backend");
    for (const route of ["/api", "/tonconnect-manifest.json"]) {
      assert.equal(config.server.proxy[route].target, "http://127.0.0.1:8088");
      assert.equal(config.server.proxy[route].changeOrigin, false);
    }
  } finally {
    if (previous === undefined) delete process.env.PORT;
    else process.env.PORT = previous;
  }
});
