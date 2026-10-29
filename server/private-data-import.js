import { createHash } from "node:crypto";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function privateAssetId(ownerId, key) {
  const hex = sha256(`${ownerId}:${key}`).slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = "8";
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export async function archivePrivateFile(client, ownerId, file) {
  const hash = sha256(file.body);
  const id = privateAssetId(ownerId, `${file.path}:${hash}`);
  await client.query(
    `INSERT INTO private_files (id,user_id,source_path,filename,mime_type,file_data,size_bytes,file_sha256)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (user_id,source_path,file_sha256) DO NOTHING`,
    [id, ownerId, file.path, file.filename, file.mimeType, file.body, file.body.length, hash],
  );
  const verified = await client.query(
    "SELECT id FROM private_files WHERE user_id=$1 AND source_path=$2 AND file_sha256=$3 AND encode(sha256(file_data),'hex')=$3 AND size_bytes=$4",
    [ownerId, file.path, hash, file.body.length],
  );
  if (verified.rowCount !== 1) throw new Error("Private archive integrity check failed");
  return verified.rows[0].id;
}

export async function storePrivateImage(client, ownerId, image) {
  const hash = sha256(image.body);
  const id = privateAssetId(ownerId, `image:${hash}`);
  await client.query(
    "INSERT INTO wish_images (id,user_id,mime_type,image_data,size_bytes) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING",
    [id, ownerId, image.mimeType, image.body, image.body.length],
  );
  const verified = await client.query(
    "SELECT id FROM wish_images WHERE id=$1 AND user_id=$2 AND encode(sha256(image_data),'hex')=$3 AND mime_type=$4",
    [id, ownerId, hash, image.mimeType],
  );
  if (verified.rowCount !== 1) throw new Error("Imported image integrity check failed");
  return `/api/media/${id}`;
}

// Existing fields, user deletions and upload records always win over the import.
// The caller has already verified the production target and explicit owner.
export async function materializeContacts(client, ownerId, contacts) {
  if (!Array.isArray(contacts) || new Set(contacts.map(contact => contact.id)).size !== contacts.length
    || contacts.some(contact => !contact.id || !contact.name || !Array.isArray(contact.links))) throw new Error("Invalid contacts import");
  const records = contacts.map((contact, index) => ({ ...contact, source_order: index + 1, links_json: JSON.stringify(contact.links) }));
  const serialized = JSON.stringify(records);
  const inserted = await client.query(
    `INSERT INTO contact_overrides (user_id,contact_id,name,company,role,category,status,links_json,notes,source_order)
     SELECT $1,c.id,c.name,COALESCE(c.company,''),COALESCE(c.role,''),COALESCE(c.category,''),COALESCE(c.status,''),c.links_json,COALESCE(c.notes,''),c.source_order
     FROM jsonb_to_recordset($2::jsonb) AS c(id text,name text,company text,role text,category text,status text,links_json text,notes text,source_order integer)
     ON CONFLICT (user_id,contact_id) DO NOTHING`, [ownerId, serialized],
  );
  await client.query(
    `UPDATE contact_overrides AS target SET source_order=c.source_order
     FROM jsonb_to_recordset($2::jsonb) AS c(id text,source_order integer)
     WHERE target.user_id=$1 AND target.contact_id=c.id AND target.source_order IS DISTINCT FROM c.source_order`,
    [ownerId, serialized],
  );
  const complete = await client.query("SELECT count(*) AS count FROM contact_overrides WHERE user_id=$1 AND contact_id=ANY($2::text[])", [ownerId, contacts.map(contact => contact.id)]);
  if (Number(complete.rows[0].count) !== contacts.length) throw new Error("Contacts import is incomplete");
  return { insertedContacts: inserted.rowCount, verifiedContacts: contacts.length };
}

export async function importPrivateRecords(client, ownerId, { contacts, labResults, images = [], profileImage }) {
  if (!Array.isArray(labResults?.reports) || !Array.isArray(labResults?.trends) || !Array.isArray(labResults?.attentionItems)) throw new Error("Invalid laboratory import");
  const contactResult = await materializeContacts(client, ownerId, contacts);
  const labs = await client.query(
    "INSERT INTO health_lab_content (user_id,content_json) VALUES ($1,$2) ON CONFLICT (user_id) DO NOTHING",
    [ownerId, JSON.stringify(labResults)],
  );
  for (const image of images) {
    const url = await storePrivateImage(client, ownerId, image);
    if (image.contactId) await client.query(
      "UPDATE contact_overrides SET avatar_url=$3 WHERE user_id=$1 AND contact_id=$2 AND (avatar_url='' OR avatar_url=ANY($4::text[]))",
      [ownerId, image.contactId, url, image.legacyUrls || []],
    );
  }
  if (profileImage) {
    const url = await storePrivateImage(client, ownerId, profileImage);
    await client.query("UPDATE users SET avatar_url=$2 WHERE id=$1 AND avatar_url=ANY($3::text[])", [ownerId, url, profileImage.legacyUrls]);
  }
  return { ...contactResult, insertedLabDocuments: labs.rowCount, verifiedImages: images.length + Number(Boolean(profileImage)) };
}
