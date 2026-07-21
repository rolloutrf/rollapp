import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { pool } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tables = [
  "users",
  "sessions",
  "wishlists",
  "wishes",
  "wishlist_wishes",
  "reservations",
  "follows",
  "notifications",
  "santa_games",
  "santa_participants",
  "santa_messages",
];

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function migrateDatabase({ source, migrationKey }) {
  await pool.query(`CREATE TABLE IF NOT EXISTS app_migrations (
    key TEXT PRIMARY KEY,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const completed = await pool.query("SELECT 1 FROM app_migrations WHERE key=$1", [migrationKey]);
  if (completed.rowCount) {
    console.log("Database migration already completed");
    return;
  }

  const caPath = path.resolve(__dirname, "../certs/yandex-cloud-ca.pem");
  const sourceClient = new pg.Client({
    ...source,
    ssl: { rejectUnauthorized: true, ca: fs.readFileSync(caPath, "utf8") },
    connectionTimeoutMillis: 10_000,
  });
  const targetClient = await pool.connect();

  try {
    await sourceClient.connect();
    await sourceClient.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await targetClient.query("BEGIN");

    for (const table of tables) {
      const targetCount = await targetClient.query(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`);
      if (Number(targetCount.rows[0].count) !== 0) {
        throw new Error(`Migration target is not empty: ${table}`);
      }
    }

    for (const table of tables) {
      const sourceRows = await sourceClient.query(`SELECT * FROM ${quoteIdentifier(table)}`);
      for (const row of sourceRows.rows) {
        const columns = Object.keys(row);
        const identifiers = columns.map(quoteIdentifier).join(",");
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(",");
        await targetClient.query(
          `INSERT INTO ${quoteIdentifier(table)} (${identifiers}) VALUES (${placeholders})`,
          columns.map((column) => row[column]),
        );
      }

      const targetCount = await targetClient.query(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`);
      if (Number(targetCount.rows[0].count) !== sourceRows.rowCount) {
        throw new Error(`Migration row-count mismatch for ${table}`);
      }
      console.log(`Migrated ${table}: ${sourceRows.rowCount} rows`);
    }

    await targetClient.query(
      `UPDATE notifications
       SET title=REPLACE(REPLACE(title, 'Rollwish', 'Rollapp'), 'rollwish', 'rollapp'),
           body=REPLACE(REPLACE(body, 'Rollwish', 'Rollapp'), 'rollwish', 'rollapp')`,
    );
    await targetClient.query(
      `UPDATE users SET email=REPLACE(email, '@rollwish.ru', '@rollapp.test')
       WHERE email LIKE '%@rollwish.ru'`,
    );

    await sourceClient.query("COMMIT");
    await targetClient.query("INSERT INTO app_migrations (key) VALUES ($1)", [migrationKey]);
    await targetClient.query("COMMIT");
    console.log("Database migration completed and verified");
  } catch (error) {
    await Promise.allSettled([
      sourceClient.query("ROLLBACK"),
      targetClient.query("ROLLBACK"),
    ]);
    throw error;
  } finally {
    await sourceClient.end().catch(() => {});
    targetClient.release();
  }
}
