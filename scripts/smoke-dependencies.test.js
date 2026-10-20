import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { smokeBaseUiDependencies } from "./smoke-dependencies.mjs";
async function importsAt(root) {
  const result = new Set();
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), root);
    if (entry.isDirectory()) for (const value of await importsAt(path)) result.add(value);
    else if (/\.(?:jsx?|tsx?)$/.test(entry.name)) {
      const source = await readFile(path, "utf8");
      for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*["'](@base-ui\/react(?:\/[A-Za-z0-9_-]+)?)["']/g)) result.add(match[1]);
    }
  }
  return result;
}
test("all actual Base UI imports are prebundled before the first lazy app-chrome navigation", async () => {
  const actual = await importsAt(new URL("../src/", import.meta.url));
  assert(actual.has("@base-ui/react/select"));
  assert.equal(new Set(smokeBaseUiDependencies).size, smokeBaseUiDependencies.length);
  for (const dependency of actual) assert(smokeBaseUiDependencies.includes(dependency), `Missing cold dependency: ${dependency}`);
});
test("text smoke wires the shared dependency inventory without disabling discovery or assertions", async () => {
  const source = await readFile(new URL("./text-edit-smoke.mjs", import.meta.url), "utf8");
  assert.match(source, /include: \["zod", \.\.\.smokeBaseUiDependencies,/);
  assert.doesNotMatch(source, /noDiscovery:\s*true/);
});
