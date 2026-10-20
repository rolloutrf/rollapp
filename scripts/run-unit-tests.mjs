import { readdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

// Legacy database fixtures are kept available, but never form part of the
// release unit suite. Production integration checks run explicitly with rollback.
const legacyDatabaseTests = new Set([
  "server/db.test.js",
  "server/default-friend.test.js",
  "server/wish-groups.test.js",
]);
async function testsIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const file = path.posix.join(directory, entry.name);
    return entry.isDirectory() ? testsIn(file) : file.endsWith(".test.js") ? [file] : [];
  }));
  return nested.flat();
}
const discovered = (await Promise.all(["server", "shared", "src", "scripts"].map(testsIn))).flat().concat("vite.config.test.js").sort();
const selected = discovered.filter((file) => !file.endsWith(".integration.test.js") && !legacyDatabaseTests.has(file));
for (const file of selected) {
  const source = await readFile(file, "utf8");
  if (/from\s+["']pg-mem["']|newDb\s*\(|(?:from\s*|import\s*\()\s*["'][^"']*\/db\.js["']|\binitializeDatabase\b/.test(source)) {
    throw new Error(`Database fixture found in the unit suite: ${file}. Classify it as an integration test first.`);
  }
}
console.log(`Release unit suite: ${selected.length} files; ${discovered.length - selected.length} database integration/legacy files excluded.`);
if (process.argv.includes("--list")) {
  console.log(selected.join("\n"));
} else {
  const concurrency = process.env.ROLLAPP_TEST_CONCURRENCY;
  if (concurrency !== undefined && !/^[1-9]\d*$/.test(concurrency)) throw new Error("ROLLAPP_TEST_CONCURRENCY must be a positive integer");
  const child = spawn(process.execPath, ["--test", ...(concurrency ? [`--test-concurrency=${concurrency}`] : []), ...selected], {
    stdio: "inherit",
    env: { ...process.env, ROLLAPP_TEST_TON: "0" },
  });
  child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
  child.on("exit", (code) => { process.exitCode = code ?? 1; });
}
