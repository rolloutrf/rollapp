import assert from "node:assert/strict";
import test from "node:test";
import { smokeMode } from "./smoke-mode.mjs";
test("no mode requests the complete matrix; one known mode requests exactly that diagnostic", () => {
  const known = ["--styles-only", "--paste-history-diagnostic"];
  assert.equal(smokeMode([], known), undefined);
  for (const mode of known) assert.equal(smokeMode([mode], known), mode);
});
test("unknown or multiple flags fail before server/browser startup, never falling through to full", () => {
  for (const values of [["--typo"], ["--styles-only", "--typo"], ["--styles-only", "--styles-only"], ["--styles-only", "--paste-history-diagnostic"], "--styles-only"]) {
    assert.throws(() => smokeMode(values, ["--styles-only", "--paste-history-diagnostic"]), /recognized smoke mode/);
  }
});
