import { useId, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, Gift, ShoppingBag, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { RollReceipt } from "./roll-receipt.jsx";
import { formatRolls } from "../../../shared/modules/payments/rolls.js";

const orderLabels = {
  purchase: "Покупка", refund: "Возврат", market_reserve: "Резерв покупки",
  market_refund: "Возврат резерва", market_sale: "Продажа",
};

export function RollsHistory({ transactions, hasMore, loading, loadingMore, busy, onLoadMore, timeZone }) {
  const panelId = useId();
  const [openId, setOpenId] = useState(null);
  const dateTime = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone });
  return <section className="flex min-w-0 flex-col gap-4" aria-label="История операций">
    {transactions === null ? <p className="text-muted-foreground" role="status">{loading ? "Загружаем операции…" : "Не удалось загрузить историю."}</p> : transactions.length === 0 ? <p className="text-muted-foreground">Здесь появятся операции с роллами.</p> : <ul className="flex flex-col">
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
        const expanded = openId === entryKey;
        return <li key={entryKey} className="grid min-w-0 gap-2 py-2" data-rolls-transaction={item.kind}>
          <Button variant="ghost" className="h-auto w-full items-start justify-start gap-3 rounded-xl px-0 py-2 text-start font-normal whitespace-normal"
            type="button" aria-label={`Квитанция · ${title}`} aria-expanded={expanded} aria-controls={expanded ? panelId : undefined}
            onClick={() => setOpenId(expanded ? null : entryKey)}>
            <span className={`flex size-12 shrink-0 items-center justify-center rounded-full ${incoming ? "bg-amber-400/10 text-amber-300" : "bg-muted text-muted-foreground"}`}><Icon className="size-5" aria-hidden="true" /></span>
            <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
              <span className="min-w-0 wrap-anywhere">{title}</span>
              <span className={`flex items-start justify-end gap-1 text-right tabular-nums ${incoming ? "text-amber-300" : "text-foreground"}`}>
                {incoming ? "+" : "−"}{formatRolls(item.amount)}
                <ChevronDown className={`mt-1 size-5 text-muted-foreground ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
              </span>
              {item.note || item.kind === "welcome" ? <span className="min-w-0 wrap-anywhere whitespace-pre-wrap text-xs text-muted-foreground">{item.kind === "welcome" ? "Начисление" : item.note === "Начисление по запросу пользователя" ? "Начисление по запросу" : item.note}</span> : item.person?.username ? <span className="min-w-0 wrap-anywhere text-xs text-muted-foreground">@{item.person.username}</span> : <span />}
              <time className="text-right text-xs text-muted-foreground" dateTime={item.createdAt}>{dateTime.format(new Date(item.createdAt))}</time>
            </span>
          </Button>
          {expanded && <RollReceipt key={entryKey} id={panelId} kind={item.kind} recordId={item.id} />}
        </li>;
      })}
    </ul>}
    {hasMore && <Button variant="outline" onClick={onLoadMore} disabled={loadingMore || busy}>{loadingMore && <Spinner />}Показать ещё</Button>}
  </section>;
}
