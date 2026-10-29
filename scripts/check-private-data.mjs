import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
const forbidden = /^(?:exports\/|public\/(?:contact-avatars|avatars)\/|server\/contact-avatars-data\/|src\/assets\/gallup\/|src\/data\/.*\.md$)|(?:^|\/)(?:contacts-data\.js|contact-avatar-data\.js|lab-results-data\.js|gallup-report-content\.js|performance-review\.js|[^/]+\.(?:zip|docx|dump|sqlite|sqlite3|db))$/;
const errors = [];
for (const file of new Set(files)) {
  try { if (!(await stat(path.join(root, file))).isFile()) continue; }
  catch (error) { if (error.code === "ENOENT") continue; throw error; }
  // A same-named UI component is an implementation, not an authored data archive.
  if (forbidden.test(file) && file !== "server/performance-review.js") errors.push(`${file}: personal storage/archive path`);
}
for (const file of ["server/contacts.js", "server/planning-contacts.js", "server/lab-results.js"]) {
  const source = await readFile(path.join(root, file), "utf8");
  if (/\b(?:CONTACTS|LAB_REPORTS|STATIC_CONTACT_AVATAR_IDS)\b/.test(source)) errors.push(`${file}: shared personal defaults`);
}
if (errors.length) throw new Error(`Personal content must be imported into PostgreSQL, not committed:\n${errors.join("\n")}`);
console.log("PASS private data boundary: no tracked personal storage paths or shared record defaults");
