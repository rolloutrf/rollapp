import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ControlBar } from "@/components/control-bar";
import { useAsync } from "@/modules/shell/use-async";
import { dateFromKey } from "../../../shared/modules/calendar/planning-calendar.js";
import { localDateKey } from "../../../shared/modules/planning/planning.js";
import { formatPurchaseBudget } from "../../../shared/modules/planning/purchase-plan.js";
import { PurchaseMonthLimits, readPurchaseMonth, WishPurchaseLimitEditor } from "./wish-purchase-limits.jsx";

const monthLabel = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" });

function shiftMonth(month, offset) {
  const date = dateFromKey(`${month}-01`);
  date.setMonth(date.getMonth() + offset);
  return localDateKey(date).slice(0, 7);
}

function MonthlyBudgetRow({ total }) {
  const { currency, plannedMinor, spentMinor, purchaseCount, missingAmountCount, missingBudgetCount } = total;
  const format = (minor) => formatPurchaseBudget({ minor, currency });
  const balance = plannedMinor - spentMinor;
  const over = balance < 0 && !missingBudgetCount;
  const incomplete = missingAmountCount > 0 || missingBudgetCount > 0;
  const status = over ? `Перерасход ${missingAmountCount ? "от " : ""}${format(-balance)}`
    : incomplete ? "Сравнение неполное"
      : balance > 0 ? `Осталось ${format(balance)}` : "Бюджет исчерпан";
  const planned = missingBudgetCount ? (plannedMinor ? `От ${format(plannedMinor)}` : "Не сохранено") : format(plannedMinor);
  const spent = missingAmountCount === purchaseCount && missingAmountCount > 0 ? "Не указано"
    : missingAmountCount ? `От ${format(spentMinor)}` : format(spentMinor);
  return <li className="grid min-w-0 gap-2 py-3 @lg/purchases:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] @lg/purchases:items-start @lg/purchases:gap-4">
    <h4 className="text-xs font-semibold text-muted-foreground @lg/purchases:min-w-12 @lg/purchases:pt-1">{currency}</h4>
    <dl className="grid min-w-0 grid-cols-2 gap-2 @lg/purchases:gap-4">
      <div className="grid min-w-0 gap-1">
        <dt className="text-xs text-muted-foreground">Запланировали</dt>
        <dd className="wrap-anywhere font-semibold tabular-nums">{planned}</dd>
      </div>
      <div className="grid min-w-0 gap-1">
        <dt className="text-xs text-muted-foreground">Потратили</dt>
        <dd className="wrap-anywhere font-semibold tabular-nums">{spent}</dd>
      </div>
    </dl>
    <div className="grid min-w-0 gap-1 @lg/purchases:text-right">
      <p className={over ? "wrap-anywhere font-semibold text-destructive" : "wrap-anywhere text-muted-foreground"}>{status}</p>
      {incomplete && <p className="text-xs text-muted-foreground">
        {[missingAmountCount && `${missingAmountCount} без суммы`, missingBudgetCount && `${missingBudgetCount} без сохранённого бюджета`].filter(Boolean).join(" · ")}
      </p>}
    </div>
  </li>;
}

export function WishMonthlyBudget({ month: currentMonth, plans, subscriptions }) {
  const [selected, setSelected] = useState(null);
  const month = selected && selected < currentMonth ? selected : currentMonth;
  function move(offset) {
    const next = shiftMonth(month, offset);
    setSelected(next < currentMonth ? next : null);
  }

  return <div className="grid min-w-0 gap-2 border-b pb-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-2xl leading-8 font-semibold" aria-live="polite" aria-atomic="true">Бюджет на {monthLabel.format(dateFromKey(`${month}-01`)).replace(/\sг\.$/u, "")}</h3>
      <ControlBar role="group" aria-label="Месяц бюджета" className="flex shrink-0 gap-2">
        <Button data-control-icon type="button" variant="outline" size="icon" aria-label="Предыдущий месяц" disabled={month === "1000-01"}
          onClick={() => move(-1)}><ChevronLeft aria-hidden="true" /></Button>
        <Button data-control-icon type="button" variant="outline" size="icon" aria-label="Следующий месяц" disabled={month === currentMonth}
          onClick={() => move(1)}><ChevronRight aria-hidden="true" /></Button>
      </ControlBar>
    </div>
    <MonthlyBudgetDetails key={month} month={month} plans={plans} subscriptions={subscriptions} />
  </div>;
}

function MonthlyBudgetDetails({ month, plans, subscriptions }) {
  const [editing, setEditing] = useState(null);
  const { data, loading, error, reload } = useAsync(() => readPurchaseMonth(month), [month, plans, subscriptions]);
  const totals = data?.totals;
  const limits = data?.limits ?? [];
  return <>
    {error ? <div className="grid gap-2">
      <Alert variant="destructive"><AlertDescription>Не удалось загрузить бюджет и траты.</AlertDescription></Alert>
      <Button variant="outline" className="min-h-12 justify-self-start rounded-full" onClick={() => reload().catch(() => {})}>Повторить загрузку бюджета</Button>
    </div> : totals?.length ? <ul className="min-w-0 divide-y" aria-label="Бюджет на месяц по валютам">
      {totals.map((total) => <MonthlyBudgetRow key={total.currency} total={total} />)}
    </ul> : loading || !totals ? <p className="flex items-center gap-2" role="status"><Spinner />Считаем бюджет и траты…</p>
      : <p className="text-muted-foreground">На этот месяц пока нет планов и покупок.</p>}
    <PurchaseMonthLimits limits={limits} />
    {!error && totals && <Button type="button" variant="outline" className="min-h-12 justify-self-start rounded-full"
      onClick={() => setEditing({ month, limits, monthCurrencies: totals.map(({ currency }) => currency) })}>Настроить лимит</Button>}
    {editing && <WishPurchaseLimitEditor {...editing} onClose={() => setEditing(null)}
      onSaved={() => reload({ background: true }).catch(() => {})} />}
  </>;
}
