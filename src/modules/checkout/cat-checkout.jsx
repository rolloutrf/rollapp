import { useState } from "react";
import { MapPin } from "lucide-react";
import { PurchaseRecoveryNotice, usePurchaseRecovery } from "./purchase-recovery.jsx";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

import { CAT_STORE_PRICE } from "../../../shared/modules/checkout/cat-store-price.js";
import { formatRolls } from "../../../shared/modules/payments/rolls.js";
import { STORE_CATS } from "../catalog-marketplace/store-cats.jsx";
import { CdekPickupPicker, PickupPointMap, PointDetails, useCdekPickup } from "../delivery/cdek-pickup.jsx";

export function restoreCatPurchase(storageKey, cats) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    const cat = cats.find((item) => item.id === saved?.cat?.id);
    return cat && saved.submitted && typeof saved.idempotencyKey === "string" && typeof saved.pickupPoint?.code === "string"
      ? { ...saved, cat, expectedPrice: saved.expectedPrice ?? 1000 } : null;
  } catch { return null; }
}

const catRejections = new Set(["INVALID_PURCHASE", "PRODUCT_NOT_FOUND", "INVALID_PICKUP_POINT", "INSUFFICIENT_ROLLS", "PRICE_CHANGED"]);

export function CatCheckout({ purchase, storageKey, onClose, onSuccess }) {
  const [point, setPoint] = useState(purchase.pickupPoint || null);
  const [step, setStep] = useState(purchase.submitted ? "review" : "pickup");
  const [success, setSuccess] = useState(null);
  const pickup = useCdekPickup({ enabled: step === "pickup", initialCityCode: purchase.pickupPoint?.cityCode, onPointChange: setPoint });
  const recovery = usePurchaseRecovery({
    storageKey, loadSaved: () => restoreCatPurchase(storageKey, STORE_CATS),
    requestFor: (intent) => ({ path: "/rolls/purchases", payload: {
      productId: `cat:${intent.cat.id}`, idempotencyKey: intent.idempotencyKey,
      pickupPointCode: intent.pickupPoint.code, expectedPrice: intent.expectedPrice,
    } }),
    acceptResponse: (result, mode) => Boolean(typeof result?.id === "string" && result.delivery?.point?.code &&
      (mode === "send" || (typeof result.productId === "string" && Number.isSafeInteger(result.amount) && ["placed", "refunded"].includes(result.status)))),
    readMatches: (result, intent) => result.productId === `cat:${intent.cat.id}` && result.delivery.point.code === intent.pickupPoint.code &&
      result.amount === intent.expectedPrice,
    onComplete(result, intent) {
      setSuccess({ ...result, cat: intent.cat, amount: result.amount ?? intent.expectedPrice });
      if (result.status !== "refunded") onSuccess(intent.cat, result.amount ?? intent.expectedPrice);
    },
    onReject(failure) {
      if (failure.code === "INVALID_PICKUP_POINT") { setPoint(null); setStep("pickup"); pickup.refresh(); }
      return catRejections.has(failure.code);
    },
    onCloseConflict: onClose,
  });
  const { pending, busy, error, result, requestMode } = recovery;
  const cat = success?.cat ?? pending?.cat ?? purchase.cat;
  const selectedPoint = success?.delivery.point ?? pending?.pickupPoint ?? point;
  const price = formatRolls(success?.amount ?? pending?.expectedPrice ?? CAT_STORE_PRICE);
  const confirm = () => recovery.send(!pending && point && {
    cat, pickupPoint: point, idempotencyKey: crypto.randomUUID(), expectedPrice: CAT_STORE_PRICE, submitted: true,
  });

  return <Dialog open onOpenChange={(open) => { if (!open && !recovery.inFlight.current) onClose(); }}>
    <DialogContent className="rollapp-body cat-checkout flex max-h-[calc(100dvh-2rem)] min-w-0 flex-col overflow-hidden sm:max-w-2xl" showCloseButton={!busy}>
      <DialogHeader className="shrink-0 pr-10">
        <DialogTitle>{success ? (success.status === "refunded" ? "Роллы возвращены" : "Кот куплен") : step === "pickup" ? "Выберите пункт CDEK" : "Подтвердите покупку"}</DialogTitle>
        <DialogDescription>{success ? (success.status === "refunded" ? "Сумма возвращена в кошелёк." : "Пункт выдачи сохранён в заказе.") : step === "pickup" ? "Шаг 1 из 2 · Найдите удобный пункт выдачи." : "Шаг 2 из 2 · Проверьте товар и пункт выдачи."}</DialogDescription>
      </DialogHeader>

      <div data-cdek-checkout-body className="flex min-h-0 min-w-0 flex-col gap-4 overflow-x-hidden overflow-y-auto overscroll-contain px-px pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-0 items-center gap-3 rounded-xl border p-3">
          <img src={cat.image} alt="" className="size-16 rounded-lg object-cover" />
          <div className="flex min-w-0 flex-col gap-1"><span className="font-medium">{cat.name} кот{cat.mood ? ` — ${cat.mood}` : ""}</span><span className="text-muted-foreground">{price}</span></div>
        </div>

        {!success && <PurchaseRecoveryNotice error={error} result={result} />}
        {!success && step === "pickup" && !point && <CdekPickupPicker pickup={pickup} />}

        {selectedPoint && <section className="flex min-w-0 max-w-full flex-col gap-3 overflow-hidden rounded-xl border p-4" aria-label="Выбранный пункт выдачи">
          <span className="flex items-center gap-2 font-medium"><MapPin className="size-5" aria-hidden="true" />{success ? "Доставка CDEK" : "Выбранный пункт"}</span>
          <PointDetails point={selectedPoint} />
          {selectedPoint.note && step === "review" && <p className="text-xs text-muted-foreground">{selectedPoint.note}</p>}
          <PickupPointMap point={selectedPoint} />
          {!success && step === "pickup" && <Button variant="outline" className="w-full" onClick={() => setPoint(null)}>Выбрать другой пункт</Button>}
        </section>}
        {success && <p className="break-all text-xs text-muted-foreground">Заказ № {success.id}</p>}
        {!success && step === "review" && <p>{pending ? "Проверка ищет исходный заказ в журнале." : `После подтверждения с кошелька спишется ${price}.`}</p>}
      </div>

      <DialogFooter className="shrink-0 flex-row flex-wrap justify-end">
        {success ? <Button className="rounded-full" onClick={onClose}>Готово</Button> : step === "pickup" ? <>
          <Button className="rounded-full" variant="outline" onClick={onClose}>Отмена</Button>
          <Button className="rounded-full" disabled={!point} onClick={() => setStep("review")}>Продолжить</Button>
        </> : <>
          <Button className="rounded-full" variant="outline" disabled={busy} onClick={() => pending ? onClose() : setStep("pickup")}>{pending ? "Позже" : "Изменить пункт"}</Button>
          {pending && result === "missing" && <Button className="rounded-full" variant="outline" disabled={busy} onClick={confirm}>Оплатить снова</Button>}
          {pending && result === "conflict" && <Button className="rounded-full" variant="outline" disabled={busy} onClick={recovery.closeConflict}>Закрыть запрос</Button>}
          <Button className="rounded-full" disabled={busy || !selectedPoint} onClick={pending ? recovery.check : confirm}>
            {busy && <Spinner />}{busy ? (requestMode === "send" ? "Оплачиваем…" : "Проверяем…") : pending ? "Проверить покупку" : `Купить за ${price}`}
          </Button>
        </>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
