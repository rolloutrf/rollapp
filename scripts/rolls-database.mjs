import "dotenv/config";
import dotenv from "dotenv";
import { loadLockboxValue } from "../server/lockbox.js";

export async function productionRollsDatabase() {
  dotenv.config({ path: ".env.local", override: false, quiet: true });
  if (!process.env.DATABASE_URL && !process.env.PGHOST) throw new Error("Production PostgreSQL не настроен.");
  process.env.DEMO_MODE = "false";
  if (!process.env.PGPASSWORD && !process.env.DATABASE_URL && process.env.YC_LOCKBOX_SECRET_ID) {
    process.env.PGPASSWORD = await loadLockboxValue(process.env.YC_LOCKBOX_SECRET_ID, process.env.YC_LOCKBOX_SECRET_KEY || "postgresql_password");
  }
  const db = await import("../server/db.js");
  if (db.isMemoryDatabase) throw new Error("Для роллов необходима настроенная production-база.");
  try {
    const result = await db.query("SELECT current_database() AS database,current_user AS role,to_regclass('users')::text AS users_table");
    const target = result.rows[0];
    const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
    const database = url ? decodeURIComponent(url.pathname.slice(1)) : process.env.PGDATABASE;
    const role = url ? decodeURIComponent(url.username) : process.env.PGUSER;
    if (!database || !role || target.database !== database || target.role !== role || target.users_table !== "users") {
      throw new Error("Целевая база, роль или таблица пользователей не совпадают с конфигурацией.");
    }
    return { ...db, target };
  } catch (error) { await db.pool.end(); throw error; }
}
