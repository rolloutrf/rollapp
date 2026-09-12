import { randomUUID } from "node:crypto";
import { Address, beginCell, Cell, loadTransaction } from "@ton/core";
import { z } from "zod";
import { ensureRollWallet, RollsError } from "./rolls.js";
import { ROLLS_MAX_BALANCE } from "../shared/rolls.js";
import { TON_MAINNET } from "../shared/ton.js";
import { createRateLimit } from "./rate-limit.js";
import { tonFetch } from "./ton-network.js";

export function getTonRollsConfig(env = process.env) {
  try {
    const receiver = Address.parseFriendly(env.TON_ROLLS_RECEIVER || "");
    const rate = Number(env.TON_ROLLS_PER_TON);
    if (receiver.isTestOnly || !Number.isSafeInteger(rate) || rate < 1 || rate > 1_000_000) throw new Error();
    return { enabled: env.TON_ROLLS_ENABLED === "true", recipient: receiver.address.toRawString(), rate, chain: TON_MAINNET };
  } catch { return { enabled: false }; }
}

export function quoteTonRolls(rolls, rate) {
  return ((BigInt(rolls) * 1_000_000_000n + BigInt(rate) - 1n) / BigInt(rate)).toString();
}

export function publicTonOrder(row) {
  return {
    id: row.id, rolls: Number(row.rolls), nanotons: String(row.nanotons), sender: row.sender,
    recipient: row.recipient, chain: row.chain, expiresAt: row.expires_at,
    status: row.paid_at ? "paid" : new Date(row.expires_at).getTime() <= Date.now() ? "expired" : "pending",
    transactionHash: row.transaction_hash || null,
    transaction: {
      validUntil: Math.floor(new Date(row.expires_at).getTime() / 1000), network: row.chain, from: row.sender,
      messages: [{ address: Address.parse(row.recipient).toString({ bounceable: false }), amount: String(row.nanotons),
        payload: beginCell().storeUint(0, 32).storeStringTail(`rollapp:${row.id}`).endCell().toBoc().toString("base64") }],
    },
  };
}

const inputSchema = z.object({
  rolls: z.union([z.literal(100), z.literal(500), z.literal(1000)]),
  sender: z.string().regex(/^0:[a-f0-9]{64}$/i), chain: z.literal(TON_MAINNET), idempotencyKey: z.string().uuid(),
  acceptedTerms: z.literal(true),
}).strict();

