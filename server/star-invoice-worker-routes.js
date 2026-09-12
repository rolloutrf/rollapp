import { getTelegramBotRuntimeConfig } from "./telegram-bot.js";
import { safeSecretEqual } from "./telegram-auth.js";
import { isStarInvoiceUrl } from "../shared/roll-stars.js";

// Same trusted worker and authentication boundary as payment update delivery.
// Only invoice metadata crosses this boundary, never customer identities.
export function registerStarInvoiceWorkerRoutes(app, { query, starsConfig, botConfig = getTelegramBotRuntimeConfig }) {
  const handle = (handler) => async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const config = botConfig();
    if (!config.webhookEnabled || starsConfig().invoiceDelivery !== "worker") return res.sendStatus(404);
    if (!safeSecretEqual(String(req.get("X-Telegram-Bot-Api-Secret-Token") || ""), config.webhookSecret)) return res.sendStatus(401);
    try { await handler(req, res); } catch (error) { next(error); }
  };
  app.get("/api/telegram/star-invoices", handle(async (_req, res) => {
    if (!starsConfig().enabled) return res.json({ orders: [] });
    const result = await query(`SELECT id,rolls,stars FROM roll_star_orders
      WHERE invoice_url IS NULL AND paid_at IS NULL AND checkout_query_id IS NULL
        AND expires_at > CURRENT_TIMESTAMP ORDER BY created_at LIMIT 10`);
    res.json({ orders: result.rows.map(({ id, rolls, stars }) => ({ id, rolls: Number(rolls), stars })) });
  }));
  app.post("/api/telegram/star-invoices/:orderId", handle(async (req, res) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.orderId)
      || !isStarInvoiceUrl(req.body?.invoiceUrl)) return res.sendStatus(400);
    // First successful delivery wins. Retried delivery cannot replace a link,
    // alter a price, approve checkout or credit the wallet.
    const result = await query(`UPDATE roll_star_orders SET invoice_url=COALESCE(invoice_url,$2)
      WHERE id=$1 AND paid_at IS NULL AND checkout_query_id IS NULL
        AND expires_at > CURRENT_TIMESTAMP RETURNING id`, [req.params.orderId, req.body.invoiceUrl]);
    res.status(result.rowCount ? 200 : 409).json({ ok: Boolean(result.rowCount) });
  }));
}
