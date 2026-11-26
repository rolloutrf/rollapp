import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { androidApprovalProof, androidCallback, androidChallenge, registerAndroidAuthRoutes } from "./android-auth.js";

test("Android proof key uses RFC 7636 S256", () => {
  assert.equal(androidChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("Android approval is bound to active session, client, state and verifier challenge", () => {
  const request = { client: "release", state: "state-value", challenge: "challenge-value" };
  const cookie = "long-opaque-browser-session";
  const proof = androidApprovalProof(cookie, request);
  assert.match(proof, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(proof, androidApprovalProof("another-browser-session", request));
  assert.notEqual(proof, androidApprovalProof(cookie, { ...request, client: "debug" }));
  assert.notEqual(proof, androidApprovalProof(cookie, { ...request, state: "different" }));
  assert.notEqual(proof, androidApprovalProof(cookie, { ...request, challenge: "different" }));
});

test("Android callbacks target their fixed client scheme and encode opaque values", () => {
  const debug = new URL(androidCallback("debug", "code&", "state+"));
  assert.equal(debug.protocol, "ru.rollapp.android.debug:");
  assert.equal(debug.pathname, "/authorize");
  assert.equal(debug.searchParams.get("code"), "code&");
  assert.equal(debug.searchParams.get("state"), "state+");
  assert.equal(new URL(androidCallback("release", "code", "state")).protocol, "ru.rollapp.android:");
});

test("disabled Android auth advertises no capability and leaves exchange unavailable", async context => {
  const app = express();
  registerAndroidAuthRoutes(app, { enabled: false });
  const server = app.listen(0, "127.0.0.1");
  context.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;

  const configuration = await fetch(`${origin}/api/auth/android/config`);
  assert.equal(configuration.headers.get("cache-control"), "no-store");
  assert.deepEqual(await configuration.json(), { enabled: false });
  assert.equal((await fetch(`${origin}/api/auth/android/exchange`, { method: "POST" })).status, 404);
});
