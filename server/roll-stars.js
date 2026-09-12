import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ROLL_STAR_PACKAGES, ROLL_STAR_TERMS_VERSION } from "../shared/roll-stars.js";
import { ROLLS_MAX_BALANCE } from "../shared/rolls.js";
import { ensureRollWallet, RollsError } from "./rolls.js";
import { callTelegramBotApi, getTelegramBotRuntimeConfig } from "./telegram-bot.js";

export const starOrderInput = z.object({
  packageId: z.enum(ROLL_STAR_PACKAGES.map((item) => item.id)),
  idempotencyKey: z.string().uuid(),
  termsVersion: z.literal(ROLL_STAR_TERMS_VERSION),
}).strict();

export function getStarsConfig(env = process.env) {
  const bot = getTelegramBotRuntimeConfig(env);
  let supportUrl = "";
  try {
    const url = new URL(env.TELEGRAM_PAYMENT_SUPPORT_URL || "https://t.me/koloskof");
    if (["https:", "mailto:"].includes(url.protocol)) supportUrl = url.href;
  } catch { /* Sales stay disabled until payment support is configured. */ }
  return {
    enabled: bot.enabled && (bot.deliveryMode === "polling" || bot.webhookEnabled)
      && Boolean(supportUrl) && env.TELEGRAM_STARS_ENABLED !== "false",
    supportUrl,
    botUrl: `https://t.me/${bot.botUsername}`,
  };
}

export function publicStarOrder(row) {
  return {
    id: row.id, rolls: Number(row.rolls), stars: row.stars,
    status: row.paid_at ? "paid" : row.checkout_query_id ? "processing"
      : new Date(row.expires_at).getTime() <= Date.now() ? "expired" : "pending",
    invoiceUrl: row.invoice_url, expiresAt: row.expires_at,
  };
}

