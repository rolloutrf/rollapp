import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSshArguments,
  createProductionDatabaseEnvironment,
  readTunnelConfig,
  tunnelProcessMatches,
} from "./production-db-tunnel.mjs";

const environment = {
  DATABASE_URL: "postgresql://rollapp:password@cluster.example.net:6432/rollapp",
  ROLLAPP_TUNNEL_LOCAL_PORT: "15432",
  ROLLAPP_TUNNEL_SSH_HOST: "51.250.110.17",
  ROLLAPP_TUNNEL_SSH_KEY: "/Users/example/.ssh/id_ed25519",
  ROLLAPP_TUNNEL_SSH_USER: "rollapp",
};

test("production tunnel preserves the database hostname for TLS", () => {
  const config = readTunnelConfig(environment);
  const updated = createProductionDatabaseEnvironment(environment, config);

  assert.equal(new URL(updated.DATABASE_URL).hostname, "127.0.0.1");
  assert.equal(new URL(updated.DATABASE_URL).port, "15432");
  assert.equal(updated.PGSSL_SERVERNAME, "cluster.example.net");
  assert.equal(updated.DEMO_MODE, "false");
});

test("an unavailable process inspection cannot be mistaken for a stale tunnel", () => {
  const record = { pid: 123, token: "a".repeat(32) };
  assert.throws(() => tunnelProcessMatches(record, () => { throw Object.assign(new Error("denied"), { code: "EPERM" }); }), /PID-файл сохранён/);
  assert.equal(tunnelProcessMatches(record, () => "some other process"), false);
});

test("production tunnel forwards only through localhost", () => {
  const config = readTunnelConfig(environment);
  const argumentsList = buildSshArguments(config);

  assert.deepEqual(argumentsList.slice(-5), [
    "-L",
    "127.0.0.1:15432:cluster.example.net:6432",
    "-l",
    "rollapp",
    "51.250.110.17",
  ]);
  assert.ok(argumentsList.includes("IPQoS=none"));
  assert.ok(argumentsList.includes("ServerAliveInterval=15"));
});

test("production tunnel also routes the auto database on the same cluster", () => {
  const configured = {
    ...environment,
    AUTO_DATABASE_URL: "postgresql://auto_reader:password@cluster.example.net:6432/auto",
  };
  const updated = createProductionDatabaseEnvironment(configured, readTunnelConfig(configured));

  assert.equal(new URL(updated.AUTO_DATABASE_URL).hostname, "127.0.0.1");
  assert.equal(new URL(updated.AUTO_DATABASE_URL).port, "15432");
  assert.equal(new URL(updated.AUTO_DATABASE_URL).pathname, "/auto");
  assert.equal(updated.AUTO_PGSSL_SERVERNAME, "cluster.example.net");
});
