const columns = ["expected_result", "actual_result"];

// Deliberate additive migration only; never called by ordinary verify startup.
export async function migratePlanningResults(client, { apply = false } = {}) {
  if (!apply) await client.query("SET TRANSACTION READ ONLY");
  const inspect = () => client.query(`SELECT column_name,data_type,is_nullable,column_default
    FROM information_schema.columns WHERE table_schema='public'
    AND table_name='planning_tasks' AND column_name IN ('expected_result','actual_result')`);
  const validate = (rows) => {
    for (const column of rows) {
      if (column.data_type !== "text" || column.is_nullable !== "NO" || column.column_default !== "''::text") {
        throw new Error(`Incompatible existing planning_tasks.${column.column_name}; no automatic repair.`);
      }
    }
  };
  const before = (await inspect()).rows;
  validate(before);
  const missing = columns.filter(name => !before.some(column => column.column_name === name));
  if (!apply) return { mode: "read-only", missing };
  if (missing.length) {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    // One atomic statement, no UPDATE/backfill/cleanup or startup migrations.
    await client.query(`ALTER TABLE public.planning_tasks
      ADD COLUMN IF NOT EXISTS expected_result TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS actual_result TEXT NOT NULL DEFAULT ''`);
  }
  const after = (await inspect()).rows;
  validate(after);
  if (columns.some(name => !after.some(column => column.column_name === name))) throw new Error("Planning result columns are missing after migration.");
  await client.query("SELECT expected_result,actual_result FROM public.planning_tasks LIMIT 0");
  return { mode: "applied", added: missing };
}