export async function createTonOrder(client, userId, input, config) {
  if (!config.enabled) throw new RollsError("Пополнение за TON пока недоступно.", "TON_DISABLED", 503);
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new RollsError("Выберите пакет, основную сеть и примите условия.", "INVALID_TON_ORDER");
  const { rolls, chain, idempotencyKey } = parsed.data;
  const sender = Address.parse(parsed.data.sender).toRawString();
  if (sender === config.recipient) throw new RollsError("Кошелёк магазина не может пополнять роллы переводом самому себе. Подключите другой кошелёк.", "TON_SELF_PAYMENT", 409);
  await ensureRollWallet(client, userId);
  const prior = await client.query("SELECT * FROM roll_ton_orders WHERE user_id=$1 AND idempotency_key=$2", [userId, idempotencyKey]);
  if (prior.rowCount) {
    const row = prior.rows[0];
    if (Number(row.rolls) !== rolls || row.sender !== sender) throw new RollsError("Запрос уже использован для другого пополнения.", "IDEMPOTENCY_CONFLICT", 409);
    return row;
  }
  const pending = await client.query("SELECT COUNT(*) AS count, COALESCE(SUM(rolls),0) AS reserved FROM roll_ton_orders WHERE user_id=$1 AND paid_at IS NULL AND expires_at > CURRENT_TIMESTAMP", [userId]);
  if (Number(pending.rows[0].count) >= 3) throw new RollsError("Уже есть неоплаченные счета. Дождитесь их оплаты или истечения срока.", "TON_PENDING_LIMIT", 409);
  const wallet = await client.query("SELECT balance FROM roll_wallets WHERE user_id=$1", [userId]);
  if (BigInt(wallet.rows[0].balance) + BigInt(pending.rows[0].reserved) + BigInt(rolls) > BigInt(ROLLS_MAX_BALANCE)) throw new RollsError("Кошелёк достиг лимита.", "BALANCE_LIMIT", 409);
  return (await client.query(`INSERT INTO roll_ton_orders (id,user_id,sender,recipient,chain,rolls,nanotons,rate,idempotency_key)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
  [randomUUID(), userId, sender, config.recipient, chain, rolls, quoteTonRolls(rolls, config.rate), config.rate, idempotencyKey])).rows[0];
}

// Only blockchain data fetched by the server reaches this function. A client's
// sendTransaction result or transaction hash is never evidence of payment.
export function receiptFromTransaction(tx, recipient) {
  const info = tx.inMessage?.info;
  if (tx.description.type !== "generic" || tx.description.aborted || tx.description.destroyed
      || info?.type !== "internal" || info.bounced || !info.dest.equals(Address.parse(recipient))
      || tx.address !== BigInt(`0x${info.dest.hash.toString("hex")}`)) return null;
  try {
    const body = tx.inMessage.body.beginParse();
    if (body.loadUint(32) !== 0) return null;
    const comment = body.loadStringTail();
    if (!/^rollapp:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(comment)) return null;
    return { orderId: comment.slice(8), sender: info.src.toRawString(), recipient: info.dest.toRawString(),
      nanotons: info.value.coins.toString(), time: tx.now, hash: tx.hash().toString("hex") };
  } catch { return null; }
}

export async function settleTonReceipt(client, receipt, chain = TON_MAINNET) {
  const found = await client.query("SELECT * FROM roll_ton_orders WHERE id=$1", [receipt.orderId]);
  if (!found.rowCount) return false;
  await ensureRollWallet(client, found.rows[0].user_id);
  const row = (await client.query("SELECT * FROM roll_ton_orders WHERE id=$1 FOR UPDATE", [receipt.orderId])).rows[0];
  if (row.paid_at) return row.transaction_hash === receipt.hash;
  if (row.chain !== chain || row.sender !== receipt.sender || row.recipient !== receipt.recipient
      || row.sender === row.recipient || BigInt(row.nanotons) !== BigInt(receipt.nanotons)
      || receipt.time < Math.floor(new Date(row.created_at).getTime() / 1000) - 30
      || receipt.time > Math.floor(new Date(row.expires_at).getTime() / 1000) + 60) return false;
  const credited = await client.query("UPDATE roll_wallets SET balance=balance+$1 WHERE user_id=$2 AND balance <= $3 RETURNING balance",
    [row.rolls, row.user_id, ROLLS_MAX_BALANCE - Number(row.rolls)]);
  if (!credited.rowCount) throw new RollsError("Кошелёк достиг лимита. Обратитесь в поддержку.", "BALANCE_LIMIT", 409);
  // Unique transaction index + the same DB transaction makes credit exactly once.
  await client.query("UPDATE roll_ton_orders SET paid_at=CURRENT_TIMESTAMP,transaction_hash=$2 WHERE id=$1", [row.id, receipt.hash]);
  return true;
}

export function startTonPaymentPolling({ query, transaction, env = process.env, fetchImpl = tonFetch }) {
  if (env.TON_ROLLS_WORKER_ENABLED !== "true") return { stop() {} };
  let running = false;
  let stopped = false;
  let controller;
  const cursors = new Map();
  async function tick() {
    if (running || stopped) return;
    running = true;
    try {
      // Expired invoices remain observable: a delayed indexer must not lose a
      // payment that was included on-chain while its invoice was valid.
      const groups = await query(`SELECT recipient,chain,MIN(created_at) AS oldest FROM roll_ton_orders
        WHERE paid_at IS NULL GROUP BY recipient,chain ORDER BY MIN(created_at)`);
      const activeKeys = new Set(groups.rows.map((group) => `${group.chain}:${group.recipient}`));
      for (const key of cursors.keys()) if (!activeKeys.has(key)) cursors.delete(key);
      for (const group of groups.rows) {
        if (stopped) break;
        const key = `${group.chain}:${group.recipient}`;
        const cursor = cursors.get(key);
        const url = new URL("https://toncenter.com/api/v2/getTransactions");
        url.searchParams.set("address", group.recipient);
        url.searchParams.set("limit", "100");
        url.searchParams.set("archival", "true");
        if (cursor) { url.searchParams.set("lt", cursor.lt); url.searchParams.set("hash", cursor.hash); }
        controller = new AbortController();
        const response = await fetchImpl(url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]), redirect: "error",
          headers: { Accept: "application/json", ...(env.TONCENTER_API_KEY ? { "X-API-Key": env.TONCENTER_API_KEY } : {}) } });
        if (!response.ok) { await response.body?.cancel(); throw new Error("TON history unavailable"); }
        const body = await response.json();
        if (body.ok !== true || !Array.isArray(body.result)) throw new Error("Invalid TON history");
        let oldest = Infinity;
        for (const item of body.result) {
          const cell = Cell.fromBase64(item.data);
          const tx = loadTransaction(cell.beginParse());
          if (cell.hash().toString("base64") !== item.transaction_id.hash) throw new Error("Invalid transaction hash");
          oldest = Math.min(oldest, tx.now);
          const receipt = receiptFromTransaction(tx, group.recipient);
          if (receipt) await transaction((client) => settleTonReceipt(client, receipt, group.chain));
        }
        const last = body.result.at(-1)?.transaction_id;
        if (body.result.length < 100 || oldest < new Date(group.oldest).getTime() / 1000 - 30 || (cursor?.lt === last?.lt)) cursors.delete(key);
        else cursors.set(key, last);
      }
    } catch { if (!stopped) console.error("[ton-payments] Blockchain verification unavailable; payments will be retried."); }
    finally { running = false; }
  }
  const timer = setInterval(tick, 30_000);
  timer.unref();
  tick();
  return { stop() { stopped = true; clearInterval(timer); controller?.abort(); } };
}

export function registerTonRollsRoutes(app, { requireAuth, query, transaction, config = getTonRollsConfig }) {
  const limit = createRateLimit({ windowMs: 60_000, max: 20, key: (req) => req.user.id });
  const handle = (fn) => async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    try { await fn(req, res); }
    catch (error) { if (error instanceof RollsError) res.status(error.status).json({ error: error.message, code: error.code }); else next(error); }
  };
  app.get("/api/rolls/ton", requireAuth, handle(async (_req, res) => {
    res.json({ ...config(), packages: [100, 500, 1000] });
  }));
  app.get("/api/rolls/ton/orders", requireAuth, handle(async (req, res) => {
    const rows = await query("SELECT * FROM roll_ton_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10", [req.user.id]);
    res.json({ orders: rows.rows.map(publicTonOrder) });
  }));
  app.post("/api/rolls/ton/orders", requireAuth, limit, handle(async (req, res) => {
    const order = await transaction((client) => createTonOrder(client, req.user.id, req.body, config()));
    res.json({ order: publicTonOrder(order) });
  }));
}
