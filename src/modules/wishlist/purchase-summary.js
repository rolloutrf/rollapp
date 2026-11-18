import { isPlanningDate } from "../../../shared/modules/planning/planning.js";
import { addCalendarDays } from "../../../shared/modules/calendar/planning-calendar.js";

export function summarizePurchases(plans, today) {
  const overdue = [];
  const upcoming = [];
  const scheduled = plans.filter(({ dueOn }) => isPlanningDate(dueOn))
    .sort((left, right) => left.dueOn.localeCompare(right.dueOn) || left.title.localeCompare(right.title, "ru") || left.id.localeCompare(right.id));

  for (const plan of scheduled) {
    if (plan.dueOn < today) overdue.push(plan);
    else upcoming.push(plan);
  }

  return { overdue, upcoming };
}

export function forecastPurchases(plans, subscriptions, today) {
  const end = addCalendarDays(today, 29);
  const scheduled = [
    ...plans.map(({ id, title, dueOn, purchaseBudget, need }) => ({ id, title, date: dueOn, ...purchaseBudget,
      savedMinor: Math.min(purchaseBudget.minor, need?.savedMinor || 0), type: "purchase" })),
    ...subscriptions.filter(({ stopped }) => !stopped).map(({ id, title, chargeOn, currency, budgetMinor }) => ({
      id, title, date: chargeOn, currency, minor: budgetMinor, savedMinor: 0, type: "subscription",
    })),
  ].filter(({ date }) => isPlanningDate(date) && date <= end)
    .sort((left, right) => left.date.localeCompare(right.date) || left.title.localeCompare(right.title, "ru"));

  const byCurrency = new Map();
  for (const item of scheduled) {
    if (!byCurrency.has(item.currency)) byCurrency.set(item.currency, {
      currency: item.currency, scheduledMinor: 0, savedMinor: 0, overdueMinor: 0, items: [],
    });
    const totals = byCurrency.get(item.currency);
    const overdue = item.date < today;
    totals.items.push({ ...item, overdue });
    if (overdue) totals.overdueMinor += item.minor - item.savedMinor;
    else {
      totals.scheduledMinor += item.minor;
      totals.savedMinor += item.savedMinor;
    }
  }
  return { end, currencies: [...byCurrency.values()].sort((left, right) => left.currency.localeCompare(right.currency)) };
}
