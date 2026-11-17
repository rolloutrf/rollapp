import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const [operation, directory, commit] = process.argv.slice(2);
assert(["prepare", "publish"].includes(operation) && directory && /^[0-9a-f]{40}$/.test(commit ?? ""),
  "Usage: node scripts/storybook-release.mjs <prepare|publish> <static directory> <full commit SHA>");

const root = path.resolve(directory);
const site = "https://xn--90anhnkehm.xn--80avakiab.xn--p1ai/";
const s3 = "s3://xn--90anhnkehm.xn--80avakiab.xn--p1ai/";
const manifestName = "storybook-release.json";
const entrypoints = ["iframe.html", "project.json", "index.json", "index.html"];
const privateFiles = /(?:^|\/)(?:\.[^/]*|.*\.(?:map|zip)|tonconnect-(?:wallets|manifest)\.json)$/i;

assert((await lstat(root)).isDirectory(), "Expected a static build directory");
for (const key of entrypoints) {
  assert((await lstat(path.join(root, key))).isFile(), `Missing static build entry point: ${key}`);
}
const index = JSON.parse(await readFile(path.join(root, "index.json"), "utf8"));
const stories = Object.values(index.entries).filter(item => item.type === "story").length;
assert(stories > 0, "Storybook index has no stories");

async function inventory(relative = "") {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : Number(a.name > b.name)))) {
    const key = path.posix.join(relative, entry.name);
    assert(!entry.isSymbolicLink(), `Unexpected symlink: ${key}`);
    if (entry.isDirectory()) files.push(...await inventory(key));
    else if (entry.isFile() && key !== manifestName) {
      if (privateFiles.test(key) && operation === "prepare") {
        await rm(path.join(root, key));
        continue;
      }
      assert(!privateFiles.test(key), `Unexpected file in the publish artifact: ${key}`);
      const data = await readFile(path.join(root, key));
      files.push({ key, size: data.byteLength, sha256: sha256(data) });
    }
  }
  return files;
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

const files = await inventory();
const manifest = { commit, stories, files };
const manifestPath = path.join(root, manifestName);

if (operation === "prepare") {
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Prepared ${files.length} files and ${stories} stories at ${commit}.`);
} else {
  assert.deepEqual(JSON.parse(await readFile(manifestPath, "utf8")), manifest, "Artifact hash or commit mismatch");

  // Publish dependencies first. Keep the previous build's objects for open tabs and rollback.
  execFileSync("yc", ["storage", "s3", "cp", root, s3, "--recursive", "--no-follow-symlinks",
    "--only-show-errors", "--cache-control", "no-cache",
    ...[...entrypoints, manifestName].flatMap(name => ["--exclude", name])], { stdio: "inherit" });
  for (const key of [...entrypoints, manifestName]) {
    const contentType = key.endsWith(".html") ? "text/html; charset=utf-8" : "application/json";
    execFileSync("yc", ["storage", "s3", "cp", path.join(root, key), s3 + key,
      "--only-show-errors", "--cache-control", "no-cache", "--content-type", contentType], { stdio: "inherit" });
  }
  const token = new URLSearchParams({ release: commit });
  const publicProof = [...files.filter(file => entrypoints.includes(file.key)), {
    key: manifestName, sha256: sha256(await readFile(manifestPath)),
  }];
  await Promise.all(publicProof.map(async ({ key, sha256: expected }) => {
    const response = await fetch(new URL(`${key}?${token}`, site), { signal: AbortSignal.timeout(30000) });
    assert(response.ok, `Published ${key} returned HTTP ${response.status}`);
    assert.equal(sha256(Buffer.from(await response.arrayBuffer())), expected, `Published ${key} hash differs`);
  }));
  console.log(`Published Storybook ${commit}, ${stories} stories. Public entry points match the verified artifact.`);
}
