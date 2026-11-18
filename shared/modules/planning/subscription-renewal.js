import { addCalendarDays, dateFromKey } from "../calendar/planning-calendar.js";
import { localDateKey } from "./planning.js";

export const SUBSCRIPTION_PERIODS = [1, 3, 12];
export const SUBSCRIPTION_LEAD_DAYS = [0, 1, 3, 7, 14];
export const subscriptionTaskId = (userId, id) => `subscription-renewal:${userId}:${id}`;

export function subscriptionItem(task) {
  const item = task?.relatedItems?.find(({ kind }) => kind === "subscription-renewal");
  return item && task.id.startsWith("subscription-renewal:") && task.id.endsWith(`:${item.id}`) ? item : null;
}

export function subscriptionReminderOn({ chargeOn, leadDays }) {
  return addCalendarDays(chargeOn, -leadDays);
}

export function nextSubscriptionCharge({ chargeOn, intervalMonths, anchorDay }) {
  const next = dateFromKey(chargeOn);
  next.setDate(1);
  next.setMonth(next.getMonth() + intervalMonths);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(anchorDay, lastDay));
  return localDateKey(next);
}
