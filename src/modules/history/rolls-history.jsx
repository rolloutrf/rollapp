import { ArrowDownLeft, ArrowUpRight, Gift, ShoppingBag, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatRolls } from "../../../shared/modules/payments/rolls.js";

export function RollsHistory({ transactions, nextOffset, loading, loadingMore, busy, onLoadMore }) {
  return <section className="flex min-w-0 flex-col gap-4" aria-label="История операций">
    {transactions === null ? <p className="text-muted-foreground" role="status">{loading ? "Загружаем операции…" : "Не удалось загрузить историю."}</p> : transactions.length === 0 ? <p className="text-muted-foreground">Здесь появятся операции с роллами.</p> : <ul className="flex flex-col">
      {transactions.map((item) => {
        const incoming = item.direction === "incoming";
        const reward = item.kind === "wish_reward";
        const grant = item.kind === "manual_grant";
        const giftTopup = item.kind === "gift_topup";
        const topup = item.kind === "stars_topup" || item.kind === "ton_topup";
        const orderLabel = item.kind === "purchase" ? "Покупка" : item.kind === "refund" ? "Возврат" : "";
        const Icon = orderLabel ? ShoppingBag : item.kind === "welcome" ? Gift : reward || grant ? Sparkles : incoming ? ArrowDownLeft : ArrowUpRight;
        const title = orderLabel ? `${orderLabel} · ${item.productTitle}` : item.kind === "welcome"
          ? "Добро пожаловать в Rollapp"
          : giftTopup ? "Пополнение подарочной карты" : item.kind === "need_reserve" ? "Резерв награды за потребность"
          : item.kind === "need_reward" ? "За закрытую потребность"
          : item.kind === "need_refund" ? "Возврат резерва награды"
          : reward ? `За желание «${item.wishTitle}»` : grant ? "Начисление роллов" : topup ? (item.kind === "ton_topup" ? "Пополнение за TON" : "Пополнение через Telegram Stars") : `${incoming ? "От " : ""}${item.person?.name || "Участник"}`;
        return <li key={item.id} className="flex min-w-0 items-start gap-3 py-4" data-rolls-transaction={item.kind}>
          <span className={`flex size-12 shrink-0 items-center justify-center rounded-full ${incoming ? "bg-amber-400/10 text-amber-300" : "bg-muted text-muted-foreground"}`}><Icon className="size-5" aria-hidden="true" /></span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4"><span className="min-w-0 break-words text-base">{title}</span><span className={`shrink-0 text-right text-base tabular-nums ${incoming ? "text-amber-300" : "text-foreground"}`}>{incoming ? "+" : "−"}{formatRolls(item.amount)}</span>{item.note || item.kind === "welcome" ? <span className="min-w-0 whitespace-pre-wrap break-words text-base text-muted-foreground">{item.kind === "welcome" ? "Начисление" : item.note === "Начисление по запросу пользователя" ? "Начисление по запросу" : item.note}</span> : item.person ? <span className="min-w-0 break-all text-base text-muted-foreground">@{item.person.username}</span> : <span /> }<time className="whitespace-nowrap text-right text-base text-muted-foreground" dateTime={item.createdAt}>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(item.createdAt))}</time></div>
          </div>
        </li>;
      })}
    </ul>}
    {nextOffset != null && <Button variant="outline" onClick={onLoadMore} disabled={loadingMore || busy}>{loadingMore && <Spinner />}Показать ещё</Button>}
  </section>;
}
