import { useEffect, useId, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { localDateKey } from "../../../shared/modules/planning/planning.js";
import { dateFromKey } from "../../../shared/modules/calendar/planning-calendar.js";
import { formatPurchaseBudget } from "../../../shared/modules/planning/purchase-plan.js";
import { summarizePurchases } from "./purchase-summary.js";
import { PurchasePriceNotice } from "./wish-price-watch.jsx";
import { WishPurchaseHistory } from "./wish-purchase-history.jsx";
import { WishMonthlyBudget } from "./wish-monthly-budget.jsx";
import { WishSubscriptions } from "./wish-subscription.jsx";
import { WishPurchaseForecast } from "./wish-purchase-forecast.jsx";
import { WishPurchaseCollaborations } from "./wish-purchase-collaboration.jsx";

const dateLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" });
const previewCount = 3;

function PurchaseList({ title, plans, onOpen, onEditNeed, onCollaborate, overdue = false }) {
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? plans : plans.slice(0, previewCount);
  return <div className="grid min-w-0 content-start gap-2">
    <h3 className="text-2xl leading-8 font-semibold">{title}</h3>
    {plans.length ? <ul id={listId} className="grid min-w-0 gap-1">
      {visible.map((plan, index) => <li key={plan.id} className="flex min-w-0 items-center gap-2">
        <Button type="button" variant="ghost" aria-label={`Пересмотреть покупку: ${plan.title}`}
          aria-describedby={`${listId}-details-${index}`}
          onClick={() => onOpen(plan)} className="h-auto min-h-12 w-full min-w-0 flex-1 justify-between gap-3 rounded-xl px-2 py-2 text-left whitespace-normal font-normal">
          <span className="grid min-w-0 gap-1">
            <span className="wrap-anywhere">{plan.title}</span>
            <span id={`${listId}-details-${index}`} className={`text-xs ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
              <time dateTime={plan.dueOn}>{dateLabel.format(dateFromKey(plan.dueOn))}</time> · {formatPurchaseBudget(plan.purchaseBudget)}
            </span>
          </span>
          <ChevronRight aria-hidden="true" />
        </Button>
        {plan.need && onEditNeed && <Button type="button" variant="outline" size="icon" className="size-12 shrink-0 rounded-full"
          aria-label={`Изменить потребность: ${plan.title}`} onClick={() => onEditNeed(plan)}><Pencil aria-hidden="true" /></Button>}
        {plan.need && onCollaborate && <Button type="button" variant="outline" size="icon" className="size-12 shrink-0 rounded-full"
          aria-label={`Пригласить к покупке: ${plan.title}`} title="Общая покупка и продавцы"
          onClick={() => onCollaborate({ id: plan.id, title: plan.title, criteria: plan.need.criteria, neededBy: plan.need.neededBy })}><Share2 aria-hidden="true" /></Button>}
      </li>)}
    </ul> : <p className="text-muted-foreground">{overdue ? "Просрочек нет" : "Ближайших планов нет"}</p>}
    {plans.length > previewCount && <Button type="button" variant="ghost" aria-expanded={expanded} aria-controls={listId}
      className="min-h-12 justify-self-start rounded-full" onClick={() => setExpanded(!expanded)}>
      {expanded ? "Свернуть" : `Ещё ${plans.length - previewCount}`}<ChevronDown aria-hidden="true" className={expanded ? "rotate-180" : undefined} />
      <span className="sr-only"> · {title}</span>
    </Button>}
  </div>;
}

export function WishPurchaseSummary({ plans, subscriptions, collaborations, onOpen, onEditNeed, onCollaborate, onOpenSubscription, onOpenPurchase, historyRevision }) {
  const headingId = useId();
  const [today, setToday] = useState(() => localDateKey(new Date()));
  useEffect(() => {
    let timer;
    const syncDate = () => {
      const now = new Date();
      setToday(localDateKey(now));
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      clearTimeout(timer);
      timer = setTimeout(syncDate, midnight - now);
    };
    syncDate();
    window.addEventListener("focus", syncDate);
    return () => { clearTimeout(timer); window.removeEventListener("focus", syncDate); };
  }, []);
  const { overdue, upcoming } = useMemo(() => summarizePurchases(plans, today), [plans, today]);
  const hasPlans = Boolean(overdue.length || upcoming.length);
  const matches = plans.filter(({ priceWatch }) => priceWatch?.notice)
    .sort((left, right) => right.priceWatch.notice.checkedAt.localeCompare(left.priceWatch.notice.checkedAt));
  return <Card role="region" aria-labelledby={headingId} data-wish-purchase-summary=""
    className="not-typeset rollapp-body w-full min-w-0 gap-4 p-4 sm:p-6">
    <h2 id={headingId} className="font-heading text-3xl leading-9 font-semibold">Покупки</h2>
    {matches.length > 0 && <section className="grid min-w-0 gap-2" aria-live="polite" aria-label="Уведомления о цене">
      <h3 className="text-2xl leading-8 font-semibold">Цена уложилась в бюджет</h3>
      {matches.map((plan) => <PurchasePriceNotice key={plan.id} title={plan.title} notice={plan.priceWatch.notice} onOpen={() => onOpen(plan)} />)}
    </section>}
    <WishMonthlyBudget month={today.slice(0, 7)} plans={plans} subscriptions={subscriptions} />
    <WishPurchaseForecast today={today} plans={plans} subscriptions={subscriptions} onOpen={onOpen} onOpenSubscription={onOpenSubscription} />
    {hasPlans ? <div className="grid min-w-0 gap-4 md:grid-cols-2 md:gap-6">
      <PurchaseList title="Просроченные пересмотры" plans={overdue} onOpen={onOpen} onEditNeed={onEditNeed} onCollaborate={onCollaborate} overdue />
      <PurchaseList title="Ближайшие планы" plans={upcoming} onOpen={onOpen} onEditNeed={onEditNeed} onCollaborate={onCollaborate} />
    </div> : <p className="text-muted-foreground">Запланируйте покупку из меню желания.</p>}
    <WishSubscriptions subscriptions={subscriptions} onOpen={onOpenSubscription} />
    <WishPurchaseCollaborations records={collaborations} onOpen={onCollaborate} />
    <WishPurchaseHistory revision={historyRevision} onOpen={onOpenPurchase} />
  </Card>;
}
