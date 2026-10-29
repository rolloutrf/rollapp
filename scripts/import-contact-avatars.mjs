import { parseArgs } from "node:util";
import sharp from "sharp";
import { productionRollsDatabase } from "./rolls-database.mjs";
import { createContactAvatarLoader, facebookProfileUrl } from "../server/contact-avatars.js";
import { contactFromOverride } from "../server/contacts.js";
import { storePrivateImage } from "../server/private-data-import.js";

const { values } = parseArgs({ options: { username: { type: "string" }, limit: { type: "string", default: "100" }, refresh: { type: "boolean", default: false }, apply: { type: "boolean", default: false } } });
if (!values.username) throw new Error("Usage: --username OWNER [--limit 100] [--refresh] [--apply]");
const limit = Number(values.limit);
if (!Number.isInteger(limit) || limit < 1 || limit > 2000) throw new Error("Invalid contact limit");
process.env.PG_POOL_SIZE = "1";
const db = await productionRollsDatabase();
try {
  const owner = await db.query("SELECT id FROM users WHERE username=$1", [values.username]);
  if (owner.rowCount !== 1) throw new Error("A single existing owner is required");
  const ownerId = owner.rows[0].id;
  const rows = await db.query("SELECT * FROM contact_overrides WHERE user_id=$1 AND deleted_at IS NULL ORDER BY source_order NULLS FIRST,contact_id", [ownerId]);
  const contacts = rows.rows.map(contactFromOverride).filter(contact => facebookProfileUrl(contact) && (values.refresh || !contact.avatarUrl)).slice(0, limit);
  if (!values.apply) console.log(JSON.stringify({ candidates: contacts.length, apply: false }));
  else {
    const load = createContactAvatarLoader({ concurrency: 1, maxEntries: 1 });
    let saved = 0, failed = 0;
    for (const contact of contacts) {
      try {
        const remote = await load(contact);
        const body = await sharp(remote.body).rotate().resize(160, 160, { fit: "cover" }).webp({ quality: 78 }).toBuffer();
        await db.transaction(async client => {
          // Lock and recheck before allocating an asset; a concurrent edit wins.
          const current = await client.query("SELECT avatar_url FROM contact_overrides WHERE user_id=$1 AND contact_id=$2 AND deleted_at IS NULL FOR UPDATE", [ownerId, contact.id]);
          if (!current.rowCount || current.rows[0].avatar_url !== contact.avatarUrl) return;
          const url = await storePrivateImage(client, ownerId, { body, mimeType: "image/webp" });
          await client.query("UPDATE contact_overrides SET avatar_url=$3 WHERE user_id=$1 AND contact_id=$2", [ownerId, contact.id, url]);
          saved += 1;
        });
      } catch { failed += 1; }
    }
    console.log(JSON.stringify({ saved, failed }));
  }
} finally { await db.pool.end(); }
