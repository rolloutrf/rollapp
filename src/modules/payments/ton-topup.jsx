import { useCallback, useEffect, useRef, useState } from "react";
import { toUserFriendlyAddress } from "@tonconnect/sdk";
import { api } from "@/modules/runtime/api.js";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Drawer, DrawerBack, DrawerContent, DrawerFooter, DrawerSectionHeader } from "@/components/form-surface";
import { PageActionButton } from "@/components/page-action-button";
import { Spinner } from "@/components/ui/spinner";
import { formatRolls } from "../../../shared/modules/payments/rolls.js";
import { formatTon, quoteTonRolls, TON_MAINNET } from "../../../shared/modules/payments/ton.js";
import { clearTrackedTonOrder, isTonOrderId, readTonIntent, readTrackedTonOrder, tonOrderMatchesIntent, tonOrderStorageKey, trackTonOrder } from "./ton-topup-intent.js";
import { useOperationRecovery } from "./use-operation-recovery.js";

const configPath = "/rolls/ton";
const ordersPath = `${configPath}/orders`;
const requestTimeout = 10_000;
const getTon = (path) => api.get(path, { signal: AbortSignal.timeout(requestTimeout) });
const orderPath = (id) => `${ordersPath}/${encodeURIComponent(id)}`;
const walletRequestKey = (id) => `rollapp:ton-payment:${id}`;
const confirmedRejections = new Set(["INVALID_TON_ORDER", "TON_SELF_PAYMENT", "TON_PENDING_LIMIT", "BALANCE_LIMIT", "TON_QUOTE_CHANGED"]);
const messages = {
  unreadable: "Не удалось проверить создание счёта.",
  unknown: "Ответ о создании счёта потерян. Проверьте исходный запрос.",
  storage: "Разрешите хранение данных, чтобы восстановить счёт после перезагрузки.",
};

function wasRequested(id) {
  try { return Boolean(localStorage.getItem(walletRequestKey(id))); }
  catch { return true; }
}

function isTonOrder(order) {
  return isTonOrderId(order?.id) && Number.isSafeInteger(order.rolls) && order.rolls > 0 &&
    typeof order.nanotons === "string" && /^[1-9]\d{0,39}$/.test(order.nanotons) &&
    ["pending", "paid", "expired"].includes(order.status) && typeof order.sender === "string" &&
    typeof order.recipient === "string" && order.chain === TON_MAINNET;
}

function sameTonOrder(current, reviewed) {
  return current.id === reviewed.id && current.rolls === reviewed.rolls && current.nanotons === reviewed.nanotons &&
    current.sender === reviewed.sender && current.recipient === reviewed.recipient && current.chain === reviewed.chain;
}

