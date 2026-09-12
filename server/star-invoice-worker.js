import { isStarInvoiceUrl, starInvoicePayload } from "../shared/roll-stars.js";
import { callTelegramBotApi } from "./telegram-bot.js";

export async function deliverStarInvoices(config, { fetchImpl = fetch, callApi = callTelegramBotApi } = {}) {
  if (!config.webhookEnabled) throw new Error("Invoice worker secret is not configured");
  const headers = { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": config.webhookSecret };
  const endpoint = new URL("/api/telegram/star-invoices", config.webAppUrl);
  const response = await fetchImpl(endpoint, { headers, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Invoice queue HTTP ${response.status}`);
  const { orders } = await response.json();
  if (!Array.isArray(orders) || orders.length > 10) throw new Error("Invalid invoice queue");
  for (const order of orders) {
    const invoiceUrl = await callApi("createInvoiceLink", starInvoicePayload(order), config);
    if (!isStarInvoiceUrl(invoiceUrl)) throw new Error("Invalid Telegram invoice URL");
    const saved = await fetchImpl(new URL(`${endpoint.pathname}/${encodeURIComponent(order.id)}`, endpoint), {
      method: "POST", headers, body: JSON.stringify({ invoiceUrl }), signal: AbortSignal.timeout(8_000),
    });
    // The order can expire while Telegram is creating its link.
    if (saved.status === 409) continue;
    if (!saved.ok || !(await saved.json()).ok) throw new Error(`Invoice delivery HTTP ${saved.status}`);
  }
}

export function startStarInvoiceWorker(config, { intervalMs = 2_000, ...dependencies } = {}) {
  let active = true;
  let timer;
  let wake;
  const done = (async () => {
    while (active) {
      try { await deliverStarInvoices(config, dependencies); }
      catch { console.error("[telegram-bot] Invoice delivery failed; will retry"); }
      if (active) await new Promise((resolve) => { wake = resolve; timer = setTimeout(resolve, intervalMs); });
    }
  })();
  return { done, stop() { active = false; clearTimeout(timer); wake?.(); } };
}
