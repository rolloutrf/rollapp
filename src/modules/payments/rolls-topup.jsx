import { useCallback, useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import { api } from "@/modules/runtime/api.js";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { PageActionButton } from "@/components/page-action-button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { formatRolls } from "../../../shared/modules/payments/rolls.js";
import { isStarInvoiceUrl, ROLL_STAR_PACKAGES } from "../../../shared/modules/payments/roll-stars.js";

const starsOrdersPath = "/rolls/stars/orders";
const isUuid = (value) => typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const isTerminal = (order) => order?.status === "paid" || order?.status === "expired";

function starStorageKey(userId) {
  return `rollapp:stars-order:${userId}`;
}

export function restoreStarTopup(userId) {
  try {
    const intent = JSON.parse(sessionStorage.getItem(starStorageKey(userId)));
    const { request, orderId } = intent ?? {};
    if (!request || !isUuid(request.idempotencyKey) || typeof request.packageId !== "string" ||
        typeof request.termsVersion !== "string" || (orderId !== undefined && !isUuid(orderId))) return null;
    return intent;
  } catch { return null; }
}

function clearStarTopup(userId, requestKey) {
  try {
    if (requestKey && restoreStarTopup(userId)?.request.idempotencyKey === requestKey) sessionStorage.removeItem(starStorageKey(userId));
  } catch { /* The same request remains recoverable after storage returns. */ }
}

function isStarOrder(order) {
  return isUuid(order?.id) && Number.isSafeInteger(order.rolls) && order.rolls > 0 &&
    Number.isSafeInteger(order.stars) && order.stars > 0 && ["pending", "processing", "paid", "expired"].includes(order.status);
}

export function RollsTopup({ user, onBack, onPaid }) {
  const [pending, setPending] = useState(() => restoreStarTopup(user.id));
  const [order, setOrder] = useState(null);
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState("");
  const [packageId, setPackageId] = useState(pending?.request.packageId || ROLL_STAR_PACKAGES[0].id);
  const [requestMode, setRequestMode] = useState(null);
  const [verification, setVerification] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const mounted = useRef(false);
  const writingOrFinding = useRef(false);
  const checkingOrder = useRef(null);
  const intentRef = useRef(pending);
  const orderRef = useRef(null);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const loadConfig = useCallback(async () => {
    setConfigError("");
    try {
      const result = await api.get("/rolls/stars");
      if (mounted.current) setConfig(result);
    } catch (cause) { if (mounted.current) setConfigError(cause.message); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void loadConfig();
    return () => { mounted.current = false; };
  }, [loadConfig]);

  const applyOrder = useCallback((next) => {
    const current = orderRef.current;
    const intent = intentRef.current;
    if (!mounted.current || next.id !== intent?.orderId || current?.status === "paid") return;
    if ((current?.status === "processing" || current?.status === "expired") && next.status === "pending") return;
    if (current?.status === "processing" && next.status === "expired") return;
    orderRef.current = next;
    setOrder(next);
    setError("");
    if (isTerminal(next)) clearStarTopup(user.id, intent.request.idempotencyKey);
    if (next.status === "paid") onPaidRef.current?.();
  }, [user.id]);

  const checkOrder = useCallback(async () => {
    const id = intentRef.current?.orderId;
    if (!id || checkingOrder.current === id) return;
    checkingOrder.current = id;
    try {
      const { order: next } = await api.get(`${starsOrdersPath}/${encodeURIComponent(id)}`);
      if (!isStarOrder(next) || next.id !== id) throw new Error("Не удалось прочитать состояние счёта.");
      applyOrder(next);
    } catch (cause) {
      if (mounted.current && intentRef.current?.orderId === id && !isTerminal(orderRef.current)) setError(cause.message);
    } finally {
      if (checkingOrder.current === id) checkingOrder.current = null;
    }
  }, [applyOrder]);

  useEffect(() => {
    if (!pending?.orderId || isTerminal(order)) return;
    const poll = () => { if (document.visibilityState === "visible") void checkOrder(); };
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
    if (!config?.enabled || next.id !== orderRef.current?.id || orderRef.current.status !== "pending") return;
    const telegram = window.Telegram?.WebApp;
    if (!telegram?.initData || typeof telegram.openInvoice !== "function" || next.status !== "pending" || !isStarInvoiceUrl(next.invoiceUrl)) return;
    try {
      telegram.openInvoice(next.invoiceUrl, (status) => {
        if (!mounted.current || next.id !== intentRef.current?.orderId || isTerminal(orderRef.current)) return;
        setNotice(status === "cancelled" ? "Вы закрыли оплату. Состояние счёта можно проверить ниже."
          : status === "failed" ? "Telegram не завершил оплату. Проверьте состояние счёта."
            : "Проверяем подтверждение оплаты Telegram…");
        void checkOrder();
      });
    } catch { setNotice("Откройте счёт по ссылке ниже или обновите Telegram."); }
  };

  const runRequest = async (mode, intent) => {
    if (!intent || writingOrFinding.current || (mode === "send" && (!config?.enabled || !config.linked))) return;
    writingOrFinding.current = true;
    setRequestMode(mode);
    setVerification(null);
    setError("");
    const { request } = intent;
    try {
      const result = mode === "find"
        ? await api.get(`${starsOrdersPath}/by-request/${encodeURIComponent(request.idempotencyKey)}`)
        : await api.post(starsOrdersPath, request);
      const next = result?.order;
      if (mode === "find" && next === null) {
        if (mounted.current) setVerification("missing");
        return;
      }
      if (!isStarOrder(next)) throw new Error("Не удалось прочитать состояние счёта.");
      if ((intent.orderId && next.id !== intent.orderId) || (mode === "find" &&
          (next.packageId !== request.packageId || next.termsVersion !== request.termsVersion))) {
        if (mounted.current) setVerification("conflict");
        return;
      }
      const saved = { ...intent, orderId: next.id };
      try {
        if (restoreStarTopup(user.id)?.request.idempotencyKey === request.idempotencyKey) {
          sessionStorage.setItem(starStorageKey(user.id), JSON.stringify(saved));
        }
      } catch { /* The stored request key can still locate the order. */ }
      if (!mounted.current) return;
      intentRef.current = saved;
      setPending(saved);
      applyOrder(next);
      if (mode === "send") openInvoice(next);
    } catch (cause) {
      if (!mounted.current) return;
      if (cause.code === "IDEMPOTENCY_CONFLICT") setVerification("conflict");
      else if (mode === "send" && !intent.orderId && ["INVALID_STAR_ORDER", "TELEGRAM_LINK_REQUIRED", "BALANCE_LIMIT"].includes(cause.code)) {
        clearStarTopup(user.id, request.idempotencyKey);
        intentRef.current = null;
        setPending(null);
      }
      setError(cause.message || "Не удалось проверить счёт.");
    } finally {
      writingOrFinding.current = false;
      if (mounted.current) setRequestMode(null);
    }
  };

  const buy = () => {
    if (writingOrFinding.current || !config?.enabled || !config.linked) return;
    const saved = restoreStarTopup(user.id);
    if (saved) {
      intentRef.current = saved;
      setPending(saved);
      return;
    }
    const intent = { request: { packageId, idempotencyKey: crypto.randomUUID(), termsVersion: config.termsVersion } };
    try { sessionStorage.setItem(starStorageKey(user.id), JSON.stringify(intent)); }
    catch { setError("Разрешите хранение данных, чтобы сохранить и проверить счёт после оплаты."); return; }
    intentRef.current = intent;
    setPending(intent);
    void runRequest("send", intent);
  };

  const newOrder = () => {
    if (writingOrFinding.current) return;
    clearStarTopup(user.id, intentRef.current?.request.idempotencyKey);
    intentRef.current = null;
    orderRef.current = null;
    setPending(null); setOrder(null); setNotice(""); setError(""); setVerification(null);
    if (config?.packages.length && !config.packages.some((pack) => pack.id === packageId)) setPackageId(config.packages[0].id);
  };

  const busy = requestMode !== null;
  const canBuy = config?.enabled && config.linked;
  const awaitingOrder = pending && !pending.orderId;
  const selectedId = pending?.request.packageId ?? packageId;
  const selected = (config?.packages ?? ROLL_STAR_PACKAGES).find((item) => item.id === selectedId);
  const safeInvoice = isStarInvoiceUrl(order?.invoiceUrl);
  const awaitingInvoice = order?.status === "pending" && !safeInvoice;
  const purchaseRolls = order?.rolls ?? selected?.rolls;
  const purchaseStars = order?.stars ?? selected?.stars;
  const showPrice = (order || pending || config?.enabled) && purchaseRolls != null && purchaseStars != null;

  return <section className="flex min-w-0 flex-col gap-6" aria-labelledby="rolls-topup-title">
    <div className="flex flex-col items-start gap-1">
      <h1 id="rolls-topup-title" className="font-heading text-3xl leading-9 font-semibold">
        {showPrice ? `${formatRolls(purchaseRolls)} за ${purchaseStars} Stars` : "Пополнение роллов"}
      </h1>
      {order && <p className="wrap-anywhere text-muted-foreground">Номер счёта · {order.id}</p>}
    </div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {configError && <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-3">
      <p>{configError}</p><PageActionButton variant="outline" onClick={loadConfig}>Повторить загрузку пакетов</PageActionButton>
    </AlertDescription></Alert>}
    {!config && !configError && <p role="status" className="flex items-center gap-3"><Spinner />Загружаем пакеты…</p>}
    {config && !config.enabled && <p role="status">Покупка роллов временно отключена. Уже принятые платежи учитываются.</p>}
    {config?.enabled && !config.linked && !order && !pending && <Alert><AlertDescription className="flex flex-col gap-3">
      <p>Для оплаты откройте Rollapp из бота и войдите в свой аккаунт.</p>
      <a href={config.botUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Открыть бота Rollapp</a>
      <Button variant="outline" onClick={loadConfig}>Проверить привязку</Button>
    </AlertDescription></Alert>}
    {config?.enabled && !pending && !order && <>
      <RadioGroup value={packageId} onValueChange={setPackageId} disabled={busy} aria-label="Пакет роллов" className="gap-3">
        {config.packages.map((pack) => <Field key={pack.id} orientation="horizontal" className={`rounded-xl border p-4 ${packageId === pack.id ? "border-primary bg-muted/40" : ""}`}>
          <RadioGroupItem id={pack.id} value={pack.id} />
          <FieldLabel htmlFor={pack.id} className="flex flex-1 flex-wrap items-center justify-between gap-3"><span>{formatRolls(pack.rolls)}</span><span className="flex items-center gap-2 tabular-nums"><Star className="size-4 text-amber-400" aria-hidden="true" />{pack.stars} Stars</span></FieldLabel>
        </Field>)}
      </RadioGroup>
      {config.terms && <p id="rolls-stars-terms" className="text-muted-foreground">{config.terms} Нажимая «Купить», вы принимаете эти условия.</p>}
      <Button onClick={buy} disabled={busy || !canBuy || !selected} aria-describedby={config.terms ? "rolls-stars-terms" : undefined}>
        Купить за {selected?.stars ?? "—"} Stars
      </Button>
    </>}
    {awaitingOrder && <div className="flex flex-col gap-3">
      <p role="status">Счёт ожидает проверки.</p>
      {verification === "missing" && <p role="status">Счёт пока не найден.</p>}
      {verification !== "conflict" && <>
        <Button variant="outline" onClick={() => runRequest("find", pending)} disabled={busy} aria-busy={Boolean(busy) || undefined}>
          {requestMode === "find" ? "Ищем счёт…" : requestMode === "send" ? "Создаём счёт…" : "Найти счёт"}
        </Button>
        {verification === "missing" && canBuy && <Button onClick={() => runRequest("send", pending)} disabled={busy}>Повторить создание счёта</Button>}
      </>}
    </div>}
    {verification === "conflict" && <Alert><AlertDescription className="flex flex-col gap-3">
      <p>По этому ключу сохранён счёт с другими условиями. Сверьте операции в кошельке.</p>
      <PageActionButton variant="outline" onClick={newOrder}>Закрыть запрос</PageActionButton>
    </AlertDescription></Alert>}
    {pending?.orderId && !order && <Button variant="outline" onClick={checkOrder}>Проверить оплату</Button>}
    {order && <div className="flex flex-col gap-3">
      {awaitingInvoice && <p role="status">{config?.invoiceDelivery === "direct"
        ? "Ссылка на счёт ещё не готова."
        : "Готовим счёт Telegram. Ссылка появится автоматически, можно вернуться позже."}</p>}
      {awaitingInvoice && canBuy && config.invoiceDelivery === "direct" && verification !== "conflict" &&
        <Button variant="outline" onClick={() => runRequest("send", pending)} disabled={busy} aria-busy={Boolean(busy) || undefined}>Запросить ссылку снова</Button>}
      {safeInvoice && order.status === "pending" && config?.enabled && <>
        <p>К оплате {order.stars} Stars</p>
        <p>Оплачивайте из аккаунта Telegram, привязанного к Rollapp. Баланс обновится после подтверждения оплаты.</p>
        {window.Telegram?.WebApp?.initData && <Button onClick={() => openInvoice(order)}>Оплатить в Telegram</Button>}
        <Button nativeButton={false} role="link" render={<a href={order.invoiceUrl} target="_blank" rel="noopener noreferrer" />}>Открыть счёт в Telegram</Button>
      </>}
      {notice && !isTerminal(order) && <p className="text-muted-foreground">{notice}</p>}
      {order.status === "processing" && <p role="status">Ожидаем подтверждение Telegram. Уже завершённая оплата будет учтена, даже если вы закроете эту страницу.</p>}
      {order.status === "paid" && <p role="status">Зачислено {formatRolls(order.rolls)}.</p>}
      {order.status === "expired" && <p role="status">Срок действия счёта истёк.</p>}
      {!isTerminal(order) && <Button variant="outline" onClick={checkOrder} disabled={busy}>Проверить оплату</Button>}
      {config?.enabled && <Button variant={order.status === "paid" ? "default" : "ghost"} onClick={newOrder} disabled={busy}>
        {order.status === "paid" ? "Пополнить ещё" : "Создать новый счёт"}
      </Button>}
    </div>}
    <PageActionButton variant="outline" onClick={onBack} disabled={busy}>К кошельку</PageActionButton>
  </section>;
}
