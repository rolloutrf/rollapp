// Run explicitly after approval; ordinary startup must remain verify-only.
const sections = ["four-questions", "theses", "principles", "values", "character", "mission", "ideal-state", "life-strategy", "personal-development-plan"];

export async function migratePersonalDevelopmentPlan(client, { apply = false } = {}) {
  if (!apply) await client.query("SET TRANSACTION READ ONLY");
  const inspect = async () => {
    const { rows } = await client.query(`SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid='public.identity_content'::regclass
      AND conname='identity_content_section_check' AND contype='c'`);
    if (rows.length !== 1) throw new Error("Expected identity_content_section_check is missing; no automatic repair.");
    const existing = [...rows[0].definition.matchAll(/'([^']+)'(?:::text)?/g)].map(match => match[1]);
    if (existing.some(section => !sections.includes(section)) || sections.slice(0, -1).some(section => !existing.includes(section))) {
      throw new Error("Unexpected identity section constraint; no automatic replacement.");
    }
    return existing.includes("personal-development-plan");
  };
  const present = await inspect();
  if (!apply) return { mode: "read-only", missing: present ? [] : ["personal-development-plan"] };
  if (!present) {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query("ALTER TABLE public.identity_content DROP CONSTRAINT identity_content_section_check");
    await client.query(`ALTER TABLE public.identity_content ADD CONSTRAINT identity_content_section_check CHECK (section IN (${sections.map(section => `'${section}'`).join(",")}))`);
  }
  if (!await inspect()) throw new Error("Personal development plan section is unavailable after migration.");
  return { mode: "applied", added: present ? [] : ["personal-development-plan"] };
}
