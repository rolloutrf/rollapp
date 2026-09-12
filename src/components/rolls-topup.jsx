import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ExternalLink, RefreshCw, Star } from "lucide-react";
import { api } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { formatRolls } from "../../shared/rolls.js";

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
  const [accepted, setAccepted] = useState(false);
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
    if (!telegram?.initData || typeof telegram.openInvoice !== "function" || next.status !== "pending") return;
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
    if (sending.current || !config?.enabled || !config.linked || (!pending && !accepted)) return;
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
          setPending(null); setAccepted(false);
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
    setPending(null); setOrder(null); setAccepted(false); setNotice(""); setError("");
  };
  const selected = config?.packages.find((item) => item.id === packageId);
  const safeInvoice = order?.invoiceUrl && /^https:\/\/t\.me\/\$[A-Za-z0-9_-]+$/.test(order.invoiceUrl);

  return <section className="flex min-w-0 flex-col gap-6" aria-labelledby="rolls-topup-title">
    <div className="flex items-center gap-3">
      <Button variant="ghost" size="icon" aria-label="Вернуться к кошельку" onClick={onBack} disabled={busy}><ArrowLeft aria-hidden="true" /></Button>
      <h1 id="rolls-topup-title" className="font-heading text-3xl leading-9 font-semibold">Пополнить роллы</h1>
    </div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {!config ? <div role="status" className="flex items-center gap-3">{error ? <Button variant="outline" onClick={loadConfig}>Повторить</Button> : <><Spinner />Загружаем пакеты…</>}</div> : <>
      <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-4">
        <Star className="size-8 shrink-0 text-amber-400" aria-hidden="true" />
        <div className="flex flex-col gap-1"><span className="font-medium">Telegram Stars</span><p className="text-muted-foreground">100 роллов = 10 Stars · без подписки</p></div>
      </div>
      {!config.enabled && <Alert><AlertDescription>Покупка роллов временно недоступна. Попробуйте позже.</AlertDescription></Alert>}
      {!config.linked && <Alert><AlertDescription className="flex flex-col gap-3"><p>Для оплаты привяжите Telegram: откройте Rollapp из бота и войдите в свой аккаунт.</p><a href={config.botUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Открыть бота Rollapp</a><Button variant="outline" onClick={loadConfig}>Проверить привязку</Button></AlertDescription></Alert>}
      {!order ? <>
        <RadioGroup value={packageId} onValueChange={setPackageId} disabled={busy || Boolean(pending)} aria-label="Пакет роллов" className="gap-3">
          {config.packages.map((pack) => <Field key={pack.id} orientation="horizontal" className={`rounded-xl border p-4 ${packageId === pack.id ? "border-primary bg-muted/40" : ""}`}>
            <RadioGroupItem id={pack.id} value={pack.id} />
            <FieldLabel htmlFor={pack.id} className="flex flex-1 flex-wrap items-center justify-between gap-3"><span>{formatRolls(pack.rolls)}</span><span className="flex items-center gap-2 tabular-nums"><Star className="size-4 text-amber-400" aria-hidden="true" />{pack.stars} Stars</span></FieldLabel>
          </Field>)}
        </RadioGroup>
        <Accordion className="rounded-xl border px-4"><AccordionItem value="terms"><AccordionTrigger>Условия покупки</AccordionTrigger><AccordionContent><p className="text-muted-foreground">{config.terms}</p></AccordionContent></AccordionItem></Accordion>
        <Field orientation="horizontal"><Checkbox id="stars-terms" checked={accepted || Boolean(pending)} onCheckedChange={setAccepted} disabled={busy || Boolean(pending)} /><FieldLabel htmlFor="stars-terms">Принимаю условия покупки роллов</FieldLabel></Field>
        <Button onClick={buy} disabled={busy || !config.enabled || !config.linked || (!accepted && !pending)}>{busy ? <Spinner /> : <Star aria-hidden="true" />}{busy ? "Создаём счёт…" : pending ? "Получить сохранённый счёт" : `Купить за ${selected?.stars ?? "—"} Stars`}</Button>
      </> : <div className="flex flex-col gap-4 rounded-xl border p-5">
        <div role="status" aria-live="polite" className="flex items-start gap-3">
          {order.status === "paid" ? <Check className="size-6 shrink-0 text-primary" aria-hidden="true" /> : <Star className="size-6 shrink-0 text-amber-400" aria-hidden="true" />}
          <div className="flex flex-col gap-1"><p className="font-medium">{order.status === "paid" ? `${formatRolls(order.rolls)} зачислено` : order.status === "expired" ? "Срок действия счёта истёк" : order.status === "processing" ? "Ожидаем подтверждение Telegram" : `К оплате ${order.stars} Stars`}</p><p className="text-muted-foreground">{order.status === "paid" ? "Баланс обновлён. Покупка появилась в истории операций." : `Пополнение на ${formatRolls(order.rolls)}.`}</p></div>
        </div>
        {notice && order.status !== "paid" && <p className="text-muted-foreground">{notice}</p>}
        {safeInvoice && order.status === "pending" && <>
          {window.Telegram?.WebApp?.initData && <Button onClick={() => openInvoice(order)}><Star aria-hidden="true" />Оплатить в Telegram</Button>}
          <Button variant="outline" render={<a href={order.invoiceUrl} target="_blank" rel="noopener noreferrer" />}><ExternalLink aria-hidden="true" />Открыть счёт в Telegram</Button>
          <p className="text-muted-foreground">Оплачивайте из аккаунта Telegram, привязанного к Rollapp. После оплаты вернитесь сюда — баланс обновится автоматически.</p>
        </>}
        <p className="break-all text-xs text-muted-foreground">Заказ {order.id}</p>
        {!["paid", "expired"].includes(order.status) && <Button variant="outline" onClick={checkOrder}><RefreshCw aria-hidden="true" />Проверить оплату</Button>}
        {order.status === "processing" && <p className="text-muted-foreground">Если вы отменили оплату, можно создать новый счёт. Уже завершённая оплата будет учтена независимо от открытого экрана.</p>}
        <Button variant={order.status === "paid" ? "default" : "ghost"} onClick={newOrder}>{order.status === "paid" ? "Пополнить ещё" : "Создать новый счёт"}</Button>
      </div>}
      {config.supportUrl && <a href={config.supportUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground underline underline-offset-4">Помощь с оплатой и возвратами</a>}
    </>}
  </section>;
}
