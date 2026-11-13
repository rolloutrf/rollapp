import assert from "node:assert/strict";
import test from "node:test";
import { developmentFrontendPort, developmentStartTimeout, productionConnectionMode } from "./production-dev-config.mjs";
import { launchAgentPlist, serviceLabel } from "./dev-keepalive.mjs";

test("development requires production PostgreSQL and uses direct access by default", () => {
  assert.equal(productionConnectionMode({ PGHOST: "production.example" }), "direct");
  assert.equal(productionConnectionMode({ DATABASE_URL: "postgresql://production.example/app", ROLLAPP_DATABASE_CONNECTION: "tunnel" }), "tunnel");
  assert.throws(() => productionConnectionMode({ DEMO_MODE: "true" }), /Демо-база отключена/);
  assert.throws(() => productionConnectionMode({ PGHOST: "production.example", ROLLAPP_DATABASE_CONNECTION: "demo" }), /direct или tunnel/);
});

test("development and its health check agree on the frontend port", () => {
  assert.equal(developmentFrontendPort({}), 5172);
  assert.equal(developmentFrontendPort({ ROLLAPP_DEV_FRONTEND_PORT: "5179" }), 5179);
  assert.throws(() => developmentFrontendPort({ ROLLAPP_DEV_FRONTEND_PORT: "65536" }));
  assert.throws(() => developmentFrontendPort({ ROLLAPP_DEV_FRONTEND_PORT: "invalid" }));
});

test("a longer startup timeout applies to the backend and the service controller", () => {
  assert.equal(developmentStartTimeout({}, 60_000), 60_000);
  assert.equal(developmentStartTimeout({}, 75_000), 75_000);
  const env = { ROLLAPP_DEV_START_TIMEOUT_MS: "150000" };
  assert.equal(developmentStartTimeout(env, 60_000), 150_000);
  assert.equal(developmentStartTimeout(env, 75_000), 150_000);
  assert.equal(developmentStartTimeout({ ROLLAPP_DEV_START_TIMEOUT_MS: "invalid" }, 60_000), 60_000);
  assert.equal(developmentStartTimeout({ ROLLAPP_DEV_START_TIMEOUT_MS: "900000" }, 60_000), 300_000);
});

test("the launch agent survives exits, starts on login, and escapes workspace paths", () => {
  const directory = "/Users/test/Work & Projects/rollapp";
  const plist = launchAgentPlist({ directory, nodePath: "/runtime/node", executablePath: "/runtime:/usr/bin:/bin", token: "a".repeat(32) });
  assert.match(plist, /<key>KeepAlive<\/key><true\/>/);
  assert.match(plist, /<key>RunAtLoad<\/key><true\/>/);
  assert.match(plist, /<string>\/runtime\/node<\/string><string>--input-type=module<\/string><string>--eval<\/string>/);
  assert.ok(plist.includes("Work &amp; Projects/rollapp"));
  assert.ok(plist.includes("Library/Logs/Rollapp"));
  assert.match(plist, /<key>DEMO_MODE<\/key><string>false<\/string>/);
  assert.doesNotMatch(plist, /PGPASSWORD|DATABASE_URL|SESSION_SECRET/);
  assert.notEqual(serviceLabel(directory), serviceLabel(`${directory}-other`));
});
