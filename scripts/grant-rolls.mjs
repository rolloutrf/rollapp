import { productionRollsDatabase } from "./rolls-database.mjs";
import { grantRolls, rollsSchema } from "../server/rolls.js";

const args = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith("--") && arg.includes("="))
  .map((arg) => arg.slice(2).split(/=(.*)/s, 2)));
const apply = process.argv.includes("--apply");
const userId = args["user-id"]?.trim();
const amount = Number(args.amount);
const reason = args.reason?.trim() || "Ручное начисление";
const idempotencyKey = args["idempotency-key"]?.trim();

if (!userId || !Number.isSafeInteger(amount) || amount < 1 || !idempotencyKey) {
  throw new Error("Укажите --user-id, положительное целое --amount и --idempotency-key.");
}

const db = await productionRollsDatabase();
try {
  const target = await db.query(
    `SELECT u.id,u.name,u.username,coalesce(w.balance,0)::text AS balance
     FROM users u LEFT JOIN roll_wallets w ON w.user_id=u.id WHERE u.id=$1`,
    [userId],
  );
  if (target.rowCount !== 1) throw new Error("Пользователь не найден в production-базе.");
  console.log(JSON.stringify({ database: db.target.database, role: db.target.role, target: target.rows[0], amount, reason }));
  if (!apply) {
    console.log("Без записи. Добавьте --apply для начисления.");
    process.exitCode = 2;
  } else {
    const result = await db.transaction(async (client) => {
      await client.query(rollsSchema);
      return grantRolls(client, userId, { amount, reason, idempotencyKey });
    });
    const verification = await db.query(
      `SELECT w.balance::text AS balance,g.id,g.amount::text AS amount,g.reason,g.idempotency_key
       FROM roll_wallets w JOIN roll_manual_grants g ON g.user_id=w.user_id
       WHERE w.user_id=$1 AND g.idempotency_key=$2`,
      [userId, idempotencyKey],
    );
    if (verification.rowCount !== 1 || Number(verification.rows[0].amount) !== amount) {
      throw new Error("Проверка начисления не прошла.");
    }
    console.log(JSON.stringify({ applied: true, ...result, verification: verification.rows[0] }));
  }
} finally {
  await db.pool.end();
}
