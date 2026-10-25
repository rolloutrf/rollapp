import { createHash } from "node:crypto";
import { identityContentSchemas } from "./identity-content-schema.js";

const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

// The caller supplies a verified production transaction. Never initializes schema
// or overwrites an authored document; a concurrent insert wins unchanged.
export async function importIdentityDocument(client, { username, section, content, apply = false }) {
  if (!username || !Object.hasOwn(identityContentSchemas, section)) throw new Error("Specify an existing owner and supported identity section.");
  const parsed = identityContentSchemas[section].parse(content);
  if (!apply) await client.query("SET TRANSACTION READ ONLY");
  const { rows: owners } = await client.query("SELECT id FROM users WHERE username=$1", [username]);
  if (owners.length !== 1) throw new Error("Expected exactly one document owner.");
  const userId = owners[0].id;
  const { rows: existing } = await client.query("SELECT content_json FROM identity_content WHERE user_id=$1 AND section=$2", [userId, section]);
  if (existing.length) return { mode: apply ? "apply" : "read-only", result: "preserved", section, sameContent: digest(JSON.parse(existing[0].content_json)) === digest(parsed) };
  if (!apply) return { mode: "read-only", result: "missing", section, sha256: digest(parsed) };
  const { rows: inserted } = await client.query("INSERT INTO identity_content (user_id,section,content_json) VALUES ($1,$2,$3) ON CONFLICT (user_id,section) DO NOTHING RETURNING content_json", [userId, section, JSON.stringify(parsed)]);
  if (!inserted.length) return { mode: "apply", result: "preserved-concurrent", section };
  if (digest(JSON.parse(inserted[0].content_json)) !== digest(parsed)) throw new Error("Imported document differs from the requested content.");
  return { mode: "apply", result: "inserted", section, sha256: digest(parsed) };
}
