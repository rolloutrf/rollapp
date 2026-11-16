import { parseArgs } from "node:util";
import { productionRollsDatabase } from "./rolls-database.mjs";
import { grantRolls, previewRollGrant, rollGrantSchema } from "../server/modules/loyalty/roll-rewards.js";

const { values } = parseArgs({ options: {
  "user-id": { type: "string" }, amount: { type: "string" }, reason: { type: "string" },
  "idempotency-key": { type: "string" }, apply: { type: "boolean" },
} });
const userId = values["user-id"]?.trim();
const amount = values.amount?.trim();
const terms = rollGrantSchema.safeParse({
  amount: /^\d+$/.test(amount ?? "") ? Number(amount) : undefined, reason: values.reason?.trim() || "Ручное начисление",
  idempotencyKey: values["idempotency-key"],
});
if (!userId || !terms.success) {
  throw new Error("Укажите --user-id, положительное целое --amount и --idempotency-key.");
}

const db = await productionRollsDatabase();
try {
  const preview = await db.transaction(async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    return previewRollGrant(client, userId, terms.data, { includeIssuanceImpact: true });
  });
  const { account, ...forecast } = preview;
  console.log(JSON.stringify({ database: db.target.database, role: db.target.role, target: account, ...forecast }));
  if (!values.apply) {
    console.log("Предпросмотр. Добавьте --apply для начисления.");
    process.exitCode = 2;
  } else {
    const result = await db.transaction(async (client) => {
      const applied = await grantRolls(client, userId, terms.data);
      const verification = await previewRollGrant(client, userId, terms.data);
      if (verification.existingGrantId !== applied.id || BigInt(verification.account.balance) !== BigInt(applied.balance)) {
        throw new Error("Проверка начисления не прошла.");
      }
      return {
        ...applied,
        verification: {
          balance: verification.account.balance, id: verification.existingGrantId, amount: String(verification.amount),
          reason: verification.reason, idempotency_key: terms.data.idempotencyKey,
        },
      };
    });
    console.log(JSON.stringify({ applied: true, ...result }));
  }
} finally {
  await db.pool.end();
}