export async function createStarOrder(client, userId, input) {
  const parsed = starOrderInput.safeParse(input);
  if (!parsed.success) throw new RollsError("Выберите пакет и примите условия покупки", "INVALID_STAR_ORDER");
  const { packageId, idempotencyKey, termsVersion } = parsed.data;
  const identity = await client.query("SELECT telegram_user_id FROM telegram_identities WHERE user_id=$1", [userId]);
  if (!identity.rowCount) throw new RollsError("Откройте Rollapp из Telegram и привяжите свой аккаунт", "TELEGRAM_LINK_REQUIRED", 409);
  await ensureRollWallet(client, userId);
  const existing = await client.query("SELECT * FROM roll_star_orders WHERE user_id=$1 AND idempotency_key=$2", [userId, idempotencyKey]);
  if (existing.rowCount) {
    if (existing.rows[0].package_id !== packageId) throw new RollsError("Этот запрос уже использован для другого пакета", "IDEMPOTENCY_CONFLICT", 409);
    return existing.rows[0];
  }
  const pack = ROLL_STAR_PACKAGES.find((item) => item.id === packageId);
  const wallet = await client.query("SELECT balance FROM roll_wallets WHERE user_id=$1", [userId]);
  if (Number(wallet.rows[0].balance) > ROLLS_MAX_BALANCE - pack.rolls) throw new RollsError("Кошелёк достиг лимита", "BALANCE_LIMIT", 409);
  const result = await client.query(
    `INSERT INTO roll_star_orders (id,user_id,telegram_user_id,package_id,rolls,stars,idempotency_key,terms_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [randomUUID(), userId, identity.rows[0].telegram_user_id, packageId, pack.rolls, pack.stars, idempotencyKey, termsVersion],
  );
  return result.rows[0];
}

export async function createStarInvoice(order, config = getTelegramBotRuntimeConfig(), callApi = callTelegramBotApi) {
  const url = await callApi("createInvoiceLink", {
    title: `${order.rolls} роллов`,
    description: `Пополнение баланса Rollapp на ${order.rolls} роллов. Разовая покупка.`,
    payload: `rolls:${order.id}`, provider_token: "", currency: "XTR",
    prices: [{ label: `${order.rolls} роллов`, amount: order.stars }],
  }, config);
  if (typeof url !== "string" || !/^https:\/\/t\.me\/\$[A-Za-z0-9_-]+$/.test(url)) throw new Error("Telegram returned an invalid invoice URL");
  return url;
}

function paymentOrderId(payment) {
  const payload = payment?.invoice_payload;
  if (typeof payload !== "string" || !/^rolls:[0-9a-f-]{36}$/.test(payload)) throw new RollsError("Счёт не найден", "STAR_ORDER_NOT_FOUND", 404);
  return payload.slice(6);
}

function validatePayment(row, payment, payerId) {
  if (!row) throw new RollsError("Счёт не найден", "STAR_ORDER_NOT_FOUND", 404);
  if (!Number.isSafeInteger(payerId) || String(payerId) !== row.telegram_user_id) throw new RollsError("Оплатите из Telegram-аккаунта, привязанного к Rollapp", "STAR_PAYER_MISMATCH", 403);
  if (payment.currency !== "XTR" || payment.total_amount !== row.stars) throw new RollsError("Сумма счёта изменилась. Создайте новый счёт", "STAR_AMOUNT_MISMATCH", 409);
}

export async function approveStarCheckout(client, checkout) {
  const id = paymentOrderId(checkout);
  if (typeof checkout.id !== "string" || !checkout.id || checkout.id.length > 200) throw new RollsError("Некорректный запрос оплаты", "INVALID_CHECKOUT");
  const result = await client.query("SELECT * FROM roll_star_orders WHERE id=$1 FOR UPDATE", [id]);
  const row = result.rows[0];
  validatePayment(row, checkout, checkout.from?.id);
  if (row.paid_at) throw new RollsError("Этот счёт уже оплачен", "STAR_ORDER_PAID", 409);
  if (row.checkout_query_id && row.checkout_query_id !== checkout.id) throw new RollsError("Этот счёт уже использован. Проверьте баланс и создайте новый", "STAR_CHECKOUT_USED", 409);
  if (new Date(row.expires_at).getTime() <= Date.now()) throw new RollsError("Срок счёта истёк. Создайте новый", "STAR_ORDER_EXPIRED", 409);
  const wallet = await client.query("SELECT balance FROM roll_wallets WHERE user_id=$1", [row.user_id]);
  if (Number(wallet.rows[0].balance) > ROLLS_MAX_BALANCE - Number(row.rolls)) throw new RollsError("Кошелёк достиг лимита", "BALANCE_LIMIT", 409);
  await client.query("UPDATE roll_star_orders SET checkout_query_id=$2 WHERE id=$1", [id, checkout.id]);
}

// Only call from the authenticated Telegram update receiver. Client-side invoice
// callbacks are never proof of payment. The caller commits credit + receipt together.
export async function settleStarPayment(client, message) {
  const payment = message?.successful_payment;
  const id = paymentOrderId(payment);
  const charge = payment.telegram_payment_charge_id;
  if (typeof charge !== "string" || !charge || charge.length > 512) throw new RollsError("Некорректный идентификатор оплаты", "INVALID_STAR_CHARGE");
  const found = await client.query("SELECT * FROM roll_star_orders WHERE id=$1", [id]);
  validatePayment(found.rows[0], payment, message.from?.id);
  // Wallet first matches the lock order of other Rolls operations.
  await ensureRollWallet(client, found.rows[0].user_id);
  const row = (await client.query("SELECT * FROM roll_star_orders WHERE id=$1 FOR UPDATE", [id])).rows[0];
  if (row.paid_at) {
    if (row.telegram_payment_charge_id !== charge) throw new RollsError("У заказа уже есть другая оплата", "STAR_CHARGE_CONFLICT", 409);
    return { ...publicStarOrder(row), replayed: true };
  }
  if (!row.checkout_query_id) throw new RollsError("Оплата не прошла проверку счёта", "STAR_CHECKOUT_REQUIRED", 409);
  const used = await client.query("SELECT id FROM roll_star_orders WHERE telegram_payment_charge_id=$1", [charge]);
  if (used.rowCount) throw new RollsError("Оплата уже учтена", "STAR_CHARGE_CONFLICT", 409);
  const credit = await client.query("UPDATE roll_wallets SET balance=balance+$1 WHERE user_id=$2 AND balance <= $3 RETURNING balance", [row.rolls, row.user_id, ROLLS_MAX_BALANCE - Number(row.rolls)]);
  if (!credit.rowCount) throw new RollsError("Кошелёк достиг лимита. Обратитесь в поддержку", "BALANCE_LIMIT", 409);
  const paid = await client.query("UPDATE roll_star_orders SET telegram_payment_charge_id=$2,paid_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *", [id, charge]);
  return { ...publicStarOrder(paid.rows[0]), replayed: false };
}

export function createStarsUpdateHandler({ transaction, config = getStarsConfig }) {
  return async (update) => {
    if (update?.pre_checkout_query) {
      const checkout = update.pre_checkout_query;
      let errorMessage = "";
      try {
        if (!config().enabled) throw new RollsError("Покупка роллов временно недоступна", "STARS_UNAVAILABLE", 503);
        await transaction(async (client) => {
          await client.query("SET LOCAL statement_timeout='2s'");
          await client.query("SET LOCAL lock_timeout='1s'");
          await approveStarCheckout(client, checkout);
        });
      } catch (error) {
        errorMessage = error instanceof RollsError ? error.message : "Не удалось проверить счёт. Попробуйте позже";
      }
      return { method: "answerPreCheckoutQuery", pre_checkout_query_id: checkout.id, ok: !errorMessage, ...(errorMessage ? { error_message: errorMessage } : {}) };
    }
    if (update?.message?.successful_payment) {
      // Continue to settle accepted payments even when new sales are disabled.
      await transaction((client) => settleStarPayment(client, update.message));
      return { ok: true, paymentProcessed: true };
    }
    return null;
  };
}
