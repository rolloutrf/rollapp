export const ROLL_STAR_PACKAGES = Object.freeze([
  Object.freeze({ id: "rolls-100", rolls: 100, stars: 10 }),
  Object.freeze({ id: "rolls-500", rolls: 500, stars: 50 }),
  Object.freeze({ id: "rolls-1000", rolls: 1000, stars: 100 }),
]);

export const ROLL_STAR_TERMS_VERSION = "2026-09-12";
export function isStarInvoiceUrl(value) {
  return typeof value === "string" && /^https:\/\/t\.me\/\$[A-Za-z0-9_-]+$/.test(value);
}

export function starInvoicePayload(order) {
  return {
    title: `${order.rolls} роллов`,
    description: `Пополнение баланса Rollapp на ${order.rolls} роллов. Разовая покупка.`,
    payload: `rolls:${order.id}`, provider_token: "", currency: "XTR",
    prices: [{ label: `${order.rolls} роллов`, amount: order.stars }],
  };
}
export const ROLL_STAR_TERMS = "Роллы — внутренние баллы Rollapp. 100 роллов стоят 10 Telegram Stars. Это разовая покупка без подписки. Роллы начисляются после подтверждения оплаты Telegram. По вопросам оплаты и возвратов обратитесь в поддержку, указав номер заказа.";
