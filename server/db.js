import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { newDb } from "pg-mem";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createMemoryPool() {
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = memory.adapters.createPg();
  return new adapter.Pool();
}

function createPostgresPool(connectionString) {
  const caPath = path.resolve(__dirname, "../certs/yandex-cloud-ca.pem");
  const ssl = fs.existsSync(caPath)
    ? { rejectUnauthorized: true, ca: fs.readFileSync(caPath, "utf8") }
    : { rejectUnauthorized: true };

  return new pg.Pool({
    connectionString,
    ssl,
    max: Number(process.env.PG_POOL_SIZE || 8),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

const hasPostgresConfig = Boolean(process.env.DATABASE_URL || process.env.PGHOST);

export const isMemoryDatabase = !hasPostgresConfig;

if (isMemoryDatabase && process.env.DEMO_MODE === "false") {
  throw new Error("DATABASE_URL or PGHOST is required when DEMO_MODE=false");
}

export const pool = isMemoryDatabase
  ? createMemoryPool()
  : createPostgresPool(process.env.DATABASE_URL || undefined);

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
