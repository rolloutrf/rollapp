import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PageActionButton } from "@/components/page-action-button";
import { useOperationRecovery } from "../payments/use-operation-recovery.js";
import { formatRolls } from "../../../shared/modules/payments/rolls.js";

const confirmedRejections = new Set(["OFFER_NOT_FOUND", "OFFER_EXPIRED", "OFFER_ACCESS_REVOKED", "OFFER_NOT_PAID",
  "OFFER_PRICE_CHANGED", "INVALID_OFFER_TERMS", "INSUFFICIENT_ROLLS", "RECIPIENT_BALANCE_LIMIT"]);
const messages = {
  unreadable: "Не удалось прочитать результат по счёту.",
  unknown: "Ответ потерян. Проверьте результат операции по этому счёту.",
  storage: "Разрешите хранение данных, чтобы проверить результат после перезагрузки.",
};
const operationPrefix = (userId) => `rollapp:offer-operation:${encodeURIComponent(userId)}:`;
const keyFor = (userId, offerId, action) => `${operationPrefix(userId)}${encodeURIComponent(offerId)}:${action}`;

function readIntent(storageKey, userId) {
  try {
    const intent = JSON.parse(sessionStorage.getItem(storageKey));
    const { action, offer, requestKey } = intent ?? {};
    if (intent?.userId !== userId || !["pay", "refund"].includes(action) || typeof requestKey !== "string" ||
        typeof offer?.id !== "string" || storageKey !== keyFor(userId, offer.id, action) || typeof offer.title !== "string" ||
        !Number.isSafeInteger(offer.priceRolls) || offer.priceRolls < 1 || offer.priceRolls > 1_000_000 ||
        typeof offer.business?.id !== "string" || typeof offer.recipient?.id !== "string" ||
        (action === "pay" ? offer.recipient.id : offer.business.id) !== userId) return null;
    return intent;
  } catch { return null; }
}

export function readPendingPersonalOffers(userId) {
  const prefix = operationPrefix(userId);
  const results = [];
  try {
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const saved = readIntent(key, userId);
      if (saved) results.push(saved);
    }
  } catch { return []; }
  return results;
}

export function PersonalOfferOperationDialog({ userId, offer, action, client, returnFocus, onDone, onClose }) {
  const storageKey = keyFor(userId, offer.id, action);
  const [reviewInvalid, setReviewInvalid] = useState(false);
  const refunding = action === "refund";
  const recovery = useOperationRecovery({
    client, storageKey, loadSaved: () => readIntent(storageKey, userId), field: "purchase", messages,
    requestFor: (intent) => {
      const path = `/personal-offers/${encodeURIComponent(intent.offer.id)}/${intent.action}`;
      return { path, requestKey: intent.requestKey, statusPath: `${path}/status`,
        payload: { expectedPriceRolls: intent.offer.priceRolls } };
    },
    acceptResponse: (purchase) => typeof purchase?.id === "string" && (!refunding || Boolean(purchase.refundedAt)),
    readMatches: (purchase, intent) => purchase.offerId === intent.offer.id && purchase.priceRolls === intent.offer.priceRolls &&
      purchase.businessId === intent.offer.business.id && purchase.recipientId === intent.offer.recipient.id,
    onComplete(purchase, intent) { onDone(purchase, intent.offer); },
    onReject(failure) {
      if (!confirmedRejections.has(failure.code)) return false;
      if (!["INSUFFICIENT_ROLLS", "RECIPIENT_BALANCE_LIMIT"].includes(failure.code)) setReviewInvalid(true);
      return true;
    },
    onCloseConflict: onClose,
  });
  const review = recovery.pending?.offer ?? offer;
  const expired = !refunding && new Date(review.expiresAt).getTime() <= Date.now();
  const description = refunding
    ? `${review.title} · ${formatRolls(review.priceRolls)}. Сумма будет списана с вашего баланса и вернётся покупателю (${review.recipient.name}).`
    : `${review.title} · ${formatRolls(review.priceRolls)}. Роллы будут переведены бизнесу ${review.business.name}.`;
  const confirm = refunding ? "Подтвердить возврат" : "Подтвердить оплату";
  const doing = refunding ? "Возвращаем…" : "Оплачиваем…";
  const button = recovery.pending ? "Проверить результат" : confirm;
  const busy = recovery.busy;
  const submit = (event) => {
    event.preventDefault();
    if (recovery.pending) recovery.check();
    else recovery.send({ userId, action, offer: { id: offer.id, title: offer.title, priceRolls: offer.priceRolls,
      expiresAt: offer.expiresAt, business: { id: offer.business.id, name: offer.business.name },
      recipient: { id: offer.recipient.id, name: offer.recipient.name } }, requestKey: crypto.randomUUID() });
  };
  return <AlertDialog open onOpenChange={(open, event) => {
    if (open) return;
    if (recovery.inFlight.current) event?.cancel?.();
    else onClose();
  }}>
    <AlertDialogContent className="rollapp-body" finalFocus={returnFocus}>
      <AlertDialogHeader>
        <AlertDialogTitle>{refunding ? "Вернуть роллы покупателю?" : "Оплатить персональный счёт?"}</AlertDialogTitle>
      </AlertDialogHeader>
      <div className="grid min-h-0 min-w-0 gap-2 overflow-y-auto overscroll-contain px-px">
        <AlertDialogDescription className="wrap-anywhere">{description}</AlertDialogDescription>
        {recovery.error && <Alert variant="destructive"><AlertDescription>{recovery.error}</AlertDescription></Alert>}
        {recovery.pending && recovery.result !== "conflict" && <p role="status">Операция ожидает проверки.</p>}
        {recovery.result === "missing" && <>
          <p role="status">Операция пока не записана.</p>
          {expired ? <PageActionButton variant="outline" onClick={recovery.closeUnrecorded}>Закрыть истёкший запрос</PageActionButton>
            : <PageActionButton variant="outline" disabled={busy} onClick={() => recovery.send()}>{refunding ? "Повторить возврат" : "Повторить оплату"}</PageActionButton>}
        </>}
        {recovery.result === "conflict" && <>
          <p role="status">Реквизиты операции расходятся. Сверьте историю или обратитесь в поддержку.</p>
          <PageActionButton variant="outline" onClick={recovery.closeConflict}>Закрыть запрос</PageActionButton>
        </>}
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel className="rounded-full" disabled={busy}>{recovery.pending ? "Позже" : "Отмена"}</AlertDialogCancel>
        {recovery.result !== "conflict" && <AlertDialogAction className="rounded-full" disabled={busy || (!recovery.pending && (reviewInvalid || expired))} onClick={submit}>
          {busy ? (recovery.requestMode === "check" ? "Проверяем…" : doing) : button}
        </AlertDialogAction>}
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
