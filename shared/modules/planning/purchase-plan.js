import { addCalendarDays } from "../calendar/planning-calendar.js";

export const MAX_PURCHASE_BUDGET_MINOR = 99_999_999_999;
export const MAX_REPLENISHMENT_DAYS = 365;
export const MAX_PURCHASE_VARIANTS = 3;
export const PURCHASE_REVIEW_LABELS = { bought: "Куплено", declined: "Отказ от покупки" };
export const PURCHASE_DELIVERY_COUNTRIES = ["RU", "BY", "KZ", "AM", "GE", "DE", "FR", "GB", "US"];

export function purchaseBudgetMinor(input, { allowZero = false } = {}) {
  const match = /^(\d{1,9})(?:[,.](\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  const amount = Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
  return amount > 0 || allowZero ? amount : null;
}

export function plannedPurchaseItem(task) {
  return task?.relatedItems?.find((item) => item.kind === "wishlist" && item.purchaseBudget);
}

export const purchaseTaskId = (wishId) => `purchase-plan:${wishId}`;

export function openPurchaseItem(task) {
  const purchase = plannedPurchaseItem(task);
  return purchase && !purchase.purchaseReview && purchaseTaskId(purchase.id) === task.id ? purchase : null;
}

export function purchaseProductId(purchase) {
  if (purchase.need) return purchase.need.preferredWishId || purchase.need.lastWishId || null;
  return purchase.replenishment?.wishId || purchase.id;
}

export function nextReplenishmentDate(date, intervalDays, after = date) {
  const daysSinceDue = (Date.parse(after) - Date.parse(date)) / 86_400_000;
  const cycles = Math.max(1, Math.floor(daysSinceDue / intervalDays) + 1);
  return addCalendarDays(date, cycles * intervalDays);
}

export function formatPurchaseBudget({ minor, currency }) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency, minimumFractionDigits: minor % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(minor / 100);
}
