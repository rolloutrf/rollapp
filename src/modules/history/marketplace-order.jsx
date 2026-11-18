import { useRef, useState } from "react";
import { Clock3, Coins } from "lucide-react";
import { ControlBar } from "@/components/control-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PageActionButton } from "@/components/page-action-button";
import { MarketplaceActionDialog, marketplaceActionLabels, readPendingMarketplaceAction } from "../checkout/marketplace-action-dialog.jsx";
import { OrderReceipt } from "./roll-receipt.jsx";
import { formatRolls } from "../../../shared/modules/payments/rolls.js";

const dateTime = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });
const statuses = {
  reserved: "В резерве", fulfilled: "На проверке", disputed: "Открыт спор",
  released: "Расчёт завершён", refunded: "Роллы возвращены",
};
const eventLabels = {
  cancel: "Покупатель отменил заказ", fulfill: "Продавец сообщил об исполнении", accept: "Покупатель подтвердил получение",
  dispute: "Покупатель открыл спор", claim: "Продавец получил роллы", refund: "Продавец вернул роллы",
  resolve_release: "Платформа завершила расчёт", resolve_refund: "Платформа вернула роллы",
};

export function MarketplaceOrder({ order, userId, onReload, fallbackFocus, filtered, onOpenReceipt }) {
  const [action, setAction] = useState(null);
  const card = useRef(null);
  const opener = useRef(null);
  const focusCard = useRef(false);
  const pending = readPendingMarketplaceAction(userId, order.id);
  function open(event, name) {
    opener.current = event.currentTarget;
    focusCard.current = false;
    setAction(name);
  }
  function finish() {
    focusCard.current = true;
    setAction(null);
    void onReload(order.id);
  }
  const { role, participant, reviewUntil, source, actions, events } = order.settlement;
  const buyer = role === "buyer";
  return <article ref={card} tabIndex={-1} className="grid min-w-0 gap-4 rounded-2xl border bg-card p-4" data-order-status={order.status} data-order-role={role} data-marketplace-order={order.id}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-caption text-muted-foreground" title={order.id}>{buyer ? "Покупка" : "Продажа"} · № {order.id.slice(0, 8).toUpperCase()}</span>
      <Badge variant={order.status === "released" || order.status === "refunded" ? "secondary" : "outline"}>{statuses[order.status]}</Badge>
    </div>
    <div className="typeset typeset-rollapp min-w-0">
      <h2 className="wrap-anywhere">{order.productTitle}</h2>
      <p className="wrap-anywhere text-muted-foreground">{buyer ? "Продавец" : "Покупатель"} · {participant}</p>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Coins className="size-5 text-amber-300" aria-hidden="true" />
      <strong className="tabular-nums">{formatRolls(order.amount)}</strong>
      {source === "gift" && <span className="text-muted-foreground">· Подарочная карта</span>}
    </div>
    {order.status === "fulfilled" && reviewUntil && <p className="flex items-start gap-2 text-muted-foreground">
      <Clock3 className="mt-1 size-5 shrink-0" aria-hidden="true" />
      <span>Период проверки до <time dateTime={reviewUntil}>{dateTime.format(new Date(reviewUntil))}</time></span>
    </p>}
    {events.length > 0 && <Accordion className="min-w-0 border-t">
      <AccordionItem value="events">
        <AccordionTrigger className="min-h-12 items-center text-base">История заказа</AccordionTrigger>
        <AccordionContent>
          <ol className="grid gap-3">
            {events.map((event) => <li className="rollapp-body grid min-w-0 gap-1 border-l pl-3" key={event.action}>
              <span>{eventLabels[event.action]}</span>
              {event.note && <span className="wrap-anywhere whitespace-pre-wrap text-muted-foreground">{event.note}</span>}
              <time className="text-caption text-muted-foreground" dateTime={event.createdAt}>{dateTime.format(new Date(event.createdAt))}</time>
            </li>)}
          </ol>
        </AccordionContent>
      </AccordionItem>
    </Accordion>}
    {pending && !action && <PageActionButton variant="outline" className="justify-self-start"
      onClick={(event) => open(event, pending.action)}>Открыть проверку действия</PageActionButton>}
    {!pending && actions.length > 0 && <ControlBar role="group" aria-label="Действия с заказом" className="flex flex-wrap gap-2">
      {actions.map((name) => <Button key={name} variant={["fulfill", "accept", "claim"].includes(name) ? "default" : "outline"}
        onClick={(event) => open(event, name)}>{marketplaceActionLabels[name]}</Button>)}
    </ControlBar>}
    <OrderReceipt order={order} onOpenReceipt={onOpenReceipt} />
    {action && <MarketplaceActionDialog order={order} userId={userId} action={action}
      returnFocus={() => {
        if (focusCard.current && filtered) return fallbackFocus();
        if (!focusCard.current && opener.current?.isConnected) return opener.current;
        return card.current?.isConnected ? card.current : fallbackFocus();
      }}
      onClose={() => setAction(null)} onDone={finish} />}
  </article>;
}
