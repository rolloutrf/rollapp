import assert from "node:assert/strict";
import test from "node:test";
import { createLatestSaveQueue } from "./latest-save-queue.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("autosave serializes writes and flushes the latest queued draft", async () => {
  const firstRequest = deferred();
  const finalRequest = deferred();
  const calls = [];
  let active = 0;
  let peak = 0;
  const enqueue = createLatestSaveQueue(async (draft) => {
    calls.push(draft);
    active += 1;
    peak = Math.max(peak, active);
    try {
      return await (calls.length === 1 ? firstRequest.promise : finalRequest.promise);
    } finally {
      active -= 1;
    }
  });
  const first = { summary: "Первый черновик" };
  const intermediate = { summary: "Промежуточный черновик" };
  const latest = { summary: "Последний черновик" };
  const firstSave = enqueue(first);
  const intermediateSave = enqueue(intermediate);
  const latestSave = enqueue(latest);

  assert.deepEqual(calls, [first]);
  firstRequest.resolve({ updatedAt: "first" });
  assert.deepEqual(await firstSave, { value: first, result: { updatedAt: "first" } });
  assert.deepEqual(calls, [first, latest]);
  finalRequest.resolve({ updatedAt: "latest" });
  for (const saved of await Promise.all([intermediateSave, latestSave])) {
    assert.equal(saved.value, latest);
    assert.deepEqual(saved.result, { updatedAt: "latest" });
  }
  assert.equal(peak, 1);
});

test("blur and debounce share an in-flight save of the same draft", async () => {
  const request = deferred();
  let calls = 0;
  const enqueue = createLatestSaveQueue(() => {
    calls += 1;
    return request.promise;
  });
  const draft = { summary: "Один черновик" };
  const autosave = enqueue(draft);
  const blurSave = enqueue(draft);
  request.resolve("saved");
  assert.deepEqual(await Promise.all([autosave, blurSave]), [
    { value: draft, result: "saved" },
    { value: draft, result: "saved" },
  ]);
  assert.equal(calls, 1);
});

test("a failed write rejects its caller and still flushes the latest draft", async () => {
  const request = deferred();
  const calls = [];
  const enqueue = createLatestSaveQueue((draft) => {
    calls.push(draft);
    return calls.length === 1 ? request.promise : Promise.resolve("saved");
  });
  const firstSave = enqueue("old");
  const failure = assert.rejects(firstSave, /unavailable/);
  const latestSave = enqueue("latest");
  request.reject(new Error("unavailable"));
  await failure;
  assert.deepEqual(await latestSave, { value: "latest", result: "saved" });
  assert.deepEqual(calls, ["old", "latest"]);
});

test("a failed final draft remains retryable instead of being acknowledged", async () => {
  let attempts = 0;
  const enqueue = createLatestSaveQueue(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("unavailable");
    return "saved";
  });
  const draft = { summary: "Несохранённый черновик" };
  await assert.rejects(enqueue(draft), /unavailable/);
  assert.deepEqual(await enqueue(draft), { value: draft, result: "saved" });
  assert.equal(attempts, 2);
});
