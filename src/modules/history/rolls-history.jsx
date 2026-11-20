import { EmptyState } from "@/modules/shell/page-feedback.jsx";
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Coins, Gift, ShoppingBag, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRolls } from "../../../shared/modules/payments/rolls.js";

const orderLabels = {
  purchase: "Покупка", refund: "Возврат", market_reserve: "Резерв покупки",
  market_refund: "Возврат резерва", market_sale: "Продажа",
};

export function RollsHistory({ transactions, hasMore, loading, loadingMore, busy, onLoadMore, timeZone, onOpenReceipt }) {
  const dateTime = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone });
  return <section className="@container/history flex min-w-0 flex-col gap-4" aria-label="История операций">
    {transactions === null ? <p className="text-muted-foreground" role="status">{loading ? "Загружаем операции…" : "Не удалось загрузить историю."}</p> : transactions.length === 0 ? <EmptyState compact icon={Coins} title="Операций пока нет" text="Здесь появятся операции с роллами." /> : <ul className="flex flex-col">
      {transactions.map((item) => {
        const incoming = item.direction === "incoming";
        const reward = item.kind === "wish_reward";
        const grant = item.kind === "manual_grant";
        const giftTopup = item.kind === "gift_topup";
        const topup = item.kind === "stars_topup" || item.kind === "ton_topup";
        const orderLabel = orderLabels[item.kind];
        const Icon = orderLabel ? ShoppingBag : item.kind === "welcome" ? Gift : reward || grant ? Sparkles : incoming ? ArrowDownLeft : ArrowUpRight;
        const title = orderLabel ? `${orderLabel} · ${item.productTitle}` : item.kind === "welcome"
          ? "Добро пожаловать в Rollapp"
          : giftTopup ? "Пополнение подарочной карты" : item.kind === "need_reserve" ? "Резерв награды за потребность"
          : item.kind === "need_reward" ? "За закрытую потребность"
          : item.kind === "need_refund" ? "Возврат резерва награды"
          : reward ? `За желание «${item.wishTitle}»` : grant ? "Начисление роллов" : topup ? (item.kind === "ton_topup" ? "Пополнение за TON" : "Пополнение через Telegram Stars") : `${incoming ? "От " : ""}${item.person?.name || "Участник"}`;
        const entryKey = `${item.kind}:${item.id}:${item.direction}`;
        return <li key={entryKey} className="grid min-w-0 gap-2 py-2" data-rolls-transaction={item.kind}>
          <Button data-content-control="" variant="ghost" className="h-auto w-full items-start justify-start gap-3 rounded-xl px-0 py-2 text-start font-normal whitespace-normal"
            type="button" aria-description="Открыть квитанцию"
            onClick={(event) => onOpenReceipt(event, item.kind, item.id)}>
            <span className="sr-only">Квитанция · </span>
            <span className={`flex size-12 shrink-0 items-center justify-center rounded-full ${incoming ? "bg-amber-400/10 text-amber-800 dark:text-amber-300" : "bg-muted text-muted-foreground"}`}><Icon className="size-5" aria-hidden="true" /></span>
            <span className="grid min-w-0 flex-1 gap-1 @sm/history:grid-cols-2 @sm/history:gap-3">
              <span className="grid min-w-0 content-start">
                <span className="wrap-anywhere">{title}</span>
                {item.note || item.kind === "welcome" ? <span className="wrap-anywhere whitespace-pre-wrap text-xs text-muted-foreground">{item.kind === "welcome" ? "Начисление" : item.note === "Начисление по запросу пользователя" ? "Начисление по запросу" : item.note}</span> : item.person?.username ? <span className="wrap-anywhere text-xs text-muted-foreground">@{item.person.username}</span> : null}
              </span>
              <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 @sm/history:flex-col @sm/history:items-end @sm/history:text-right">
                <span className={`flex min-w-0 items-start gap-1 tabular-nums ${incoming ? "text-amber-800 dark:text-amber-300" : "text-foreground"}`}>
                  <span className="min-w-0 wrap-anywhere">{incoming ? "+" : "−"}{formatRolls(item.amount)}</span>
                  <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </span>
                <time className="text-xs text-muted-foreground" dateTime={item.createdAt}>{dateTime.format(new Date(item.createdAt))}</time>
              </span>
            </span>
          </Button>
        </li>;
      })}
    </ul>}
    {hasMore && <Button variant="outline" onClick={onLoadMore} disabled={loadingMore || busy} aria-busy={Boolean(loadingMore) || undefined}>Показать ещё</Button>}
  </section>;
}
