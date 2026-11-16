import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { PageActionButton } from "@/components/page-action-button";
import { Textarea } from "@/components/ui/textarea";
import { MARKETPLACE_ORDER_NOTE_LIMIT, MARKETPLACE_REVIEW_DAYS } from "../../../shared/modules/checkout/marketplace-settlements.js";
import { formatRolls } from "../../../shared/modules/payments/rolls.js";
import { useOperationRecovery } from "../payments/use-operation-recovery.js";

export const marketplaceActionLabels = {
  cancel: "Отменить заказ", fulfill: "Отметить исполнение", accept: "Подтвердить получение",
  dispute: "Открыть спор", claim: "Получить роллы", refund: "Вернуть роллы",
};

const messages = {
  unreadable: "Не удалось прочитать результат действия.",
  unknown: "Ответ не получен. Проверьте результат действия по заказу.",
  storage: "Разрешите хранение данных, чтобы проверить результат после перезагрузки.",
};

const storageKeyFor = (userId, orderId) => `rollapp:marketplace-action:${encodeURIComponent(userId)}:${orderId}`;

export function readPendingMarketplaceAction(userId, orderId) {
  try {
    const intent = JSON.parse(sessionStorage.getItem(storageKeyFor(userId, orderId)));
    if (intent?.userId !== userId || intent.orderId !== orderId || !Object.hasOwn(marketplaceActionLabels, intent.action) ||
        !["buyer", "seller"].includes(intent.role) || typeof intent.note !== "string" || intent.note.length > MARKETPLACE_ORDER_NOTE_LIMIT ||
        typeof intent.requestKey !== "string" || !Number.isSafeInteger(intent.amount) || intent.amount < 1 || intent.amount > 1_000_000) return null;
    return intent;
  } catch {
    return null;
  }
}

export function MarketplaceActionDialog({ order, userId, action, returnFocus, onClose, onDone }) {
  const [note, setNote] = useState("");
  const recovery = useOperationRecovery({
    storageKey: storageKeyFor(userId, order.id),
    loadSaved: () => readPendingMarketplaceAction(userId, order.id),
    field: "order",
    messages,
    requestFor(intent) {
      const path = `/rolls/orders/${encodeURIComponent(intent.orderId)}/actions`;
      return { path, requestKey: intent.requestKey, statusPath: `${path}/${intent.action}`,
        payload: { action: intent.action, note: intent.note, expectedAmount: intent.amount } };
    },
    acceptResponse: (result, mode, intent) => result?.id === intent.orderId &&
      (mode === "send" || (typeof result.available === "boolean" &&
        (result.recorded === null || (typeof result.recorded?.at === "string" && typeof result.recorded?.note === "string")))),
    readMatches: (result, intent) => result.id === intent.orderId && result.amount === intent.amount &&
      result.role === intent.role && result.action === intent.action && (!result.recorded || result.recorded.note === intent.note),
    readUnrecorded: (result) => result.recorded ? null : result.available ? "missing" : "unavailable",
    isConflict: (failure) => ["ORDER_ACTION_CONFLICT", "ORDER_AMOUNT_MISMATCH", "ORDER_ACTION_UNAVAILABLE"].includes(failure.code),
    onReject: (failure) => ["BALANCE_LIMIT", "GIFT_CARD_LIMIT", "INVALID_ORDER_ACTION"].includes(failure.code),
    onComplete: onDone,
    onCloseConflict: onDone,
  });
  const selected = recovery.pending?.action ?? action;
  const amount = formatRolls(recovery.pending?.amount ?? order.amount);
  const source = (recovery.pending ? recovery.pending.source : order.settlement.source) === "gift" ? "на исходную подарочную карту" : "в ваш кошелёк";
  const descriptions = {
    cancel: `${amount} вернутся ${source}.`,
    fulfill: `Покупатель сможет проверить получение и открыть спор в течение ${MARKETPLACE_REVIEW_DAYS} дней.`,
    accept: `${amount} поступят продавцу. Расчёт по заказу будет завершён.`,
    dispute: `${amount} останутся в резерве до решения. Причину спора увидят продавец и поддержка.`,
    claim: `Срок проверки закончился. ${amount} поступят в ваш кошелёк.`,
    refund: `${amount} вернутся в источник оплаты покупателя. Заказ будет закрыт.`,
  };
  const hasNote = selected === "fulfill" || selected === "dispute";
  const result = recovery.result;
  const busy = recovery.busy;
  function submit(event) {
    event.preventDefault();
    if (recovery.pending) recovery.check();
    else recovery.send({
      userId, orderId: order.id, action: selected, role: order.settlement.role, source: order.settlement.source,
      amount: order.amount, note: note.trim(), requestKey: crypto.randomUUID(),
    });
  }
  return <AlertDialog open onOpenChange={(open, event) => {
    if (open) return;
    if (recovery.inFlight.current) event?.cancel?.();
    else onClose();
  }}>
    <AlertDialogContent className="rollapp-body flex w-[calc(100%-2rem)] flex-col overflow-hidden" finalFocus={returnFocus}>
      <AlertDialogHeader className="shrink-0">
        <AlertDialogTitle>{marketplaceActionLabels[selected]}?</AlertDialogTitle>
      </AlertDialogHeader>
      <div className="grid min-h-0 min-w-0 gap-2 overflow-y-auto overscroll-contain px-px">
        <AlertDialogDescription>{recovery.pending ? `${amount} · Заказ № ${order.id.slice(0, 8).toUpperCase()}` : descriptions[selected]}</AlertDialogDescription>
        {recovery.error && <Alert variant="destructive"><AlertDescription>{recovery.error}</AlertDescription></Alert>}
        {result === "missing" && <>
          <p role="status">Действие пока не записано.</p>
          <PageActionButton variant="outline" disabled={busy} onClick={() => recovery.send()}>Повторить действие</PageActionButton>
        </>}
        {result === "unavailable" && <>
          <p role="status">Действие пока не записано. Сейчас его нельзя отправить повторно.</p>
          <PageActionButton variant="outline" onClick={recovery.closeUnrecorded}>Закрыть запрос</PageActionButton>
        </>}
        {result === "conflict" && <>
          <p role="status">Состояние заказа или реквизиты действия изменились.</p>
          <PageActionButton variant="outline" onClick={recovery.closeConflict}>Закрыть запрос</PageActionButton>
        </>}
        {hasNote && <Field>
          <FieldLabel htmlFor="marketplace-action-note">{selected === "dispute" ? "Причина спора" : "Комментарий для покупателя"}</FieldLabel>
          <Textarea id="marketplace-action-note" rows={3} maxLength={MARKETPLACE_ORDER_NOTE_LIMIT}
            value={recovery.pending?.note ?? note} readOnly={Boolean(recovery.pending)} disabled={busy}
            onChange={(event) => setNote(event.target.value)} />
        </Field>}
      </div>
      <AlertDialogFooter className="shrink-0 flex-row flex-wrap justify-end">
        <AlertDialogCancel className="rounded-full" disabled={busy}>{recovery.pending ? "Позже" : "Назад"}</AlertDialogCancel>
        {result !== "conflict" && <AlertDialogAction className="rounded-full"
          aria-label={recovery.pending && !busy ? "Проверить результат" : undefined}
          disabled={busy || (!recovery.pending && selected === "dispute" && !note.trim())} onClick={submit}>
          {busy ? (recovery.requestMode === "check" ? "Проверяем…" : "Отправляем…")
            : recovery.pending ? "Проверить" : marketplaceActionLabels[selected]}
        </AlertDialogAction>}
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
