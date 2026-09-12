import { useCallback, useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import { api } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { formatRolls } from "../../shared/rolls.js";
import { isStarInvoiceUrl } from "../../shared/roll-stars.js";

function readPending(key) {
  try {
    const value = JSON.parse(sessionStorage.getItem(key));
    return typeof value?.request?.idempotencyKey === "string" && typeof value?.request?.packageId === "string" ? value : null;
  } catch { return null; }
}

export function RollsTopup({ user, onBack, onPaid }) {
  const storageKey = `rollapp:stars-order:${user.id}`;
  const [pending, setPending] = useState(() => readPending(storageKey));
  const [order, setOrder] = useState(null);
  const [config, setConfig] = useState(null);
  const [packageId, setPackageId] = useState(pending?.request.packageId || "rolls-100");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const mounted = useRef(false);
  const sending = useRef(false);
  const notified = useRef(null);
  const activeOrderId = useRef(pending?.orderId || null);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const loadConfig = useCallback(async () => {
    try {
      const result = await api.get("/rolls/stars");
      if (mounted.current) { setConfig(result); setError(""); }
    } catch (cause) { if (mounted.current) setError(cause.message); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadConfig();
    return () => { mounted.current = false; };
  }, [loadConfig]);

  const applyOrder = useCallback((next) => {
    if (!mounted.current || next.id !== activeOrderId.current) return;
    setOrder(next);
    setError("");
    if (next.status === "paid" && notified.current !== next.id) {
      notified.current = next.id;
      onPaidRef.current();
    }
  }, []);

  const checkOrder = useCallback(async () => {
    if (!pending?.orderId) return;
    try {
      const result = await api.get(`/rolls/stars/orders/${encodeURIComponent(pending.orderId)}`);
      applyOrder(result.order);
    } catch (cause) { if (mounted.current) setError(cause.message); }
  }, [pending?.orderId, applyOrder]);

  useEffect(() => {
    if (!pending?.orderId || order?.status === "paid" || order?.status === "expired") return;
    let checking = false;
    const poll = async () => {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      try { await checkOrder(); } finally { checking = false; }
    };
    poll();
    const timer = window.setInterval(poll, 3_000);
    window.addEventListener("focus", poll);
    document.addEventListener("visibilitychange", poll);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", poll);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [pending?.orderId, order?.status, checkOrder]);

  const openInvoice = (next) => {
    const telegram = window.Telegram?.WebApp;
    if (!telegram?.initData || typeof telegram.openInvoice !== "function" || next.status !== "pending" || !isStarInvoiceUrl(next.invoiceUrl)) return;
    try {
      telegram.openInvoice(next.invoiceUrl, (status) => {
        if (!mounted.current || next.id !== activeOrderId.current) return;
        setNotice(status === "cancelled" ? "Вы закрыли оплату. Состояние счёта можно проверить ниже."
          : status === "failed" ? "Telegram не завершил оплату. Проверьте состояние счёта."
            : "Проверяем подтверждение оплаты Telegram…");
        // A client callback only prompts a server check; it cannot credit rolls.
        api.get(`/rolls/stars/orders/${encodeURIComponent(next.id)}`).then((result) => applyOrder(result.order))
          .catch((cause) => { if (mounted.current) setError(cause.message); });
      });
    } catch { setNotice("Откройте счёт по ссылке ниже или обновите Telegram."); }
  };

  const buy = async () => {
    if (sending.current || !config?.enabled || !config.linked) return;
    const intent = pending || { request: { packageId, idempotencyKey: crypto.randomUUID(), termsVersion: config.termsVersion } };
    try { sessionStorage.setItem(storageKey, JSON.stringify(intent)); }
    catch { setError("Разрешите хранение данных, чтобы сохранить и проверить счёт после оплаты."); return; }
    sending.current = true;
    setPending(intent);
    setBusy(true);
    setError("");
    try {
      const result = await api.post("/rolls/stars/orders", intent.request);
      const saved = { ...intent, orderId: result.order.id };
      sessionStorage.setItem(storageKey, JSON.stringify(saved));
      if (!mounted.current) return;
      activeOrderId.current = result.order.id;
      setPending(saved);
      applyOrder(result.order);
      openInvoice(result.order);
    } catch (cause) {
      if (mounted.current) {
        if (cause.status === 400 && !intent.orderId) {
          sessionStorage.removeItem(storageKey);
          setPending(null);
        }
        setError(cause.message);
      }
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const newOrder = () => {
    sessionStorage.removeItem(storageKey);
    activeOrderId.current = null;
    setPending(null); setOrder(null); setNotice(""); setError("");
  };
  const selected = config?.packages.find((item) => item.id === packageId);
  const safeInvoice = isStarInvoiceUrl(order?.invoiceUrl);
  const purchaseRolls = order?.rolls ?? selected?.rolls;
  const purchaseStars = order?.stars ?? selected?.stars;
  const topupTitle = purchaseRolls != null && purchaseStars != null
    ? `${formatRolls(purchaseRolls)} за ${purchaseStars} Stars`
    : "Пополнить роллы";

  return <section className="flex min-w-0 flex-col gap-6" aria-labelledby="rolls-topup-title">
    <div className="flex flex-col items-start gap-1">
      <h1 id="rolls-topup-title" className="font-heading text-3xl leading-9 font-semibold">{topupTitle}</h1>
      {order && <p className="break-all text-muted-foreground">Номер заказа: {order.id}</p>}
    </div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {!config ? <div role="status" className="flex items-center gap-3">{error ? <Button variant="outline" onClick={loadConfig}>Повторить</Button> : <><Spinner />Загружаем пакеты…</>}</div> : <>
      {safeInvoice && order?.status === "pending" && <p>Оплачивайте из аккаунта Telegram, привязанного к Rollapp. После оплаты вернитесь сюда — баланс обновится автоматически.</p>}
      {!config.enabled && <Alert><AlertDescription>Покупка роллов временно недоступна. Попробуйте позже.</AlertDescription></Alert>}
      {!config.linked && <Alert><AlertDescription className="flex flex-col gap-3"><p>Для оплаты привяжите Telegram: откройте Rollapp из бота и войдите в свой аккаунт.</p><a href={config.botUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Открыть бота Rollapp</a><Button variant="outline" onClick={loadConfig}>Проверить привязку</Button></AlertDescription></Alert>}
      {!order ? <>
        <RadioGroup value={packageId} onValueChange={setPackageId} disabled={busy || Boolean(pending)} aria-label="Пакет роллов" className="gap-3">
          {config.packages.map((pack) => <Field key={pack.id} orientation="horizontal" className={`rounded-xl border p-4 ${packageId === pack.id ? "border-primary bg-muted/40" : ""}`}>
            <RadioGroupItem id={pack.id} value={pack.id} />
            <FieldLabel htmlFor={pack.id} className="flex flex-1 flex-wrap items-center justify-between gap-3"><span>{formatRolls(pack.rolls)}</span><span className="flex items-center gap-2 tabular-nums"><Star className="size-4 text-amber-400" aria-hidden="true" />{pack.stars} Stars</span></FieldLabel>
          </Field>)}
        </RadioGroup>
        <Button onClick={buy} disabled={busy || !config.enabled || !config.linked}>{busy && <Spinner />}{busy ? "Создаём счёт…" : pending ? "Получить сохранённый счёт" : `Купить за ${selected?.stars ?? "—"} Stars`}</Button>
      </> : <>
        {!safeInvoice && order.status === "pending" && <p role="status">Готовим счёт Telegram. Ссылка появится автоматически — можно оставить эту страницу открытой или вернуться позже.</p>}
        {notice && order.status !== "paid" && <p className="text-muted-foreground">{notice}</p>}
        {order.status === "processing" && <p className="text-muted-foreground">Если вы отменили оплату, можно создать новый счёт. Уже завершённая оплата будет учтена независимо от открытого экрана.</p>}
        <div className="flex flex-col gap-3">
          {safeInvoice && order.status === "pending" && <>
            {window.Telegram?.WebApp?.initData && <Button onClick={() => openInvoice(order)}>Оплатить в Telegram</Button>}
            <Button render={<a href={order.invoiceUrl} target="_blank" rel="noopener noreferrer" />}>Открыть счёт в Telegram</Button>
          </>}
          {!["paid", "expired"].includes(order.status) && <Button variant="outline" onClick={checkOrder}>Проверить оплату</Button>}
          <Button variant={order.status === "paid" ? "default" : "ghost"} onClick={newOrder}>{order.status === "paid" ? "Пополнить ещё" : "Создать новый счёт"}</Button>
        </div>
      </>}
    </>}
  </section>;
}
