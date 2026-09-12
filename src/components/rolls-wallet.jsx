import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Check, Coins, Gift, Plus, Search, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { MakiIcon } from "@/components/maki-icon";
import { RollsTopup } from "@/components/rolls-topup";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { formatRolls, ROLLS_MAX_TRANSFER } from "../../shared/rolls.js";

function PersonAvatar({ person }) {
  return <Avatar className="size-12 shrink-0">
    {person.avatarUrl && <AvatarImage src={person.avatarUrl} alt="" />}
    <AvatarFallback>{person.name.trim().slice(0, 1).toUpperCase()}</AvatarFallback>
  </Avatar>;
}

function restoredTransfer(storageKey) {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey));
    return value?.recipient?.id === value?.payload?.recipientId
      && typeof value?.recipient?.name === "string"
      && typeof value?.payload?.idempotencyKey === "string"
      && Number.isSafeInteger(value?.payload?.amount) ? value : null;
  } catch { return null; }
}

export function RollsWallet({ user }) {
  const storageKey = `rollapp:pending-roll-transfer:${user.id}`;
  const [pending, setPending] = useState(() => restoredTransfer(storageKey));
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [recipient, setRecipient] = useState(pending?.recipient || null);
  const [amount, setAmount] = useState(pending ? String(pending.payload.amount) : "");
  const [note, setNote] = useState(pending?.payload.note || "");
  const [confirmOpen, setConfirmOpen] = useState(Boolean(pending));
  const [transferView, setTransferView] = useState(() => Boolean(pending));
  const [topupView, setTopupView] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const mounted = useRef(false);
  const busyRef = useRef(false);
  const revision = useRef(0);
  const amountInput = useRef(null);

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (busyRef.current) return;
    const version = ++revision.current;
    if (!quiet) setLoading(true);
    try {
      const result = await api.get("/rolls");
      if (mounted.current && version === revision.current) {
        setWallet(result);
        setLoadError("");
      }
    } catch (error) {
      if (mounted.current && version === revision.current) setLoadError(error.message);
    } finally {
      if (mounted.current && version === revision.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const onVisible = () => { if (document.visibilityState === "visible") refresh({ quiet: true }); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const interval = window.setInterval(onVisible, 30_000);
    return () => {
      mounted.current = false;
      revision.current += 1;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearInterval(interval);
    };
  }, [refresh]);

  useEffect(() => {
    let current = true;
    setPeople([]);
    setSearchError("");
    if (recipient || query.trim().replace(/^@/, "").length < 2) {
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const result = await api.get(`/rolls/recipients?q=${encodeURIComponent(query.trim())}`);
        if (current) setPeople(result.people);
      } catch (error) {
        if (current) setSearchError(error.message);
      } finally { if (current) setSearching(false); }
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [query, recipient]);

  const numericAmount = /^\d+$/.test(amount) ? Number(amount) : NaN;
  const validAmount = Number.isSafeInteger(numericAmount) && numericAmount > 0 && numericAmount <= ROLLS_MAX_TRANSFER;
  const insufficient = validAmount && wallet && numericAmount > wallet.balance;
  const canReview = wallet && recipient && validAmount && !insufficient && !busy;

  const sendTransfer = async () => {
    if (busyRef.current || (!pending && !canReview)) return;
    const intent = pending || {
      recipient,
      payload: { recipientId: recipient.id, amount: numericAmount, note: note.trim(), idempotencyKey: crypto.randomUUID() },
    };
    // Persist the same request before sending, so a lost response or page reload
    // can be retried without creating a second transfer.
    try { sessionStorage.setItem(storageKey, JSON.stringify(intent)); } catch {
      setTransferError("Разрешите хранение данных для Rollapp, чтобы безопасно повторять переводы.");
      return;
    }
    setPending(intent);
    busyRef.current = true;
    revision.current += 1;
    setBusy(true);
    setTransferError("");
    try {
      const result = await api.post("/rolls/transfers", intent.payload);
      sessionStorage.removeItem(storageKey);
      if (!mounted.current) return;
      setPending(null);
      setWallet(result);
      setLoadError("");
      setConfirmOpen(false);
      setAmount("");
      setNote("");
      setRecipient(null);
      setQuery("");
      setTransferView(false);
      toast.success(`${formatRolls(intent.payload.amount)} переведено ${intent.recipient.name}`);
    } catch (error) {
      const definiteRejection = error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status);
      if (definiteRejection) sessionStorage.removeItem(storageKey);
      if (!mounted.current) return;
      if (definiteRejection) setPending(null);
      setTransferError(definiteRejection ? error.message : "Ответ о переводе пока не получен. Нажмите «Проверить перевод» — повторного списания не будет.");
    } finally {
      busyRef.current = false;
      if (mounted.current) { setBusy(false); setLoading(false); }
    }
  };

  const loadMore = async () => {
    if (loadingMore || wallet?.nextOffset == null) return;
    setLoadingMore(true);
    const version = revision.current;
    try {
      const result = await api.get(`/rolls?offset=${wallet.nextOffset}`);
      if (!mounted.current || version !== revision.current) return;
      setWallet((current) => {
        const seen = new Set(current.transactions.map((item) => item.id));
        return { ...result, transactions: [...current.transactions, ...result.transactions.filter((item) => !seen.has(item.id))] };
      });
    } catch (error) { if (mounted.current) setLoadError(error.message); }
    finally { if (mounted.current) setLoadingMore(false); }
  };

  return <div className="app-page rolls-page typeset typeset-rollapp">
    <div className="not-typeset rollapp-body flex flex-col gap-6">
      {loadError && <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>{loadError}</span><Button variant="outline" onClick={() => refresh()} disabled={loading}>Повторить</Button>
      </AlertDescription></Alert>}

      {topupView ? <RollsTopup user={user} onBack={() => setTopupView(false)} onPaid={() => refresh({ quiet: true })} /> : transferView ? <section className="rolls-transfer flex min-w-0 flex-col gap-6" aria-labelledby="rolls-transfer-title">
          <div className="flex items-center gap-3">
            <h1 id="rolls-transfer-title" className="font-heading text-3xl leading-9 font-semibold">Перевод роллов</h1>
          </div>
          <form className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); if (pending || canReview) { setTransferError(""); sendTransfer(); } }}>
              <Field>
                <FieldLabel htmlFor="rolls-recipient">Получатель</FieldLabel>
                {recipient ? <div className="flex min-w-0 items-center gap-3 rounded-xl border p-3">
                  <PersonAvatar person={recipient} />
                  <div className="flex min-w-0 flex-1 flex-col"><span className="truncate">{recipient.name}</span><span className="truncate text-xs text-muted-foreground">@{recipient.username}</span></div>
                  <Button type="button" variant="ghost" disabled={busy || Boolean(pending)} onClick={() => { setRecipient(null); setQuery(""); }}>Изменить</Button>
                </div> : <>
                  <InputGroup><InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon><InputGroupInput id="rolls-recipient" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя или @username" maxLength={80} autoComplete="off" disabled={busy} aria-describedby="rolls-search-hint" /></InputGroup>
                  <FieldDescription id="rolls-search-hint" className="text-xs leading-4">Введите хотя бы 2 символа и выберите участника.</FieldDescription>
                  <div aria-live="polite">
                    {searching && <span className="flex items-center gap-2 text-muted-foreground"><Spinner />Ищем участников</span>}
                    {searchError && <span role="alert" className="text-destructive">{searchError}</span>}
                    {!searching && !searchError && query.trim().replace(/^@/, "").length >= 2 && people.length === 0 && <p className="text-muted-foreground">Никого не нашли. Попробуйте другой запрос.</p>}
                  </div>
                  {people.length > 0 && <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-xl border p-1" aria-label="Найденные участники">
                    {people.map((person) => <li key={person.id}><Button type="button" variant="ghost" className="h-auto w-full justify-start gap-3 py-2 text-left" onClick={() => { setRecipient(person); amountInput.current?.focus(); }}>
                      <PersonAvatar person={person} /><span className="flex min-w-0 flex-col"><span className="truncate">{person.name}</span><span className="truncate text-xs text-muted-foreground">@{person.username}</span></span>
                    </Button></li>)}
                  </ul>}
                </>}
              </Field>
              <Field>
                <FieldLabel htmlFor="rolls-amount">Сколько роллов</FieldLabel>
                <Input ref={amountInput} id="rolls-amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="numeric" pattern="[0-9]+" placeholder="Например, 10" maxLength={10} required disabled={busy || Boolean(pending)} aria-invalid={Boolean(amount && (!validAmount || insufficient))} aria-describedby="rolls-amount-hint" />
                <FieldDescription id="rolls-amount-hint" className="text-xs leading-4">{insufficient ? "На балансе недостаточно роллов." : amount && !validAmount ? `Введите целое число от 1 до ${ROLLS_MAX_TRANSFER.toLocaleString("ru-RU")}.` : "Только целые роллы. Комиссия — 0."}</FieldDescription>
              </Field>
              <Field><FieldLabel htmlFor="rolls-note">Комментарий <span className="font-normal text-muted-foreground">· необязательно</span></FieldLabel>
                <Textarea id="rolls-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={280} rows={2} placeholder="Спасибо за помощь!" disabled={busy || Boolean(pending)} />
              </Field>
              {pending && <Alert><AlertDescription>У вас есть перевод, результат которого нужно проверить.</AlertDescription></Alert>}
              <Button type="submit" className="w-full" disabled={busy || (!pending && !canReview)}>{pending ? "Проверить перевод" : "Продолжить"}</Button>
          </form>
        </section> : <>
          <section className="rolls-balance flex min-w-0 flex-col items-center gap-3 text-center" aria-label="Баланс роллов">
            <div className="flex size-28 shrink-0 items-center justify-center rounded-full border border-border bg-card/60">
              <Coins className="size-14 text-amber-300" aria-hidden="true" />
            </div>
            <div className="rolls-balance__value" aria-live="polite" aria-atomic="true" data-rolls-balance>
              {wallet ? new Intl.NumberFormat("ru-RU").format(wallet.balance) : loading ? <span className="flex items-center gap-2 text-base"><Spinner /> Загружаем баланс</span> : "Баланс недоступен"}
            </div>
            <div className="mt-5 mb-5 flex w-full items-center justify-center gap-3" aria-label="Действия с роллами">
              <Button type="button" size="icon" className="size-12 justify-self-center rounded-full" aria-label="Пополнить баланс" title="Пополнить баланс" onClick={() => setTopupView(true)} disabled={!wallet || busy}><Plus aria-hidden="true" /></Button>
              <Button type="button" variant="outline" size="icon" className="size-12 justify-self-center rounded-full" aria-label="Отправить роллы" title="Отправить роллы" onClick={() => { setTransferError(""); setTransferView(true); }} disabled={!wallet || busy}><ArrowRight aria-hidden="true" /></Button>
            </div>
          </section>

          <section className="flex min-w-0 flex-col gap-4" aria-labelledby="rolls-history-title">
            <div><h2 id="rolls-history-title" className="font-heading text-3xl leading-9 font-semibold">История операций</h2></div>
            {!wallet ? <p className="text-muted-foreground" role="status">{loading ? "Загружаем операции…" : "Не удалось загрузить историю."}</p> : wallet.transactions.length === 0 ? <p className="text-muted-foreground">Здесь появятся ваши начисления и переводы.</p> : <ul className="flex flex-col">
              {wallet.transactions.map((item) => {
                const incoming = item.direction === "incoming";
                const reward = item.kind === "wish_reward";
                const grant = item.kind === "manual_grant";
                const topup = item.kind === "stars_topup";
                const Icon = item.kind === "welcome" ? Gift : reward || grant ? Sparkles : incoming ? ArrowDownLeft : ArrowUpRight;
                const title = item.kind === "welcome"
                  ? "Добро пожаловать в Rollapp"
                  : reward ? `За желание «${item.wishTitle}»` : grant ? "Начисление роллов" : topup ? "Пополнение через Telegram Stars" : `${incoming ? "От " : ""}${item.person.name}`;
                return <li key={item.id} className="flex min-w-0 items-start gap-3 py-4" data-rolls-transaction={item.kind}>
                  <span className={`flex size-12 shrink-0 items-center justify-center rounded-full ${incoming ? "bg-amber-400/10 text-amber-300" : "bg-muted text-muted-foreground"}`}><Icon className="size-5" aria-hidden="true" /></span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4"><span className="min-w-0 break-words text-base">{title}</span><span className={`shrink-0 text-right text-base tabular-nums ${incoming ? "text-amber-300" : "text-foreground"}`}>{incoming ? "+" : "−"}{formatRolls(item.amount)}</span>{item.note || item.kind === "welcome" ? <span className="min-w-0 whitespace-pre-wrap break-words text-base text-muted-foreground">{item.kind === "welcome" ? "Начисление" : item.note === "Начисление по запросу пользователя" ? "Начисление по запросу" : item.note}</span> : item.person ? <span className="min-w-0 break-all text-base text-muted-foreground">@{item.person.username}</span> : <span /> }<time className="whitespace-nowrap text-right text-base text-muted-foreground" dateTime={item.createdAt}>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(item.createdAt))}</time></div>
                  </div>
                </li>;
              })}
            </ul>}
            {wallet?.nextOffset != null && <Button variant="outline" onClick={loadMore} disabled={loadingMore || busy}>{loadingMore && <Spinner />}Показать ещё</Button>}
          </section>
        </>}
    </div>

    <AlertDialog open={confirmOpen} onOpenChange={(open) => { if (!busy) setConfirmOpen(open); }}>
      <AlertDialogContent className="rollapp-body">
        <AlertDialogHeader><AlertDialogTitle>{pending ? "Проверить перевод" : `Перевести ${formatRolls(numericAmount || 0)}?`}</AlertDialogTitle><AlertDialogDescription>{recipient ? `${recipient.name} · @${recipient.username}` : ""}. Комиссия — 0 роллов.</AlertDialogDescription></AlertDialogHeader>
        {note.trim() && <p className="whitespace-pre-wrap break-words">{note.trim()}</p>}
        {pending && <p>Сумма: {formatRolls(pending.payload.amount)}. Повторная проверка не спишет роллы ещё раз.</p>}
        {transferError && <Alert variant="destructive"><AlertDescription>{transferError}</AlertDescription></Alert>}
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>{pending ? "Позже" : "Назад"}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={sendTransfer}>{busy ? <Spinner /> : <Check aria-hidden="true" />}{busy ? "Проверяем…" : pending ? "Проверить перевод" : "Перевести"}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
