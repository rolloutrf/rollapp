import { readFile } from "node:fs/promises";
import { productionRollsDatabase } from "./rolls-database.mjs";
// Reuse the configured TLS / Lockbox connection and exact database/role guard.
const apply = process.argv.includes("--apply");
const { pool } = await productionRollsDatabase();
const client = await pool.connect();
try {
  await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
  await client.query("SET LOCAL lock_timeout='3s'");
  await client.query("SET LOCAL statement_timeout='15s'");
  const identity = await client.query("SELECT current_database() AS database,current_user AS role,inet_server_addr()::text AS server");
  console.log(JSON.stringify({ target: identity.rows[0], mode: apply ? "apply" : "read-only" }));
  const constraints = await client.query(`SELECT conrelid::regclass::text AS table_name,conname,pg_get_constraintdef(oid) AS definition
    FROM pg_constraint WHERE conname IN ('identity_generated_reports_section_check','identity_report_uploads_section_check') ORDER BY conname`);
  if (constraints.rowCount !== 2) throw new Error("Ожидаемые ограничения не найдены: операция отменена");
  console.log(JSON.stringify(constraints.rows));
  if (apply) {
    const sql = await readFile(new URL("../server/migrations/2026-10-24-custom-identity-tests.sql", import.meta.url), "utf8");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("Custom identity tests enabled; existing rows preserved.");
  } else await client.query("ROLLBACK");
} catch (error) { await client.query("ROLLBACK"); throw error; }
finally { client.release(); await pool.end(); }
