import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dateFromKey } from "../../../shared/modules/calendar/planning-calendar.js";
import { formatPurchaseBudget } from "../../../shared/modules/planning/purchase-plan.js";
import { forecastPurchases } from "./purchase-summary.js";

const dateLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
const displayDate = (date) => dateLabel.format(dateFromKey(date));

export function WishPurchaseForecast({ today, plans, subscriptions = [], onOpen, onOpenSubscription }) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const { end, currencies } = forecastPurchases(plans, subscriptions, today);
  if (!currencies.length) return null;
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  return <section className="grid min-w-0 gap-2" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`} className="text-2xl leading-8 font-semibold">Деньги на 30 дней</h3>
    <p className="text-xs text-muted-foreground">{displayDate(today)} – {displayDate(end)} · покупки по дате пересмотра, подписки по ближайшему списанию</p>
    <ul className="grid min-w-0 gap-2" aria-label="Прогноз по валютам">
      {currencies.map(({ currency, scheduledMinor, savedMinor, overdueMinor, items }) => {
        const money = (minor) => formatPurchaseBudget({ minor, currency });
        return <li key={currency} className="grid min-w-0 gap-2 rounded-xl border p-3">
          <h4 className="text-xs font-semibold text-muted-foreground">{currency}</h4>
          <dl className="grid min-w-0 grid-cols-2 gap-2 @lg/purchases:grid-cols-3">
            <div className="min-w-0"><dt className="text-xs text-muted-foreground">Запланировано</dt><dd className="wrap-anywhere tabular-nums">{money(scheduledMinor)}</dd></div>
            <div className="min-w-0"><dt className="text-xs text-muted-foreground">Уже отложили</dt><dd className="wrap-anywhere tabular-nums">{money(savedMinor)}</dd></div>
            <div className="min-w-0"><dt className="text-xs text-muted-foreground">Ещё понадобится</dt><dd className="wrap-anywhere font-semibold tabular-nums">{money(scheduledMinor - savedMinor)}</dd></div>
          </dl>
          {items.some(({ overdue }) => overdue) && <p className="wrap-anywhere text-xs text-destructive">В просроченных планах ещё понадобится {money(overdueMinor)}</p>}
          {expanded && <ul className="grid min-w-0 gap-1">
            {items.map((item) => <li key={`${item.type}:${item.id}`} className="min-w-0">
              <Button data-content-control="" type="button" variant="ghost" className="h-auto min-h-12 w-full min-w-0 justify-between gap-2 rounded-xl px-2 py-2 text-left whitespace-normal font-normal"
                aria-label={`Открыть из прогноза: ${item.title}`} onClick={() => item.type === "subscription" ? onOpenSubscription(item.id) : onOpen(planById.get(item.id))}>
                <span className="grid min-w-0 gap-1"><span className="wrap-anywhere">{item.title}</span>
                  <span className="text-xs text-muted-foreground">{displayDate(item.date)} · {money(item.minor)}{item.savedMinor > 0 && ` · отложено ${money(item.savedMinor)}`}</span></span>
                <ChevronRight aria-hidden="true" />
              </Button>
            </li>)}
          </ul>}
        </li>;
      })}
    </ul>
    <Button type="button" variant="ghost" className="h-auto min-h-12 max-w-full justify-self-start rounded-full text-left whitespace-normal" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      {expanded ? "Скрыть планы" : "Показать планы на 30 дней"}
    </Button>
  </section>;
}
