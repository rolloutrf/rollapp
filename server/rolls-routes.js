import { createRateLimit } from "./rate-limit.js";
import { purchaseWithRolls, readRollOrders, readRollWallet, refundRollPurchase, RollsError, transferRolls } from "./rolls.js";
import { createStarInvoice, createStarOrder, getStarsConfig, publicStarOrder } from "./roll-stars.js";
import { ROLL_STAR_PACKAGES, ROLL_STAR_TERMS, ROLL_STAR_TERMS_VERSION } from "../shared/roll-stars.js";
import { registerStarInvoiceWorkerRoutes } from "./star-invoice-worker-routes.js";

export function registerRollsRoutes(app, { requireAuth, query, transaction, starsConfig = getStarsConfig, createInvoice = createStarInvoice }) {
  registerStarInvoiceWorkerRoutes(app, { query, starsConfig });
  const handle = (handler) => async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    try { await handler(req, res); } catch (error) {
      if (error instanceof RollsError) return res.status(error.status).json({ error: error.message, code: error.code });
      next(error);
    }
  };
  const transferLimit = createRateLimit({ windowMs: 60_000, max: 20, key: (req) => req.user.id });
  const searchLimit = createRateLimit({ windowMs: 60_000, max: 60, key: (req) => req.user.id });

  app.get("/api/rolls/stars", requireAuth, handle(async (req, res) => {
    const config = starsConfig();
    const identity = await query("SELECT telegram_user_id FROM telegram_identities WHERE user_id=$1", [req.user.id]);
    res.json({ ...config, linked: Boolean(identity.rowCount), packages: ROLL_STAR_PACKAGES, terms: ROLL_STAR_TERMS, termsVersion: ROLL_STAR_TERMS_VERSION });
  }));

  app.post("/api/rolls/stars/orders", requireAuth, transferLimit, handle(async (req, res) => {
    if (!starsConfig().enabled) throw new RollsError("Покупка роллов временно недоступна", "STARS_UNAVAILABLE", 503);
    let order = await transaction((client) => createStarOrder(client, req.user.id, req.body));
    if (starsConfig().invoiceDelivery !== "worker" && !order.invoice_url && publicStarOrder(order).status === "pending") {
      let url;
      try { url = await createInvoice(order); }
      catch { throw new RollsError("Не удалось получить счёт Telegram. Повторите попытку", "STAR_INVOICE_UNAVAILABLE", 502); }
      // Commit before calling Telegram. All links for a retried request share
      // one payload; pre-checkout permits only one payment for this order.
      order = (await query("UPDATE roll_star_orders SET invoice_url=COALESCE(invoice_url,$2) WHERE id=$1 RETURNING *", [order.id, url])).rows[0];
    }
    res.json({ order: publicStarOrder(order) });
  }));

  app.get("/api/rolls/stars/orders/:orderId", requireAuth, handle(async (req, res) => {
    const result = await query("SELECT * FROM roll_star_orders WHERE id=$1 AND user_id=$2", [req.params.orderId, req.user.id]);
    if (!result.rowCount) throw new RollsError("Счёт не найден", "STAR_ORDER_NOT_FOUND", 404);
    res.json({ order: publicStarOrder(result.rows[0]) });
  }));

  app.get("/api/rolls", requireAuth, handle(async (req, res) => {
    const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) return res.status(400).json({ error: "Некорректная страница истории" });
    res.json(await transaction((client) => readRollWallet(client, req.user.id, { offset })));
  }));

  app.get("/api/rolls/recipients", requireAuth, searchLimit, handle(async (req, res) => {
    const search = typeof req.query.q === "string" ? req.query.q.trim().replace(/^@/, "") : "";
    if (search.length < 2 || search.length > 80) return res.json({ people: [] });
    // Escape LIKE wildcards. Never expose email, phone, or another user's balance.
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    const people = await query(
      `SELECT id,name,username,avatar_url AS "avatarUrl" FROM users
       WHERE id<>$1 AND (name ILIKE $2 OR username ILIKE $2)
       ORDER BY CASE WHEN lower(username)=lower($3) THEN 0 ELSE 1 END,name,id LIMIT 20`,
      [req.user.id, pattern, search],
    );
    res.json({ people: people.rows });
  }));

  app.post("/api/rolls/transfers", requireAuth, transferLimit, handle(async (req, res) => {
    const result = await transaction(async (client) => {
      const transfer = await transferRolls(client, req.user.id, req.body);
      return { transfer, ...await readRollWallet(client, req.user.id) };
    });
    res.status(result.transfer.replayed ? 200 : 201).json(result);
  }));

  app.post("/api/rolls/purchases", requireAuth, transferLimit, handle(async (req, res) => {
    const purchase = await transaction((client) => purchaseWithRolls(client, req.user.id, req.body));
    res.status(purchase.replayed ? 200 : 201).json({ purchase });
  }));

  app.get("/api/rolls/orders", requireAuth, handle(async (req, res) => {
    res.json(await transaction((client) => readRollOrders(client, req.user.id)));
  }));

  app.post("/api/rolls/orders/:purchaseId/refund", requireAuth, transferLimit, handle(async (req, res) => {
    const result = await transaction((client) => refundRollPurchase(client, req.user.id, req.params.purchaseId));
    res.status(200).json(result);
  }));
}
