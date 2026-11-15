import assert from "node:assert/strict";
import test from "node:test";
import { SPHERE_APPLICATIONS, sphereApiOwner } from "../shared/applications.js";
import { applicationRuntime, requireApplicationApi } from "./application-runtime.js";

test("every sphere runs the existing schema verifier and owns exactly its API namespace", () => {
  assert.deepEqual(applicationRuntime({}), { id: "platform", sphere: null });
  assert.throws(() => applicationRuntime({ ROLLAPP_APPLICATION: "unknown" }), /Unknown/);
  for (const [id, sphere] of Object.entries(SPHERE_APPLICATIONS)) {
    assert.throws(() => applicationRuntime({ ROLLAPP_APPLICATION: id }), /requires .*verify/);
    assert.deepEqual(applicationRuntime({
      ROLLAPP_APPLICATION: id,
      ROLLAPP_DATABASE_INITIALIZATION: "verify",
    }), { id, sphere });
    const check = requireApplicationApi(id);
    const req = path => ({ path: path.replace(/^\/api/, "") });
    const status = newPath => {
      let code;
      check(req(newPath), { status: value => ({ json() { code = value; } }) }, () => { code = 200; });
      return code;
    };
    assert.equal(status("/api/healthz"), 200);
    assert.equal(status("/api/me"), 404);
    for (const [otherId, { api }] of Object.entries(SPHERE_APPLICATIONS)) {
      for (const prefix of api) {
        assert.equal(sphereApiOwner(prefix), otherId);
        assert.equal(sphereApiOwner(`${prefix}/entry`), otherId);
        assert.equal(sphereApiOwner(`${prefix}-unrelated`), null);
        assert.equal(status(prefix), otherId === id ? 200 : 404);
      }
    }
  }
});
