import { useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { api } from "@/modules/runtime/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

import { CdekPickupPicker, PickupPointMap, PointDetails, useCdekPickup } from "../delivery/cdek-pickup.jsx";

export function restoreCatPurchase(storageKey, cats) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    const cat = cats.find((item) => item.id === saved?.cat?.id);
    return cat && saved.submitted && typeof saved.idempotencyKey === "string" && typeof saved.pickupPoint?.code === "string"
      ? { ...saved, cat } : null;
  } catch { return null; }
}

export function CatCheckout({ purchase, storageKey, onClose, onSuccess }) {
  const [point, setPoint] = useState(purchase.pickupPoint || null);
  const [step, setStep] = useState(purchase.submitted ? "review" : "pickup");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(purchase.submitted ? purchase : null);
  const [success, setSuccess] = useState(null);
  const busyRef = useRef(false);
  const pickup = useCdekPickup({ enabled: step === "pickup", initialCityCode: purchase.pickupPoint?.cityCode, onPointChange: setPoint });
  async function confirm() {
    if (busyRef.current || !point) return;
    const intent = pending || { cat: purchase.cat, pickupPoint: point, idempotencyKey: crypto.randomUUID(), submitted: true };
    try { sessionStorage.setItem(storageKey, JSON.stringify(intent)); }
    catch { setError("Разрешите хранение данных для Rollapp, чтобы безопасно повторить покупку при потере соединения."); return; }
    busyRef.current = true;
    setBusy(true);
    setPending(intent);
    setError("");
    try {
      const data = await api.post("/rolls/purchases", {
        productId: `cat:${intent.cat.id}`, idempotencyKey: intent.idempotencyKey, pickupPointCode: intent.pickupPoint.code,
      });
      sessionStorage.removeItem(storageKey);
      setPending(null);
      setSuccess(data.purchase);
      onSuccess();
    } catch (failure) {
      const rejected = failure.status >= 400 && failure.status < 500 && ![408, 429].includes(failure.status);
      if (rejected) {
        sessionStorage.removeItem(storageKey);
        setPending(null);
        if (failure.code === "INVALID_PICKUP_POINT") { setPoint(null); setStep("pickup"); pickup.refresh(); }
      }
      setError(rejected ? failure.message : "Ответ о покупке пока не получен. Нажмите «Проверить покупку» — повторного списания не будет.");
    } finally { busyRef.current = false; setBusy(false); }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !busyRef.current) onClose(); }}>
    <DialogContent className="rollapp-body cat-checkout flex max-h-[calc(100dvh-2rem)] min-w-0 flex-col overflow-hidden sm:max-w-2xl" showCloseButton={!busy}>
      <DialogHeader className="shrink-0 pr-10">
        <DialogTitle>{success ? "Кот куплен" : step === "pickup" ? "Выберите пункт CDEK" : "Подтвердите покупку"}</DialogTitle>
        <DialogDescription>{success ? "Пункт выдачи сохранён в заказе." : step === "pickup" ? "Шаг 1 из 2 · Найдите удобный пункт выдачи." : "Шаг 2 из 2 · Проверьте товар и пункт выдачи."}</DialogDescription>
      </DialogHeader>

      <div data-cdek-checkout-body className="flex min-h-0 min-w-0 flex-col gap-4 overflow-x-hidden overflow-y-auto overscroll-contain px-px pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-0 items-center gap-3 rounded-xl border p-3">
          <img src={purchase.cat.image} alt="" className="size-16 rounded-lg object-cover" />
          <div className="flex min-w-0 flex-col gap-1"><span className="font-medium">{purchase.cat.name} кот{purchase.cat.mood ? ` — ${purchase.cat.mood}` : ""}</span><span className="text-muted-foreground">1 000 роллов</span></div>
        </div>

        {error && !success && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {!success && step === "pickup" && !point && <CdekPickupPicker pickup={pickup} />}

        {(point || success) && <section className="flex min-w-0 max-w-full flex-col gap-3 overflow-hidden rounded-xl border p-4" aria-label="Выбранный пункт выдачи">
          <span className="flex items-center gap-2 font-medium"><MapPin className="size-5" aria-hidden="true" />{success ? "Доставка CDEK" : "Выбранный пункт"}</span>
          <PointDetails point={success?.delivery.point || point} />
          {(success?.delivery.point || point).note && step === "review" && <p className="text-xs text-muted-foreground">{(success?.delivery.point || point).note}</p>}
          <PickupPointMap point={success?.delivery.point || point} />
          {!success && step === "pickup" && <Button variant="outline" className="w-full" onClick={() => setPoint(null)}>Выбрать другой пункт</Button>}
        </section>}
        {success && <p className="break-all text-xs text-muted-foreground">Заказ № {success.id}</p>}
        {!success && step === "review" && <p>{pending ? "Проверим результат предыдущего запроса. Повторного списания не будет." : "После подтверждения с кошелька спишется 1 000 роллов."}</p>}
      </div>

      <DialogFooter className="shrink-0">
        {success ? <Button className="rounded-full" onClick={onClose}>Готово</Button> : step === "pickup" ? <>
          <Button className="rounded-full" variant="outline" onClick={onClose}>Отмена</Button>
          <Button className="rounded-full" disabled={!point} onClick={() => setStep("review")}>Продолжить</Button>
        </> : <>
          <Button className="rounded-full" variant="outline" disabled={busy} onClick={() => pending ? onClose() : setStep("pickup")}>{pending ? "Позже" : "Изменить пункт"}</Button>
          <Button className="rounded-full" disabled={busy || !point} onClick={confirm}>{busy ? <Spinner /> : null}{busy ? "Проверяем…" : pending ? "Проверить покупку" : "Купить за 1 000 роллов"}</Button>
        </>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
