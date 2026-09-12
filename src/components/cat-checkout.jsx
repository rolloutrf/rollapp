import { useEffect, useRef, useState } from "react";
import { MapPin, Search } from "lucide-react";
import { api } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";

const CDEK_PAGE_SIZE = 3;

export function restoreCatPurchase(storageKey, cats) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    const cat = cats.find((item) => item.id === saved?.cat?.id);
    return cat && saved.submitted && typeof saved.idempotencyKey === "string" && typeof saved.pickupPoint?.code === "string"
      ? { ...saved, cat } : null;
  } catch { return null; }
}

function PointDetails({ point }) {
  return <div className="flex min-w-0 flex-col gap-1">
    <span className="font-medium">{point.city}, {point.address}</span>
    <span className="text-xs text-muted-foreground">{point.region} · CDEK {point.code}</span>
    {point.workTime && <span className="text-xs text-muted-foreground">{point.workTime}</span>}
    {point.metro && <span className="text-xs text-muted-foreground">Метро: {point.metro}</span>}
  </div>;
}

function PickupPointMap({ point }) {
  if (!point.coordinates) return null;
  const { latitude, longitude } = point.coordinates;
  const search = new URLSearchParams({
    ll: `${longitude},${latitude}`,
    pt: `${longitude},${latitude},pm2rdm`,
    z: "16",
    l: "map",
    lang: "ru_RU",
  });
  return <iframe
    className="block h-40 max-w-full min-w-0 w-full rounded-lg border-0 bg-muted sm:h-64"
    src={`https://yandex.ru/map-widget/v1/?${search}`}
    title={`Карта пункта CDEK: ${point.city}, ${point.address}`}
    loading="eager"
    referrerPolicy="strict-origin-when-cross-origin"
    sandbox="allow-scripts allow-same-origin allow-popups"
    allowFullScreen
  />;
}