export function TonTopup({ userId, wallet, connector, onPaid }) {
  const [config, setConfig] = useState(null);
  const [orders, setOrders] = useState([]);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(100);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [readError, setReadError] = useState("");
  const [configError, setConfigError] = useState("");
  const [walletError, setWalletError] = useState("");
  const [sent, setSent] = useState(false);
  const [order, setOrder] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const opener = useRef(null);
  const region = useRef(null);
  const paid = useRef(new Set());
  const initialized = useRef(false);
  const reading = useRef(false);
  const submittingRef = useRef(false);
  const active = useRef(false);
  const connected = useRef(null);
  connected.current = wallet && connector ? { wallet, connector } : null;
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;
  const inTelegram = Boolean(window.Telegram?.WebApp?.initData);
  const account = wallet?.account;
  const sender = account?.address?.toLowerCase();
  const sameWallet = config?.recipient === sender;
  const eligibleWallet = Boolean(sender && account.chain === TON_MAINNET && !sameWallet);

  function applyOrder(next) {
    setOrders((previous) => [next, ...previous.filter((entry) => entry.id !== next.id)]);
    setOrder(next);
    setSent(wasRequested(next.id));
    if (next.status === "paid") {
      clearTrackedTonOrder(userId, next.id);
      if (!paid.current.has(next.id)) { paid.current.add(next.id); onPaidRef.current?.(); }
    } else trackTonOrder(userId, next.id);
  }

  const loadConfig = useCallback(async () => {
    try {
      const settings = await getTon(configPath);
      if (active.current) { setConfig(settings); setConfigError(""); }
    } catch { if (active.current) setConfigError("Не удалось загрузить условия пополнения TON."); }
  }, []);

  const refreshOrders = useCallback(async () => {
    if (reading.current) return;
    reading.current = true;
    try {
      const { orders: entries } = await getTon(ordersPath);
      const trackedId = readTrackedTonOrder(userId);
      if (trackedId && !entries.some((item) => item.id === trackedId)) {
        const { order: tracked } = await getTon(orderPath(trackedId));
        if (tracked) entries.unshift(tracked);
      }
      if (!active.current) return;
      const newPaid = entries.some((item) => item.status === "paid" && !paid.current.has(item.id));
      for (const entry of entries) if (entry.status === "paid") {
        paid.current.add(entry.id);
        clearTrackedTonOrder(userId, entry.id);
      }
      if (initialized.current && newPaid) onPaidRef.current?.();
      initialized.current = true;
      // A late list response must not remove an order we just received by key.
      setOrders((previous) => {
        const missing = previous.find((item) => item.id === readTrackedTonOrder(userId) && !entries.some((entry) => entry.id === item.id));
        return missing ? [missing, ...entries] : entries;
      });
      setOrder((previous) => {
        const next = entries.find((entry) => entry.id === previous?.id);
        return next && previous?.status !== "paid" ? next : previous;
      });
      setReadError("");
    } catch { if (active.current) setReadError("Не удалось обновить счета TON. Проверьте соединение."); }
    finally { reading.current = false; }
  }, [userId]);

  useEffect(() => {
    if (inTelegram) return;
    active.current = true;
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void refreshOrders();
    };
    void loadConfig();
    refreshVisible();
    const timer = setInterval(refreshVisible, 10_000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      active.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [inTelegram, loadConfig, refreshOrders]);

  useEffect(() => {
    if (!order?.id) return;
    const sync = (event) => {
      if (!event.key || event.key === walletRequestKey(order.id)) setSent(wasRequested(order.id));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [order?.id]);

  const recovery = useOperationRecovery({
    storageKey: tonOrderStorageKey(userId), loadSaved: () => readTonIntent(userId), field: "order", messages,
    requestFor: (payload) => ({ path: ordersPath, payload, timeoutMs: requestTimeout, statusPath: `${ordersPath}/by-request/${encodeURIComponent(payload.idempotencyKey)}` }),
    acceptResponse: (next, mode, intent) => isTonOrder(next) && (mode === "check" || tonOrderMatchesIntent(next, intent)),
    readMatches: tonOrderMatchesIntent,
    onRecorded(next, intent) {
      if (next.status !== "paid" && readTonIntent(userId)?.idempotencyKey === intent.idempotencyKey) trackTonOrder(userId, next.id);
    },
    onComplete: applyOrder,
    onReject(cause) {
      if (!confirmedRejections.has(cause.code)) return false;
      setAccepted(false);
      if (cause.code === "TON_QUOTE_CHANGED") void loadConfig();
      return true;
    },
    onCloseConflict() { void refreshOrders(); setAccepted(false); },
  });

  // The site never offers alternate digital payment inside Telegram.
  if (inTelegram || (!open && !config?.enabled && !orders.length && !recovery.pending && !readError && !configError)) return null;
  const busy = recovery.busy || submitting;
  const price = config?.rate ? quoteTonRolls(amount, config.rate) : null;
  const canPurchase = config?.enabled && eligibleWallet && Boolean(connector);
  const canPayOrder = canPurchase && order?.status === "pending" && order.sender === sender && !sent;
  const trackedId = readTrackedTonOrder(userId);
  const visibleOrders = showHistory ? orders : orders.slice(0, 3);
  const recent = trackedId && !visibleOrders.some((item) => item.id === trackedId)
    ? [...orders.filter((item) => item.id === trackedId), ...visibleOrders] : visibleOrders;

  function openForm(event, next) {
    opener.current = event.currentTarget;
    setWalletError("");
    recovery.resetNotice();
    setOrder(next);
    setSent(next ? wasRequested(next.id) : false);
    setAccepted(false);
    setOpen(true);
  }

  function restoreFocus() {
    const target = opener.current?.isConnected ? opener.current : region.current;
    target?.focus({ preventScroll: true });
  }

  async function pay(reviewed) {
    if (submittingRef.current || !canPayOrder) return;
    const connection = connected.current;
    submittingRef.current = true;
    setSubmitting(true);
    setWalletError("");
    try {
      const [settings, result] = await Promise.all([getTon(configPath), getTon(orderPath(reviewed.id))]);
      if (!active.current) return;
      setConfig(settings);
      setConfigError("");
      const next = result.order;
      if (!isTonOrder(next) || !sameTonOrder(next, reviewed)) throw new Error("Реквизиты счёта изменились. Проверьте счёт снова.");
      applyOrder(next);
      if (next.status !== "pending") return;
      if (!settings.enabled) throw new Error("Новые оплаты TON временно приостановлены.");
      const transaction = next.transaction;
      const message = transaction?.messages?.[0];
      if (transaction?.from !== next.sender || transaction.network !== next.chain || transaction.messages?.length !== 1 ||
          message.amount !== next.nanotons || message.address !== toUserFriendlyAddress(next.recipient) || !message.payload) {
        throw new Error("Не удалось сверить данные перевода с исходным счётом.");
      }
      const current = connected.current;
      if (!current || current.wallet.account.address.toLowerCase() !== next.sender || current.wallet.account.chain !== TON_MAINNET ||
          current.connector !== connection?.connector) throw new Error("Подключите исходный кошелёк TON.");
      const key = walletRequestKey(next.id);
      const send = async () => {
        if (!active.current || connected.current?.wallet !== current.wallet) return;
        if (new Date(next.expiresAt).getTime() <= Date.now()) throw new Error("Срок действия счёта истёк.");
        if (wasRequested(next.id)) { setSent(true); return; }
        localStorage.setItem(key, "requested");
        setSent(true);
        try { await current.connector.sendTransaction(transaction, { signal: AbortSignal.timeout(120_000) }); }
        catch (cause) {
          if (cause?.name === "UserRejectsError") {
            localStorage.removeItem(key);
            if (active.current) setSent(false);
            throw new Error("Оплата отменена в кошельке.");
          }
          throw new Error("Результат запроса неизвестен. Проверьте статус счёта и историю кошелька.");
        }
      };
      if (navigator.locks) await navigator.locks.request(key, { ifAvailable: true }, async (lock) => {
        if (lock) await send();
        else if (active.current) setSent(wasRequested(next.id));
      });
      else await send();
    } catch (cause) { if (active.current) setWalletError(cause.message || "Не удалось открыть оплату в кошельке."); }
    finally { submittingRef.current = false; if (active.current) setSubmitting(false); }
  }

  function create() {
    if (!accepted || busy || !canPurchase || !price) return;
    recovery.send({ rolls: amount, sender, chain: TON_MAINNET, acceptedTerms: true, idempotencyKey: crypto.randomUUID(),
      quote: { recipient: config.recipient, nanotons: price } });
  }

  const pending = !order && recovery.pending;
  const primary = order ? canPayOrder && <Button aria-label="Открыть оплату в кошельке" disabled={busy} onClick={() => pay(order)}>
    <span className="sm:hidden">Оплатить в TON</span><span className="hidden sm:inline">Открыть оплату в кошельке</span>
  </Button> : pending ? <Button aria-label="Проверить создание счёта" disabled={busy} onClick={recovery.check}>
    <span className="sm:hidden">Проверить счёт</span><span className="hidden sm:inline">Проверить создание счёта</span>
  </Button>
      : <Button disabled={!accepted || busy || !canPurchase} onClick={create}>Создать счёт</Button>;
  return <section ref={region} tabIndex={-1} className="flex min-w-0 flex-col gap-3 border-t pt-4" aria-label="Пополнения TON">
    {recovery.pending ? <PageActionButton variant="outline" onClick={(event) => openForm(event, null)}>Восстановить счёт TON</PageActionButton>
      : config?.enabled && wallet && <PageActionButton variant="outline" disabled={!canPurchase} onClick={(event) => openForm(event, null)}>Пополнить роллы за TON</PageActionButton>}
    {config?.enabled && wallet && <p className="text-caption text-muted-foreground">{sameWallet
      ? "Для пополнения подключите кошелёк, отличный от кошелька получателя."
      : !eligibleWallet ? "Пополнение доступно в основной сети TON." : `1 TON = ${config.rate} роллов. Комиссия сети оплачивается отдельно.`}</p>}
    {config && !config.enabled && <p role="status">Новые пополнения TON приостановлены. Отправленные платежи продолжают проверяться.</p>}
    {(configError || readError) && !open && <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-3">
      <span>{configError || readError}</span><PageActionButton variant="outline" onClick={() => { void loadConfig(); void refreshOrders(); }}>Обновить счета</PageActionButton>
    </AlertDescription></Alert>}
    {recent.map((item) => <div key={item.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <span>{formatRolls(item.rolls)} · {item.status === "paid" ? "Начислены" : item.status === "expired" ? "Срок счёта истёк" : "Ожидаем оплату"}</span>
      <PageActionButton variant="outline" onClick={(event) => openForm(event, item)}>Счёт TON</PageActionButton>
    </div>)}
    {orders.length > 3 && <PageActionButton variant="outline" onClick={() => setShowHistory(!showHistory)}>{showHistory ? "Свернуть счета" : "Показать счета TON"}</PageActionButton>}
    <Drawer open={open} onAfterClose={restoreFocus} onOpenChange={(next, event) => {
      if (busy || recovery.inFlight.current || submittingRef.current) event?.cancel?.();
      else setOpen(next);
    }}>
      <DrawerContent finalFocus={false} className="rollapp-body app-drawer--form">
        <DrawerSectionHeader title="Пополнение роллов за TON" startAction={<DrawerBack disabled={busy} />} />
        <div className="app-drawer-body flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {order ? <>
            <p>{formatRolls(order.rolls)} за {formatTon(order.nanotons)} TON</p>
            <p className="wrap-anywhere text-caption text-muted-foreground">Получатель · {toUserFriendlyAddress(order.recipient)}</p>
            <p role="status">{order.status === "paid" ? "Оплата подтверждена. Роллы начислены."
              : order.status === "expired" ? "Срок счёта истёк. Уже отправленная оплата продолжит проверяться."
                : sent ? "Запрос уже открыт в кошельке. Ожидаем подтверждения в блокчейне."
                  : "Счёт готов. Проверьте сумму и получателя в кошельке перед отправкой."}</p>
            {order.status === "pending" && !sent && !canPayOrder && <p>Для оплаты подключите исходный кошелёк в основной сети TON.</p>}
            <p className="wrap-anywhere text-caption text-muted-foreground">Номер счёта · {order.id}</p>
            {order.status !== "paid" && <PageActionButton variant="outline" disabled={busy} onClick={refreshOrders}>Обновить статус счёта</PageActionButton>}
            <a href={config?.supportUrl || "https://t.me/rollappRFbot"} target="_blank" rel="noopener noreferrer" className="underline">Поддержка по оплате и возвратам</a>
          </> : pending ? <>
            <p>{formatRolls(pending.rolls)} за {formatTon(pending.quote.nanotons)} TON</p>
            <p className="wrap-anywhere text-caption text-muted-foreground">Получатель · {toUserFriendlyAddress(pending.quote.recipient)}</p>
            <p role="status">Ожидает проверки создание счёта.</p>
            {recovery.result === "missing" && <>
              <p role="status">Счёт пока не найден.</p>
              {canPurchase && sender === pending.sender && <PageActionButton variant="outline" disabled={busy} onClick={() => recovery.send()}>Повторить создание счёта</PageActionButton>}
            </>}
            {recovery.result === "conflict" && <>
              <p role="status">По этому ключу записан счёт с другими реквизитами. Сверьте историю.</p>
              <PageActionButton variant="outline" onClick={recovery.closeConflict}>Закрыть запрос</PageActionButton>
            </>}
          </> : <>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Количество роллов">
              {config?.packages?.map((value) => <Button key={value} variant={amount === value ? "default" : "outline"} aria-pressed={amount === value} disabled={busy} onClick={() => setAmount(value)}>{formatRolls(value)}</Button>)}
            </div>
            {price && <p>К оплате {formatTon(price)} TON и комиссия сети.</p>}
            {config?.recipient && <p className="wrap-anywhere text-caption text-muted-foreground">Получатель · {toUserFriendlyAddress(config.recipient)}</p>}
            <label className="flex items-start gap-3"><Checkbox checked={accepted} onCheckedChange={setAccepted} disabled={busy} />Принимаю условия разового пополнения. Роллы начисляются после подтверждения оплаты в блокчейне. По вопросам возврата обращаюсь в поддержку.</label>
          </>}
          {(recovery.error || walletError || readError || configError) && <Alert variant="destructive"><AlertDescription>{recovery.error || walletError || readError || configError}</AlertDescription></Alert>}
          {busy && <p role="status" className="flex items-center gap-2"><Spinner />Проверяем…</p>}
        </div>
        <DrawerFooter>{primary}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  </section>;
}
