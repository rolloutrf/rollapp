import { useEffect, useRef, useState } from "react";
import { toUserFriendlyAddress } from "@tonconnect/sdk";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { formatTon, TON_MAINNET } from "../../shared/ton.js";

async function request(path, body) {
  const response = await fetch(`/api/rolls/ton${path}`, {
    method: body ? "POST" : "GET", credentials: "include", signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Пополнение временно недоступно.");
  return data;
}

function wasRequested(id) {
  try { return Boolean(localStorage.getItem(`rollapp:ton-payment:${id}`)); }
  catch { return true; }
}

export function TonTopup({ wallet, connector, onPaid }) {
  const [config, setConfig] = useState(null);
  const [orders, setOrders] = useState([]);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(100);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [order, setOrder] = useState(null);
  const intent = useRef(null);
  const paid = useRef(new Set());
  const initialized = useRef(false);
  const busyRef = useRef(false);
  const active = useRef(true);
  const inTelegram = Boolean(window.Telegram?.WebApp?.initData);
  useEffect(() => {
    let alive = true;
    active.current = true;
    let loading = false;
    async function update() {
      if (inTelegram || loading || document.visibilityState === "hidden") return;
      loading = true;
      try {
        const [settings, history] = await Promise.all([request(""), request("/orders")]);
        if (!alive) return;
        setConfig(settings); setOrders(history.orders);
        setError((previous) => previous === "Не удалось обновить счета. Проверьте соединение." ? "" : previous);
        const newPaid = history.orders.some((item) => item.status === "paid" && !paid.current.has(item.id));
        for (const item of history.orders) if (item.status === "paid") paid.current.add(item.id);
        if (initialized.current && newPaid) onPaid?.();
        initialized.current = true;
        setOrder((previous) => history.orders.find((item) => item.id === previous?.id) || previous);
      } catch { if (alive) setError("Не удалось обновить счета. Проверьте соединение."); }
      finally { loading = false; }
    }
    update();
    const timer = setInterval(update, 10_000);
    return () => { alive = false; active.current = false; clearInterval(timer); };
  }, [inTelegram, onPaid]);

  // Digital purchases inside Telegram continue to use Stars, without links to
  // alternative payment methods. This checkout is for the ordinary website.
  if (inTelegram) return null;
  const sameWallet = config?.recipient === wallet.account.address.toLowerCase();
  const wrongNetwork = wallet.account.chain !== TON_MAINNET;
  const price = config?.rate ? ((BigInt(amount) * 1_000_000_000n + BigInt(config.rate) - 1n) / BigInt(config.rate)).toString() : "0";
  async function pay(existing) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      let current = existing;
      if (!current) {
        intent.current ||= { rolls: amount, sender: wallet.account.address, chain: wallet.account.chain, idempotencyKey: crypto.randomUUID(), acceptedTerms: true };
        current = (await request("/orders", intent.current)).order;
        intent.current = null;
        if (!active.current) return;
        setOrder(current);
      }
      if (!active.current) return;
      if (current.status !== "pending" || new Date(current.expiresAt).getTime() <= Date.now()) throw new Error("Срок счёта истёк. Создайте новый.");
      if (current.sender !== wallet.account.address.toLowerCase()) throw new Error("Для этого счёта подключите исходный кошелёк.");
      if (wasRequested(current.id)) throw new Error("Проверьте уже отправленный запрос в кошельке.");
      // Persist before opening the wallet. An ambiguous timeout or a page reload
      // must not offer another transfer for the same invoice on this device.
      const key = `rollapp:ton-payment:${current.id}`;
      localStorage.setItem(key, "requested");
      setSent(true);
      try { await connector.sendTransaction(current.transaction, { signal: AbortSignal.timeout(120_000) }); }
      catch (cause) {
        if (cause?.name === "UserRejectsError") { localStorage.removeItem(key); if (active.current) setSent(false); }
        throw cause;
      }
    } catch (cause) {
      if (active.current) setError(cause?.name === "UserRejectsError" ? "Оплата отменена в кошельке." : "Не удалось завершить запрос. Проверьте статус счёта и историю кошелька перед повторной оплатой.");
    } finally { busyRef.current = false; if (active.current) setBusy(false); }
  }
  return <div className="flex flex-col gap-3 border-t pt-4">
    <Button type="button" variant="outline" disabled={!config?.enabled} onClick={() => { setOrder(null); setSent(false); setAccepted(false); setError(""); setOpen(true); }}>Пополнить роллы за TON</Button>
    <p className="text-xs text-muted-foreground">{sameWallet ? "Это кошелёк получателя платежей. Для покупки роллов подключите другой кошелёк." : wrongNetwork ? "Пополнение доступно в основной сети TON." : config?.enabled ? `1 TON = ${config.rate} роллов. Комиссия сети оплачивается отдельно.` : "Пополнение за TON пока недоступно."}</p>
    {error && !open && <p role="alert" className="text-destructive">{error}</p>}
    {orders.filter((item) => item.status === "pending" || item.status === "paid").slice(0, 3).map((item) => <div key={item.id} className="flex items-center justify-between gap-3">
      <span>{item.rolls} роллов · {item.status === "paid" ? "Начислены" : "Ожидается оплата"}</span>
      {item.status === "pending" && <Button type="button" variant="ghost" onClick={() => { setOrder(item); setSent(wasRequested(item.id)); setError(""); setOpen(true); }}>Счёт</Button>}
    </div>)}
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
      <DialogContent className="not-typeset rollapp-body max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader><DialogTitle>Пополнение роллов</DialogTitle><DialogDescription>Оплата TON в основной сети</DialogDescription></DialogHeader>
        {order ? <div className="flex flex-col gap-3">
          <p>{order.rolls} роллов за {formatTon(order.nanotons)} TON</p>
          <p className="text-xs break-all text-muted-foreground">Получатель: {toUserFriendlyAddress(order.recipient)}</p>
          <p role="status">{order.status === "paid" ? "Оплата подтверждена. Роллы начислены." : order.status === "expired" ? "Срок счёта истёк. Уже отправленная оплата продолжит проверяться." : sent ? "Ожидаем подтверждения в блокчейне. Можно закрыть это окно." : "Если вы уже отправили оплату, дождитесь подтверждения. Повторный перевод не требуется."}</p>
          {order.status === "pending" && !sent && <Button disabled={busy} onClick={() => pay(order)}>{busy ? <Spinner /> : null}Открыть оплату в кошельке</Button>}
          <p className="text-xs break-all text-muted-foreground">Номер счёта: {order.id}</p>
          <a href="https://t.me/koloskof" target="_blank" rel="noreferrer" className="underline">Поддержка по оплате и возвратам</a>
        </div> : <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Количество роллов">
            {(config?.packages || []).map((value) => <Button key={value} variant={amount === value ? "default" : "outline"} aria-pressed={amount === value} disabled={busy || Boolean(intent.current)} onClick={() => setAmount(value)}>{value} роллов</Button>)}
          </div>
          <p>К оплате: {formatTon(price)} TON + комиссия сети.</p>
          {sameWallet && <p>Это кошелёк магазина. Для оплаты подключите другой кошелёк.</p>}
          {wrongNetwork && <p>Для оплаты переключите кошелёк на основную сеть TON.</p>}
          {config?.recipient && <p className="text-xs break-all text-muted-foreground">Получатель: {toUserFriendlyAddress(config.recipient)}</p>}
          <label className="flex items-start gap-3"><Checkbox checked={accepted} onCheckedChange={setAccepted} disabled={busy} />Принимаю условия: это разовое пополнение. Роллы начисляются после подтверждения оплаты в блокчейне. По вопросам возврата обращаюсь в поддержку.</label>
          <Button disabled={!accepted || busy || !config?.enabled || wrongNetwork || sameWallet} onClick={() => pay(null)}>{busy ? <Spinner /> : null}Оплатить {formatTon(price)} TON</Button>
        </div>}
        {error && <p role="alert" className="text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  </div>;
}
