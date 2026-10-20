import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { listenSmokeServer, smokeOrigin, smokePort } from "./smoke-server.mjs";

test("smoke ports default to atomic OS allocation and reject ambiguous diagnostic ports", () => {
  assert.equal(smokePort(), 0);assert.equal(smokePort("0"), 0);assert.equal(smokePort("5334"), 5334);
  for (const value of ["", " 5334", "01", -1, 65536, "1.5", NaN, "5172/path", "localhost"]) assert.throws(() => smokePort(value), /Invalid smoke server port/);
});
test("smoke origin accepts only an actual bound loopback TCP server", () => {
  for (const address of [null, "pipe", { address: "0.0.0.0", port: 1234 }, { address: "127.0.0.1", port: 0 }, { address: "127.0.0.1", port: 65536 }]) {
    assert.throws(() => smokeOrigin({ httpServer: { address: () => address } }), /listening on IPv4 loopback/);
  }
  assert.throws(() => smokeOrigin({}), /listening on IPv4 loopback/);
});
test("two simultaneous smoke servers retain independent owners without disturbing an occupied listener", async t => {
  const servers = ["first", "second"].map(name => createServer((_request, response) => response.end(name)));
  t.after(() => Promise.all(servers.map(server => new Promise(resolve => server.close(resolve)))));
  for (const server of servers) await new Promise((resolve, reject) => { server.once("error", reject);server.listen(smokePort(), "127.0.0.1", resolve); });
  const origins = servers.map(httpServer => smokeOrigin({ httpServer }));
  assert.notEqual(origins[0], origins[1]);
  assert.deepEqual(await Promise.all(origins.map(async origin => (await fetch(origin)).text())), ["first", "second"]);
});
test("complete smoke entry points derive URLs from their own bound server, never fixed shared ports", async () => {
  for (const name of ["action-rails", "control-size", "daily-todo-ribbon", "date-picker-pages", "detail-actions", "drawer", "kanban-drag", "mobile-catalog-page", "mobile-form-pages", "mobile-navigation", "wish-group-names", "identity-reports", "form-actions", "text-edit"]) {
    const source = await readFile(new URL(`./${name}-smoke.mjs`, import.meta.url), "utf8");
    assert.match(source, /smokePort\(/, name);assert.match(source, /await listenSmokeServer\(server\);\s*const origin = smokeOrigin\(server\);/, name);
    assert.match(source, /strictPort\s*:\s*true/, name);
    assert.doesNotMatch(source, /http:\/\/127\.0\.0\.1:(?:\d+|\$\{port\})/, name);
  }
});

test("real pinned Vite initializes two atomic port0 listeners and serves only each owner's middleware", async t => {
  const { createServer: createVite } = await import("vite");
  const servers = [];
  t.after(() => Promise.all(servers.map(server => server.close())));
  for (const name of ["first", "second"]) {
    const server = await createVite({ configFile: false, cacheDir: `node_modules/.vite-smoke-unit-${process.pid}-${name}`, optimizeDeps: { noDiscovery: true, include: [] },
      server: { host: "127.0.0.1", port: 0, strictPort: true, hmr: false, watch: null },
      plugins: [{ name: "owner", configureServer(vite) { vite.middlewares.use((_request, response) => response.end(name)); } }] });
    servers.push(server);await listenSmokeServer(server);
  }
  const origins = servers.map(smokeOrigin);assert.notEqual(origins[0], origins[1]);
  assert.deepEqual(await Promise.all(origins.map(async origin => (await fetch(origin)).text())), ["first", "second"]);
});
test("failed explicit-port startup closes only its own server and preserves the occupied listener", async t => {
  const listener = createServer((_request, response) => response.end("occupied"));
  t.after(() => new Promise(resolve => listener.close(resolve)));
  await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
  let closed = 0;
  const port = listener.address().port;
  await assert.rejects(listenSmokeServer({ config: { server: { host: "127.0.0.1", port } }, httpServer: {},
    listen: async () => { throw Object.assign(new Error("occupied"), { code: "EADDRINUSE" }); }, close: async () => { closed++; } }), { code: "EADDRINUSE" });
  assert.equal(closed, 1);assert.equal(await (await fetch(smokeOrigin({ httpServer: listener }))).text(), "occupied");
});
