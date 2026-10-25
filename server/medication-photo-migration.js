// Explicit additive migration. Ordinary application startup only verifies it.
export async function migrateMedicationPhoto(client, { apply = false } = {}) {
  if (!apply) await client.query("SET TRANSACTION READ ONLY");
  const inspect = () => client.query(`SELECT column_name,data_type,is_nullable,column_default
    FROM information_schema.columns WHERE table_schema='public'
    AND table_name='health_medications' AND column_name='image_url'`);
  const validate = rows => {
    for (const column of rows) {
      if (column.data_type !== "text" || column.is_nullable !== "NO" || column.column_default !== "''::text") {
        throw new Error("Incompatible existing health_medications.image_url; no automatic repair.");
      }
    }
  };
  const before = (await inspect()).rows;
  validate(before);
  const missing = before.length ? [] : ["image_url"];
  if (!apply) return { mode: "read-only", missing };
  if (missing.length) {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query("ALTER TABLE public.health_medications ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT ''");
  }
  const after = (await inspect()).rows;
  validate(after);
  if (!after.length) throw new Error("Medication image_url is missing after migration.");
  await client.query("SELECT image_url FROM public.health_medications LIMIT 0");
  return { mode: "applied", added: missing };
}
