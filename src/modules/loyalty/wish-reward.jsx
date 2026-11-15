import { formatRolls } from "../../../shared/modules/payments/rolls.js";

export function withWishReward(message, reward) {
  if (!reward?.granted) return message;
  return `${message} · +${formatRolls(reward.amount)} (${reward.ordinal} из ${reward.limit})`;
}
