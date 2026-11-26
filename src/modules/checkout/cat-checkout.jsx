import { useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, MapPin, X } from "lucide-react";
import { PurchaseRecoveryNotice, usePurchaseRecovery } from "./purchase-recovery.jsx";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerSectionHeader } from "@/components/form-surface";
import { PageActionButton } from "@/components/page-action-button";

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
  const [open, setOpen] = useState(true);
  const titleRef = useRef(null);
  const bodyRef = useRef(null);
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
    onCloseConflict: () => setOpen(false),
  });
  const { pending, busy, error, result, requestMode } = recovery;
  const cat = success?.cat ?? pending?.cat ?? purchase.cat;
  const selectedPoint = success?.delivery.point ?? pending?.pickupPoint ?? point;
  const price = formatRolls(success?.amount ?? pending?.expectedPrice ?? CAT_STORE_PRICE);
  const confirm = () => recovery.send(!pending && point && {
    cat, pickupPoint: point, idempotencyKey: crypto.randomUUID(), expectedPrice: CAT_STORE_PRICE, submitted: true,
  });

  const view = success ? "complete" : step;
  const previousView = useRef(view);
  useLayoutEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    bodyRef.current?.scrollTo({ top: 0, behavior: "instant" });
    titleRef.current?.focus({ preventScroll: true });
  }, [view]);

  const title = success ? (success.status === "refunded" ? "Роллы возвращены" : "Кот куплен")
    : step === "pickup" ? "Выберите пункт CDEK" : "Подтвердите покупку";
  const description = success ? (success.status === "refunded" ? "Сумма возвращена в кошелёк." : "Пункт выдачи сохранён в заказе.")
    : step === "pickup" ? "Шаг 1 из 2 · Найдите удобный пункт выдачи." : "Шаг 2 из 2 · Проверьте товар и пункт выдачи.";

  return <Drawer mobileDrawer open={open} onAfterClose={onClose} onOpenChange={(nextOpen, event) => {
    if (nextOpen) return;
    if (recovery.inFlight.current) event?.cancel?.();
    else setOpen(false);
  }}>
    <DrawerContent className="rollapp-body cat-checkout app-drawer--form" initialFocus={titleRef}>
      <DrawerSectionHeader title={title} titleRef={titleRef} description={description} endAction={
        <DrawerClose render={<Button type="button" variant="outline" size="icon" disabled={busy} />} aria-label="Закрыть оформление покупки">
          <X aria-hidden="true" />
        </DrawerClose>
      } />

      <div ref={bodyRef} data-cdek-checkout-body className="app-drawer-body flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4 wrap-anywhere">
        <div className="flex min-w-0 items-center gap-3 rounded-xl border p-3">
          <img src={cat.image} alt="" className="size-16 rounded-lg object-cover" />
          <div className="flex min-w-0 flex-col gap-1"><span className="font-medium">{cat.name} кот{cat.mood ? ` — ${cat.mood}` : ""}</span><span className="text-muted-foreground">{price}</span></div>
        </div>

        {!success && <PurchaseRecoveryNotice error={error} result={result} />}
        {pending && result === "missing" && <PageActionButton type="button" variant="outline" className="self-start" disabled={busy} onClick={confirm}>Оплатить снова</PageActionButton>}
        {pending && result === "conflict" && <PageActionButton type="button" variant="outline" className="self-start" disabled={busy} onClick={recovery.closeConflict}>Закрыть запрос</PageActionButton>}
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

      <DrawerFooter>
        {success ? <DrawerClose render={<Button type="button" />}>Готово</DrawerClose> : step === "pickup" ? <>
          <DrawerClose render={<Button type="button" variant="outline" />}>Отмена</DrawerClose>
          <Button type="button" disabled={!point} onClick={() => setStep("review")}>Продолжить</Button>
        </> : <>
          {pending
            ? <DrawerClose render={<Button type="button" variant="outline" disabled={busy} />}>Позже</DrawerClose>
            : <Button type="button" variant="outline" size="icon" data-control-icon aria-label="Изменить пункт" title="Изменить пункт" onClick={() => setStep("pickup")}>
              <ArrowLeft aria-hidden="true" />
            </Button>}
          <Button type="button" disabled={busy || !selectedPoint} onClick={pending ? recovery.check : confirm} aria-busy={Boolean(busy) || undefined}>
            {busy ? (requestMode === "send" ? "Оплачиваем…" : "Проверяем…") : pending ? "Проверить покупку" : `Купить за ${price}`}
          </Button>
        </>}
      </DrawerFooter>
    </DrawerContent>
  </Drawer>;
}
