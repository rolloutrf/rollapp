#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function privateHistoryPaths(lines) {
  return lines.filter(line => {
    const split = line.indexOf(" ");
    if (split < 0) return false;
    const filename = line.slice(split + 1);
    return /^(?:exports\/|public\/(?:contact-avatars|avatars)\/|server\/contact-avatars-data\/|src\/assets\/gallup\/|src\/data\/.*\.md$)|(?:^|\/)(?:contacts-data\.js|contact-avatar-data\.js|lab-results-data\.js|gallup-report-content\.js|[^/]+\.(?:zip|docx|dump|sqlite|sqlite3|db))$/.test(filename)
      || filename === "src/data/performance-review.js"
      || filename === "server/lab-results-data.test.js";
  }).map(line => line.slice(line.indexOf(" ") + 1));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const input = process.argv.includes("--head")
      ? `HEAD ${execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()}`
      : readFileSync(0, "utf8");
    const updates = input.trim().split("\n").filter(Boolean);
    const commits = [...new Set(updates.map(line => line.split(/\s+/)[1]).filter(sha => /^[0-9a-f]{40}$/.test(sha) && !/^0+$/.test(sha)))];
    if (commits.length) {
      const objects = execFileSync("git", ["rev-list", "--objects", ...commits], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\n");
      const paths = privateHistoryPaths(objects);
      if (paths.length) throw new Error("Push rejected: this branch retains personal files in its history. Preserve your working edits and rebase onto the cleaned repository; do not merge the old history.");
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
