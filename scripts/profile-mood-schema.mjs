import { readFile } from "node:fs/promises";
import { checkProfileMoodSchema } from "../server/profile-mood.js";
import { productionRollsDatabase } from "./rolls-database.mjs";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length && args[0] !== "--apply")) throw new Error("Usage: node scripts/profile-mood-schema.mjs [--apply]");
const apply = args[0] === "--apply";
const { pool, target } = await productionRollsDatabase();
try {
  const client = await pool.connect();
  try {
    await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
    await client.query("SET LOCAL lock_timeout='3s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    const { rows: [schema] } = await client.query(`SELECT
      current_schema() AS schema,
      EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='users'::regclass AND attname='mood_level' AND NOT attisdropped) AS level,
      EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='users'::regclass AND attname='mood_public' AND NOT attisdropped) AS visibility,
      to_regclass('user_mood_entries') IS NOT NULL AS journal`);
    console.log(JSON.stringify({ mode: apply ? "apply" : "read-only", ...target, ...schema }));
    const present = [schema.level, schema.visibility, schema.journal].filter(Boolean).length;
    if (present !== 0 && present !== 3) throw new Error("Схема настроений установлена частично: изменения отменены.");
    if (apply && present === 0) {
      const sql = await readFile(new URL("../server/migrations/2026-11-13-profile-mood.sql", import.meta.url), "utf8");
      await client.query(sql);
    }
    if (apply || present === 3) {
      await checkProfileMoodSchema(client);
      await client.query(apply ? "COMMIT" : "ROLLBACK");
      console.log("Колонки настроения и таблица личного журнала доступны.");
    } else {
      await client.query("ROLLBACK");
      console.log("Схема настроения ещё не установлена. Production не изменён.");
      process.exitCode = 2;
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
} finally { await pool.end(); }
