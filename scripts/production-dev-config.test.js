import assert from "node:assert/strict";
import test from "node:test";
import { developmentFrontendPort, productionConnectionMode } from "./production-dev-config.mjs";
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
