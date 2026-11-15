import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("client documents have no bundled personal Markdown or review archives", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const archives = new Set(["performance-review.js", "gallup-report-content.js"]);
  const files = await readdir(root, { recursive: true, withFileTypes: true });
  for (const file of files.filter(entry => entry.isFile())) {
    const filename = path.join(file.parentPath, file.name);
    const relative = path.relative(root, filename);
    const isLegacyMarkdown = relative.startsWith(`data${path.sep}`) && file.name.endsWith(".md");
    assert(!isLegacyMarkdown && !archives.has(file.name), `${relative} must not bundle authored documents`);
    if (!/\.jsx?$/.test(file.name)) continue;
    const source = await readFile(filename, "utf8");
    assert.doesNotMatch(source, /from\s+["'][^"']+\.md\?raw["']/, `${relative} must load authored documents through authenticated content APIs`);
  }
});
