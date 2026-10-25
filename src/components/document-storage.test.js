import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

test("client documents have no bundled personal Markdown or review archives", async () => {
  const data = await readdir(new URL("../data/", import.meta.url));
  assert(!data.some(name => name.endsWith(".md") || name === "performance-review.js" || name === "gallup-report-content.js"));
  const components = new URL("./", import.meta.url);
  for (const name of await readdir(components)) {
    if (!name.endsWith(".jsx")) continue;
    const source = await readFile(new URL(name, components), "utf8");
    assert.doesNotMatch(source, /from\s+["'][^"']+\.md\?raw["']/, `${name} must load authored documents through authenticated content APIs`);
  }
});
