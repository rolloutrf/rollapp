import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { importIdentityDocument } from "../server/identity-document-import.js";
import { productionRollsDatabase } from "./rolls-database.mjs";

const { values } = parseArgs({ options: { username: { type: "string" }, section: { type: "string" }, file: { type: "string" }, json: { type: "boolean", default: false }, apply: { type: "boolean", default: false } } });
if (!values.username || !values.section || !values.file) throw new Error("Usage: node scripts/import-identity-document.mjs --username OWNER --section SECTION --file PRIVATE_FILE [--json] [--apply]");
const raw = await readFile(values.file, "utf8");
if (Buffer.byteLength(raw) > 2_000_000) throw new Error("Document source exceeds the import limit.");
const content = values.json ? JSON.parse(raw) : raw;
const db = await productionRollsDatabase();
try {
  console.log(`Verified configured target: database=${db.target.database}, role=${db.target.role}`);
  console.log(JSON.stringify(await db.transaction(client => importIdentityDocument(client, { username: values.username, section: values.section, content, apply: values.apply }))));
} finally { await db.pool.end(); }
