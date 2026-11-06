import { productionRollsDatabase } from "./rolls-database.mjs";
import { inviteSchema, MEMBER_LIMIT } from "../server/invites.js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: false, quiet: true });

// Explicit, additive production operation. Never run from dev or release startup.
const expectedUsername = "koloskof";
const apply = process.argv.includes("--apply");

const db = await productionRollsDatabase();
try {
  const review = await db.transaction(async client => {
    await client.query("SET TRANSACTION READ ONLY");
    await client.query("SET LOCAL statement_timeout='10s'");
    const owner = await client.query("SELECT COUNT(*)::int AS count FROM users WHERE username=$1", [expectedUsername]);
    const users = await client.query("SELECT COUNT(*)::int AS count FROM users");
    const schema = await client.query("SELECT to_regclass('account_invites') IS NOT NULL AS invites,to_regclass('membership_receipts') IS NOT NULL AS receipts");
    const tableOwner = await client.query("SELECT pg_get_userbyid(relowner) AS role FROM pg_class WHERE oid='users'::regclass");
    return { database: db.target.database, role: db.target.role, tableOwner: tableOwner.rows[0].role,
      users: users.rows[0].count, ownerMatches: owner.rows[0].count, ...schema.rows[0] };
  });
  if (review.ownerMatches !== 1) throw new Error("В production-базе не найден ровно один профиль @koloskof.");
  if (review.users > MEMBER_LIMIT) throw new Error("Текущих аккаунтов уже больше 30 000. Нужен отдельный план.");
  if (review.tableOwner !== review.role) throw new Error("Настроенная роль не владеет таблицей users.");
  if (!apply) {
    console.log(JSON.stringify({ mode: "read-only", ...review }));
  } else {
    await db.transaction(async client => {
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='30s'");
      const owner = await client.query("SELECT id,username FROM users WHERE username=$1", [expectedUsername]);
      if (owner.rowCount !== 1 || owner.rows[0].username !== expectedUsername) throw new Error("В production-базе не найден подтверждённый владелец @koloskof.");
      const count = await client.query("SELECT COUNT(*) AS count FROM users");
      if (Number(count.rows[0].count) > MEMBER_LIMIT) throw new Error("Текущих аккаунтов уже больше 30 000. Нужен отдельный план.");
      await client.query(inviteSchema);
      await client.query("ALTER TABLE yandex_oauth_attempts ADD COLUMN IF NOT EXISTS invite_token_hash TEXT");
      await client.query(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_member_number_range' AND conrelid='users'::regclass) THEN
          ALTER TABLE users ADD CONSTRAINT users_member_number_range CHECK (member_number BETWEEN 1 AND 30000);
        END IF;
      END $$`);
      await client.query("UPDATE users SET can_invite=TRUE WHERE id=$1 AND username=$2", [owner.rows[0].id, expectedUsername]);
    });
    console.log("Схема приглашений готова; право отправки выдано проверенному аккаунту.");
  }
} finally {
  await db.pool.end();
}
