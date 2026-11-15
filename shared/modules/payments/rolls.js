export const ROLLS_WELCOME_AMOUNT = 100;
export const ROLLS_WISH_REWARD_AMOUNT = 100;
export const ROLLS_WISH_REWARD_LIMIT = 10;
export const ROLLS_MAX_TRANSFER = 1_000_000_000;
export const ROLLS_MAX_BALANCE = Number.MAX_SAFE_INTEGER;

export function rollsLabel(amount) {
  const value = Math.abs(amount);
  if (value % 100 >= 11 && value % 100 <= 14) return "роллов";
  if (value % 10 === 1) return "ролл";
  if (value % 10 >= 2 && value % 10 <= 4) return "ролла";
  return "роллов";
}

export function formatRolls(amount) {
  return `${new Intl.NumberFormat("ru-RU").format(amount)} ${rollsLabel(amount)}`;
}
