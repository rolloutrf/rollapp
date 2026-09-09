import assert from "node:assert/strict";
import test from "node:test";
import { refreshSession } from "./session-refresh.js";

function sessionState(initial) {
  let current = initial;
  return {
    get: () => current,
    set: (next) => { current = typeof next === "function" ? next(current) : next; },
  };
}

test("a temporary session failure preserves the signed-in user and rejects authentication completion", async () => {
  const user = { id: "existing-user" };
  const state = sessionState({ user, loading: false });
  const error = Object.assign(new Error("Server unavailable"), { status: 503 });
  await assert.rejects(refreshSession(async () => { throw error; }, state.set), error);
  assert.equal(state.get().user, user);
  assert.equal(state.get().error, error);
  assert.equal(state.get().loading, false);
});

test("initial connection failures remain distinguishable from a signed-out session and can be retried", async () => {
  const state = sessionState({ user: null, loading: true });
  const error = new Error("Offline");
  await assert.rejects(refreshSession(async () => { throw error; }, state.set), error);
  assert.equal(state.get().error, error);
  const result = { user: { id: "signed-in-user" } };
  assert.equal(await refreshSession(async () => result, state.set), result);
  assert.deepEqual(state.get(), { ...result, loading: false, error: null });
});

test("an expired session clears the authenticated user", async () => {
  const state = sessionState({ user: { id: "expired-user" }, loading: false });
  const error = Object.assign(new Error("Unauthorized"), { status: 401 });
  assert.deepEqual(await refreshSession(async () => { throw error; }, state.set), { user: null });
  assert.deepEqual(state.get(), { user: null, loading: false, error: null });
});
