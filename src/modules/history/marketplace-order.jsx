import { useRef, useState } from "react";
import { Clock3, Coins } from "lucide-react";
import { api } from "@/modules/runtime/api.js";
import { ControlBar } from "@/components/control-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OrderReceipt } from "./roll-receipt.jsx";
import { formatRolls } from "../../../shared/modules/payments/rolls.js";
import { MARKETPLACE_REVIEW_DAYS, MARKETPLACE_ORDER_NOTE_LIMIT } from "../../../shared/modules/checkout/marketplace-settlements.js";

const dateTime = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });
const statuses = {
  reserved: "В резерве", fulfilled: "На проверке", disputed: "Открыт спор",
  released: "Расчёт завершён", refunded: "Роллы возвращены",
};
const actionLabels = {
  cancel: "Отменить заказ", fulfill: "Отметить исполнение", accept: "Подтвердить получение",
  dispute: "Открыть спор", claim: "Получить роллы", refund: "Вернуть роллы",
};
const eventLabels = {
  cancel: "Покупатель отменил заказ", fulfill: "Продавец сообщил об исполнении", accept: "Покупатель подтвердил получение",
  dispute: "Покупатель открыл спор", claim: "Продавец получил роллы", refund: "Продавец вернул роллы",
  resolve_release: "Платформа завершила расчёт", resolve_refund: "Платформа вернула роллы",
};

function MarketplaceActionDialog({ order, action, onClose, onReload }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const requestInFlight = useRef(false);
  const amount = formatRolls(order.amount);
  const hasNote = action === "fulfill" || action === "dispute";
  const source = order.settlement.source === "gift" ? "на исходную подарочную карту" : "в ваш кошелёк";
  const descriptions = {
    cancel: `${amount} вернутся ${source}.`,
    fulfill: `Покупатель сможет проверить получение и открыть спор в течение ${MARKETPLACE_REVIEW_DAYS} дней.`,
    accept: `${amount} поступят продавцу. Расчёт по заказу будет завершён.`,
    dispute: `${amount} останутся в резерве до решения. Причину спора увидят продавец и поддержка.`,
    claim: `Срок проверки закончился. ${amount} поступят в ваш кошелёк.`,
    refund: `${amount} вернутся в источник оплаты покупателя. Заказ будет закрыт.`,
  };
  async function submit() {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(true); setError("");
    try {
      await api.post(`/rolls/orders/${encodeURIComponent(order.id)}/actions`, { action, note });
      onClose();
      void onReload();
    } catch (failure) {
      setError(failure.message);
      if (failure.code === "ORDER_ACTION_UNAVAILABLE") void onReload();
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }
  return <AlertDialog open onOpenChange={(open) => { if (!open && !requestInFlight.current) onClose(); }}>
    <AlertDialogContent className="rollapp-body flex w-[calc(100%-2rem)] flex-col overflow-hidden">
      <AlertDialogHeader className="shrink-0">
        <AlertDialogTitle>{actionLabels[action]}?</AlertDialogTitle>
        <AlertDialogDescription>{descriptions[action]}</AlertDialogDescription>
      </AlertDialogHeader>
      {hasNote && <div className="min-h-0 overflow-y-auto overscroll-contain px-px">
        <Field>
          <FieldLabel htmlFor="marketplace-action-note">{action === "dispute" ? "Причина спора" : "Комментарий для покупателя"}</FieldLabel>
          <Textarea id="marketplace-action-note" rows={3} maxLength={MARKETPLACE_ORDER_NOTE_LIMIT} value={note}
            disabled={busy} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>}
      {error && <Alert className="shrink-0" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <AlertDialogFooter className="shrink-0 flex-row flex-wrap justify-end">
        <AlertDialogCancel className="rounded-full" disabled={busy}>Назад</AlertDialogCancel>
        <AlertDialogAction className="rounded-full" disabled={busy || (action === "dispute" && !note.trim())} onClick={submit}>
          {busy && <Spinner />}{actionLabels[action]}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

export function MarketplaceOrder({ order, onReload }) {
  const [action, setAction] = useState(null);
  const { role, participant, reviewUntil, source, actions, events } = order.settlement;
  const buyer = role === "buyer";
  return <article className="grid min-w-0 gap-4 rounded-2xl border bg-card p-4" data-order-status={order.status} data-order-role={role}>
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
    {actions.length > 0 && <ControlBar role="group" aria-label="Действия с заказом" className="flex flex-wrap gap-2">
      {actions.map((name) => <Button key={name} variant={["fulfill", "accept", "claim"].includes(name) ? "default" : "outline"}
        onClick={() => setAction(name)}>{actionLabels[name]}</Button>)}
    </ControlBar>}
    <OrderReceipt order={order} />
    {action && <MarketplaceActionDialog order={order} action={action} onClose={() => setAction(null)} onReload={onReload} />}
  </article>;
}
