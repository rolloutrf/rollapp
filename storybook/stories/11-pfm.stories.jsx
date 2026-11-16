import { RollsActivity } from "@/modules/pfm/rolls-activity.jsx";
import { Page, Scenario, fixtureError, hold } from "../support.jsx";
import { ledger, ledgerReceipts } from "../samples.js";

export default { id: "rollapp-pfm", title: "РОЛЛАПП/Модули РОЛЛАУТ/11 PFM" };

function Report({ state }) {
  const routes = {
    ...ledgerReceipts,
    "GET /rolls/activity": (path) => {
      if (state === "loading") return hold();
      if (state === "error") throw fixtureError("Сводка временно недоступна.");
      const days = Number(new URL(path, "http://storybook.local").searchParams.get("days"));
      const starts = new Date(Date.UTC(2026, 10, 17 - days));
      const period = { days, startsOn: starts.toISOString().slice(0, 10), endsOn: "2026-11-16", asOf: "2026-11-16T12:00:00Z", timeZone: "Europe/Moscow" };
      const totals = state === "empty" || days === 7 ? { count: 0, received: "0", debited: "0", change: "0" } : { count: 5, received: "700", debited: "350", change: "350" };
      return { period, totals, groups: totals.count ? [{ group: "payments", ...totals }] : [] };
    },
    "GET /rolls/activity/entries": { transactions: state === "empty" ? [] : ledger, next: null },
  };
  return <Scenario routes={routes}><Page title="Сводка по роллам"><RollsActivity /></Page></Scenario>;
}
export const Summary = { name: "Сводка, периоды и выписка", render: Report, args: { state: "ready" } };
export const Empty = { ...Summary, name: "Период без операций", args: { state: "empty" } };
export const Loading = { ...Summary, name: "Загрузка сводки", args: { state: "loading" } };
export const Error = { ...Summary, name: "Ошибка сводки", args: { state: "error" } };