export function CatCheckout({ purchase, storageKey, onClose, onSuccess }) {
  const [point, setPoint] = useState(purchase.pickupPoint || null);
  const [step, setStep] = useState(purchase.submitted ? "review" : "pickup");
  const [query, setQuery] = useState("");
  const [cityCode, setCityCode] = useState(purchase.pickupPoint?.cityCode || null);
  const [cities, setCities] = useState([]);
  const [citiesLoading, setCitiesLoading] = useState(true);
  const [citiesError, setCitiesError] = useState("");
  const [citiesRetry, setCitiesRetry] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [retry, setRetry] = useState(0);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(purchase.submitted ? purchase : null);
  const [success, setSuccess] = useState(null);
  const busyRef = useRef(false);
  const cityAnchor = useRef(null);
  const requestVersion = useRef(0);
  const trimmedQuery = query.trim();
  const selectedCity = cities.find((city) => city.code === cityCode) || null;

  function selectCity(city) {
    const nextCode = city?.code || null;
    if (nextCode === cityCode) return;
    requestVersion.current += 1;
    setCityCode(nextCode); setQuery(""); setPoint(null); setOffset(0); setResult(null); setSearchError("");
  }

  useEffect(() => {
    if (step !== "pickup") return;
    let active = true;
    setCitiesLoading(true);
    setCitiesError("");
    api.get("/delivery/cdek/cities").then((data) => {
      if (active) setCities(data.cities);
    }).catch((failure) => {
      if (active) setCitiesError(failure.message);
    }).finally(() => { if (active) setCitiesLoading(false); });
    return () => { active = false; };
  }, [citiesRetry, step]);

  useEffect(() => {
    const version = ++requestVersion.current;
    setSearchError("");
    if (!cityCode || step !== "pickup") { setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await api.get(`/delivery/cdek/points?cityCode=${encodeURIComponent(cityCode)}&q=${encodeURIComponent(trimmedQuery)}&offset=${offset}&limit=${CDEK_PAGE_SIZE}`);
        if (version === requestVersion.current) setResult(data);
      } catch (failure) {
        if (version === requestVersion.current) setSearchError(failure.message);
      } finally { if (version === requestVersion.current) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); requestVersion.current += 1; };
  }, [cityCode, trimmedQuery, offset, retry, step]);

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
        if (failure.code === "INVALID_PICKUP_POINT") { setPoint(null); setStep("pickup"); setResult(null); setRetry((value) => value + 1); }
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
        {!success && step === "pickup" && !point && <>
          <Field>
            <FieldLabel htmlFor="cdek-city">Город</FieldLabel>
            <Combobox
              items={cities}
              value={selectedCity}
              onValueChange={selectCity}
              itemToStringLabel={(city) => city.label}
              itemToStringValue={(city) => city.code}
              isItemEqualToValue={(a, b) => a.code === b.code}
              disabled={citiesLoading || Boolean(citiesError)}
            >
              <div ref={cityAnchor} className="min-w-0">
                <ComboboxInput id="cdek-city" className="w-full min-w-0 [&>[data-slot=input-group-addon]]:!mr-0" placeholder={citiesLoading ? "Загружаем города…" : "Начните вводить город"} showClear={Boolean(selectedCity)} />
              </div>
              <ComboboxContent anchor={cityAnchor} className="rollapp-body min-w-0 w-(--anchor-width)">
                <ComboboxEmpty>Город не найден</ComboboxEmpty>
                <ComboboxList>{(city) => <ComboboxItem key={city.code} value={city} className="min-h-12 px-3 py-2 pr-8 text-base">
                  <span className="min-w-0 whitespace-normal">{city.label}</span>
                </ComboboxItem>}</ComboboxList>
              </ComboboxContent>
            </Combobox>
          </Field>
          {citiesError && <Alert variant="destructive"><AlertDescription className="flex flex-col gap-2">{citiesError}<Button variant="outline" onClick={() => setCitiesRetry((value) => value + 1)}>Загрузить города повторно</Button></AlertDescription></Alert>}
          <Field>
            <FieldLabel htmlFor="cdek-search">Адрес пункта выдачи</FieldLabel>
            <InputGroup><InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon><InputGroupInput id="cdek-search" value={query} disabled={!cityCode} maxLength={120} autoComplete="off" placeholder="Улица и номер дома" onChange={(event) => { requestVersion.current += 1; setQuery(event.target.value); setPoint(null); setOffset(0); setResult(null); setSearchError(""); }} /></InputGroup>
          </Field>
          <div aria-live="polite" role="status">
            {loading ? <span className="flex items-center gap-2 text-muted-foreground"><Spinner />Ищем пункты CDEK…</span>
              : !cityCode ? <span className="text-muted-foreground">Сначала выберите город, затем уточните адрес.</span>
              : !searchError && result && <span className="text-xs text-muted-foreground">{result.total ? `Найдено пунктов: ${result.total}` : "Пункты не найдены. Попробуйте другую улицу или номер дома."}</span>}
          </div>
          {searchError && <Alert variant="destructive"><AlertDescription className="flex flex-col gap-2">{searchError}<Button variant="outline" onClick={() => setRetry((value) => value + 1)}>Повторить поиск</Button></AlertDescription></Alert>}
          {!loading && !searchError && result?.stale && <p className="text-xs text-muted-foreground">CDEK временно не отвечает. Показан справочник от {new Date(result.syncedAt).toLocaleDateString("ru-RU")}.</p>}
          {!point && !loading && !searchError && result?.points.length > 0 && <RadioGroup className="min-w-0" aria-label="Пункты выдачи CDEK" value="" onValueChange={(code) => setPoint(result.points.find((item) => item.code === code))}>
            {result.points.map((item) => <label key={item.code} className="flex min-w-0 max-w-full cursor-pointer items-start gap-3 rounded-xl border p-4 hover:bg-muted/50">
              <RadioGroupItem value={item.code} aria-label={`${item.city}, ${item.address}, ${item.code}`} className="mt-1" />
              <PointDetails point={item} />
            </label>)}
          </RadioGroup>}
          {!point && !loading && !searchError && result && (offset > 0 || result.nextOffset != null) && <div className="flex justify-between gap-2">
            <Button variant="outline" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - CDEK_PAGE_SIZE))}>Предыдущие</Button>
            <Button variant="outline" disabled={result.nextOffset == null} onClick={() => setOffset(result.nextOffset)}>Следующие</Button>
          </div>}
        </>}

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
