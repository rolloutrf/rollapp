import { useId, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/modules/runtime/api";
import { useAsync } from "@/modules/shell/use-async";
import { dateFromKey } from "../../../shared/modules/calendar/planning-calendar.js";
import { formatPurchaseBudget } from "../../../shared/modules/planning/purchase-plan.js";

const dateLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" });

function readHistory(cursor) {
  return api.get(`/dashboard/purchase-history${cursor ? `?${new URLSearchParams({ cursor })}` : ""}`);
}

function PurchaseHistoryRow({ entry, onOpen }) {
  const contextId = useId();
  const { title, purchasedOn, amountMinor, changeMinor, currency, needTitle, suited, purchaseType } = entry;
  const change = changeMinor === 0 ? "Сумма без изменений" : changeMinor != null
    ? `На ${formatPurchaseBudget({ minor: Math.abs(changeMinor), currency })} ${changeMinor > 0 ? "дороже" : "дешевле"}`
    : null;
  return <li className="min-w-0">
    <Button type="button" variant="ghost" aria-label={`Открыть покупку: ${title}`} aria-describedby={contextId} onClick={() => onOpen(entry.id)}
      className="h-auto min-h-12 w-full min-w-0 justify-between gap-2 rounded-xl px-2 py-3 text-left whitespace-normal font-normal">
      <span id={contextId} className="grid min-w-0 flex-1 gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,auto)] sm:items-start">
        <span className="grid min-w-0 gap-1">
          <span className="wrap-anywhere font-medium">{title}</span>
          {purchaseType === "subscription" && <span className="text-xs text-muted-foreground">Подписка</span>}
          {needTitle && needTitle !== title && <span className="wrap-anywhere text-xs text-muted-foreground">Потребность · {needTitle}</span>}
          <span className="text-xs text-muted-foreground">
            {purchasedOn ? <time dateTime={purchasedOn}>{dateLabel.format(dateFromKey(purchasedOn))}</time> : "Дата не сохранена"}
          </span>
        </span>
        <span className="grid min-w-0 gap-1 sm:text-right">
          <span className="wrap-anywhere tabular-nums">{amountMinor == null ? "Сумма не указана" : formatPurchaseBudget({ minor: amountMinor, currency })}</span>
          {change && <span className="text-xs tabular-nums text-muted-foreground">{change}</span>}
          {suited !== undefined && <span className="text-xs text-muted-foreground">{suited ? "Подошёл" : "Не подошёл"}</span>}
        </span>
      </span>
      <ChevronRight aria-hidden="true" />
    </Button>
  </li>;
}

function PurchaseHistoryFeed({ onOpen }) {
  const { data, loading, error, reload, updateData } = useAsync(readHistory);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);

  const loadMore = async () => {
    if (loadingMore || !data?.nextCursor) return;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const page = await readHistory(data.nextCursor);
      updateData((current) => ({
        items: [...current.items, ...page.items],
        nextCursor: page.nextCursor,
      }));
    } catch {
      setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) return <p className="flex items-center gap-2" role="status"><Spinner />Загружаем историю…</p>;
  if (error) return <div className="grid gap-2">
    <Alert variant="destructive"><AlertDescription>Не удалось загрузить историю покупок.</AlertDescription></Alert>
    <Button variant="outline" className="min-h-12 justify-self-start rounded-full" onClick={() => reload().catch(() => {})}>Повторить</Button>
  </div>;
  if (!data?.items.length) return <p className="text-muted-foreground">Подтверждённые покупки появятся здесь.</p>;

  return <div className="grid min-w-0 gap-2">
    <ul className="min-w-0 divide-y" aria-label="Подтверждённые покупки">
      {data.items.map((entry) => <PurchaseHistoryRow key={entry.id} entry={entry} onOpen={onOpen} />)}
    </ul>
    {moreError && <Alert variant="destructive"><AlertDescription>Не удалось загрузить следующие покупки.</AlertDescription></Alert>}
    {data.nextCursor && <Button variant="outline" className="min-h-12 justify-self-start rounded-full" disabled={loadingMore} onClick={loadMore}>
      {loadingMore && <Spinner />}{moreError ? "Повторить" : "Ещё покупки"}
    </Button>}
  </div>;
}

export function WishPurchaseHistory({ revision, onOpen }) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  return <section className="grid min-w-0 gap-2 border-t pt-2" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>
      <Button type="button" variant="ghost" className="min-h-12 w-full justify-between gap-2 rounded-xl px-2 text-left font-semibold"
        aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>
        История покупок <ChevronDown aria-hidden="true" className={expanded ? "rotate-180" : undefined} />
      </Button>
    </h3>
    <div id={id} hidden={!expanded}>{expanded && <PurchaseHistoryFeed key={revision} onOpen={onOpen} />}</div>
  </section>;
}
