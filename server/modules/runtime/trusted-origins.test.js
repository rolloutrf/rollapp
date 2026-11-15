import assert from "node:assert/strict";
import test from "node:test";
import { configuredTrustedOrigins, isTrustedRequestOrigin } from "./trusted-origins.js";

test("the configured local app origin is trusted behind the Vite proxy", () => {
  const configuredOrigins = configuredTrustedOrigins("http://localhost:5173");

  assert.equal(isTrustedRequestOrigin({
    origin: "http://localhost:5173",
    requestOrigin: "http://localhost:8080",
    configuredOrigins,
  }), true);
});

test("unconfigured cross-site origins stay blocked", () => {
  const configuredOrigins = configuredTrustedOrigins("http://localhost:5173");

  assert.equal(isTrustedRequestOrigin({
    origin: "https://attacker.example",
    requestOrigin: "http://localhost:8080",
    configuredOrigins,
  }), false);
});

test("multiple explicit app origins can be configured", () => {
  const configuredOrigins = configuredTrustedOrigins("http://localhost:5173, https://rollapp.example/path");

  assert.deepEqual([...configuredOrigins], ["http://localhost:5173", "https://rollapp.example"]);
});
