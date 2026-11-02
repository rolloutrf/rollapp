export const NEED_REWARDS_VERSION = "1";
export const NEED_REWARDS_MAX_AMOUNT = 1_000_000;
export const NEED_REWARDS_HOLD_DAYS = 7;
export const NEED_REWARDS_OFFER_DAYS = 7;
export const NEED_REWARDS_STATUSES = {
  offered: "Новое предложение", accepted: "В работе", delivered: "Ожидает подтверждения",
  confirmed: "На проверке", settled: "Награда получена", declined: "Отклонено",
  cancelled: "Отменено", disputed: "Открыт спор",
};

// Actions are a shared presentation contract; the server independently checks
// ownership and locks the current database state before applying any action.
export function needRewardActions(offer, business, now = Date.now()) {
  const expired = new Date(offer.expiresAt).getTime() <= now;
  if (business) {
    if (offer.status === "offered") return ["cancel"];
    if (offer.status === "accepted") return ["deliver", "cancel"];
    return [];
  }
  if (offer.status === "offered") return expired ? ["decline"] : ["accept", "decline"];
  if (offer.status === "accepted") return ["dispute"];
  if (offer.status === "delivered") return ["confirm", "dispute"];
  if (offer.status === "confirmed") return new Date(offer.claimAt).getTime() <= now ? ["claim", "dispute"] : ["dispute"];
  return [];
}

export const NEED_REWARD_ACTION_LABELS = {
  accept: "Принять", decline: "Отклонить", cancel: "Отменить",
  deliver: "Результат передан", confirm: "Подтвердить результат", claim: "Получить роллы", dispute: "Открыть спор",
};
