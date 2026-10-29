import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import dotenv from "dotenv";
import { productionRollsDatabase } from "./rolls-database.mjs";
import { privateDataSchema } from "../server/private-data-schema.js";
import { archivePrivateFile, importPrivateRecords } from "../server/private-data-import.js";

const { values } = parseArgs({ options: {
  username: { type: "string" }, source: { type: "string" }, "config-dir": { type: "string" },
  "apply-schema": { type: "boolean", default: false }, apply: { type: "boolean", default: false },
} });
if (!values.username || !values.source) throw new Error("Usage: --username OWNER --source PRIVATE_DIRECTORY [--config-dir DIRECTORY] [--apply-schema] [--apply]");
const root = path.resolve(import.meta.dirname, "..");
const source = path.resolve(values.source);
if (!path.relative(root, source).startsWith(`..${path.sep}`)) throw new Error("Import sources must stay outside the repository");
if (values["config-dir"]) for (const name of [".env", ".env.local"]) dotenv.config({ path: path.join(values["config-dir"], name), override: false, quiet: true });
process.env.PG_POOL_SIZE = "1";
process.env.DEMO_MODE = "false";
process.env.ROLLAPP_DATABASE_INITIALIZATION = "verify";
const readJson = async name => JSON.parse(await readFile(path.join(source, name), "utf8"));
const contacts = await readJson("contacts.json");
const labResults = await readJson("lab-results.json");
const filenames = await readJson("files-manifest.json");
const types = { ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf", ".json": "application/json", ".js": "text/javascript", ".html": "text/html", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".zip": "application/zip" };
const files = [];
for (const filename of [...filenames, "history.bundle"]) {
  const absolute = filename === "history.bundle" ? path.join(source, filename) : path.resolve(source, "files", filename);
  if (!absolute.startsWith(`${source}${path.sep}`)) throw new Error("Invalid private source path");
  files.push({ path: filename, filename: path.basename(filename), mimeType: types[path.extname(filename)] || "application/octet-stream", body: await readFile(absolute) });
}
const db = await productionRollsDatabase();
try {
  const owner = await db.query("SELECT id FROM users WHERE username=$1", [values.username]);
  if (owner.rowCount !== 1) throw new Error("Import requires exactly one existing owner");
  const ownerId = owner.rows[0].id;
  console.log(JSON.stringify({ target: db.target, contacts: contacts.length, reports: labResults.reports.length, archiveFiles: files.length, archiveBytes: files.reduce((sum, file) => sum + file.body.length, 0), applySchema: values["apply-schema"], apply: values.apply }));
  if (values["apply-schema"]) await db.transaction(async client => {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query(privateDataSchema);
  });
  if (!values.apply) { console.log("Inspection only; no user records changed."); }
  else {
    // Archive original bytes before changing consumers or removing any file.
    for (const file of files) await db.transaction(client => archivePrivateFile(client, ownerId, file));
    const settings = await readJson("settings.json");
    for (const [key, value] of Object.entries(settings)) await db.query("INSERT INTO application_settings (key,value_text) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING", [key, value]);
    const byPath = new Map(files.map(file => [file.path, file]));
    const images = [];
    for (const contact of contacts) {
      const webp = byPath.get(`server/contact-avatars-data/${contact.id}.webp`);
      const png = byPath.get(`public/contact-avatars/${contact.id}.png`);
      const selected = png || webp;
      if (selected) images.push({ ...selected, contactId: contact.id, legacyUrls: [`/contact-avatars/${contact.id}.png`] });
      // Preserve the original alternate image bytes as well as the displayed one.
      if (png && webp) images.push({ ...webp });
    }
    const profile = files.find(file => file.path.startsWith("public/avatars/"));
    const profileImage = profile ? { ...profile, legacyUrls: [`/${profile.path.slice("public/".length)}`] } : undefined;
    console.log(JSON.stringify(await db.transaction(async client => {
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='60s'");
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [ownerId]);
      return importPrivateRecords(client, ownerId, { contacts, labResults, images, profileImage });
    })));
    console.log("Original archive bytes and imported records verified; existing records and deletions preserved.");
  }
} finally { await db.pool.end(); }
