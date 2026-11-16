import { lazy, Suspense, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Coins, Plus, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/modules/runtime/api.js";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { FinanceFundraiserCards } from "@/components/fundraiser-virtual-card";
import { DrawerFooter } from "@/components/form-surface";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { MakiIcon } from "@/components/maki-icon";
import { PageActionButton } from "@/components/page-action-button";
import { PurchaseHistoryImport } from "@/modules/history/purchase-history-import.jsx";
import { readTonIntent, readTrackedTonOrder } from "./ton-topup-intent.js";
import { RollsTopup, restoreStarTopup } from "@/modules/payments/rolls-topup.jsx";
import { clearRollTransfer, restoreRollTransfer, rollTransferMatches, rollTransferWasRejected } from "./roll-transfer-intent.js";
import { PersonalOffers } from "@/components/personal-offers";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatRolls, ROLLS_MAX_TRANSFER } from "../../../shared/modules/payments/rolls.js";
import { APP_ORDERS_PATH } from "../shell/app-routing.js";
import { MarketplaceOrderAttention } from "../history/marketplace-order-attention.jsx";
import { RollsHistory } from "../history/rolls-history.jsx";
import { RollsActivity } from "../pfm/rolls-activity.jsx";

const TonOrderStatus = lazy(() => import("./ton-topup.jsx").then((module) => ({ default: module.TonTopup })));
const TonWallet = lazy(() => import("@/modules/payments/ton-wallet.jsx").then((module) => ({ default: module.TonWallet })));

function RollsBalanceBreakdown({ balances }) {
  const breakdown = [
    ["Подарочные карты", balances.giftCards],
    ["В резерве для наград", balances.reservedRewards],
    ["В резерве за покупки", balances.reservedOrders],
    ["Ожидается от продаж", balances.pendingSales],
  ].filter(([, value]) => value && value !== "0");
  if (!breakdown.length) return null;
  return <dl className="flex w-full min-w-0 flex-wrap justify-center gap-x-6 gap-y-2" aria-label="Роллы вне доступного баланса">
    {breakdown.map(([label, value]) => <div key={label} className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="wrap-anywhere font-medium tabular-nums">{formatRolls(BigInt(value))}</dd>
    </div>)}
  </dl>;
}

function RollsHeroIcon() {
  return <div className="rolls-hero-icon flex shrink-0 items-center justify-center rounded-full border border-border bg-card/60">
    <Coins className="size-3/5 text-amber-300" aria-hidden="true" />
  </div>;
}

function PersonAvatar({ person }) {
  return <Avatar className="size-12 shrink-0">
    {person.avatarUrl && <AvatarImage src={person.avatarUrl} alt="" />}
    <AvatarFallback>{person.name.trim().slice(0, 1).toUpperCase()}</AvatarFallback>
  </Avatar>;
}

export function RollsWallet({ user, embedded = false, onWishlistsImported }) {
  const transferFormId = useId();
  const storageKey = `rollapp:pending-roll-transfer:${user.id}`;
  const [pending, setPending] = useState(() => restoreRollTransfer(storageKey));
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
  const [activityOpen, setActivityOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const importOpener = useRef(null);
  const [requestMode, setRequestMode] = useState(null);
  const busy = requestMode !== null;
  const [transferError, setTransferError] = useState("");
  const [verification, setVerification] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const mounted = useRef(false);
  const busyRef = useRef(false);
  const revision = useRef(0);
  const amountInput = useRef(null);
  const walletScrollArea = useRef(null);
  const transferOpener = useRef(null);
  const pendingTransferOpener = useRef(null);
  const restoreTransferFocus = useRef(false);
  const topupOpener = useRef(null);
  const pendingTopupOpener = useRef(null);
  const restoreTopupFocus = useRef(false);
  const pendingTopup = restoreStarTopup(user.id);
  const hasTonStatus = useRef(false);
  if (!hasTonStatus.current) hasTonStatus.current = Boolean(readTonIntent(user.id) || readTrackedTonOrder(user.id));

  useLayoutEffect(() => {
    if (topupView || !restoreTopupFocus.current) return;
    restoreTopupFocus.current = false;
    (pendingTopupOpener.current ?? topupOpener.current ?? transferOpener.current)?.focus({ preventScroll: true });
  }, [topupView]);

  useLayoutEffect(() => {
    if (transferView || !restoreTransferFocus.current) return;
    restoreTransferFocus.current = false;
    (pendingTransferOpener.current ?? transferOpener.current)?.focus({ preventScroll: true });
  }, [transferView]);

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

  function restoreOutstandingTransfer() {
    const saved = !pending && restoreRollTransfer(storageKey);
    if (!saved) return false;
    setPending(saved);
    setRecipient(saved.recipient);
    setAmount(String(saved.payload.amount));
    setNote(saved.payload.note);
    return true;
  }

  function openTransferReview() {
    restoreOutstandingTransfer();
    setTransferError("");
    setVerification(null);
    setConfirmOpen(true);
  }

  function returnToWallet() {
    // Keep focus inside the drawer while React removes its footer.
    walletScrollArea.current?.focus({ preventScroll: true });
    restoreTransferFocus.current = true;
    setConfirmOpen(false);
    setTransferView(false);
  }

  function resetTransferForm() {
    setPending(null);
    setAmount("");
    setNote("");
    setRecipient(null);
    setQuery("");
    returnToWallet();
  }

  function completeTransfer(intent, updatedWallet) {
    clearRollTransfer(storageKey, intent.payload.idempotencyKey);
    if (!mounted.current) return;
    if (updatedWallet) setWallet(updatedWallet);
    setLoadError("");
    resetTransferForm();
    toast.success(`${formatRolls(intent.payload.amount)} переведено · ${intent.recipient.name}`);
  }

  function closeConflictingTransfer() {
    if (!pending || verification !== "conflict" || busyRef.current) return;
    clearRollTransfer(storageKey, pending.payload.idempotencyKey);
    resetTransferForm();
    void refresh({ quiet: true });
  }

  function startTransferRequest(mode) {
    busyRef.current = true;
    revision.current += 1;
    setRequestMode(mode);
    setTransferError("");
  }

  function finishTransferRequest() {
    busyRef.current = false;
    if (mounted.current) { setRequestMode(null); setLoading(false); }
  }

  async function sendTransfer() {
    if (busyRef.current || (!pending && !canReview) || restoreOutstandingTransfer()) return;
    const intent = pending || {
      recipient,
      payload: { recipientId: recipient.id, amount: numericAmount, note: note.trim(), idempotencyKey: crypto.randomUUID() },
    };
    if (!pending) {
      try { sessionStorage.setItem(storageKey, JSON.stringify(intent)); } catch {
        setTransferError("Разрешите хранение данных для Rollapp, чтобы безопасно повторять переводы.");
        return;
      }
      setPending(intent);
    }
    startTransferRequest("send");
    setVerification(null);
    try {
      const result = await api.post("/rolls/transfers", intent.payload);
      if (!result.transfer?.id || !Number.isSafeInteger(result.balance) || !Array.isArray(result.transactions)) {
        throw new Error("Неполный ответ о переводе");
      }
      completeTransfer(intent, result);
    } catch (error) {
      const rejected = rollTransferWasRejected(error);
      if (rejected) clearRollTransfer(storageKey, intent.payload.idempotencyKey);
      if (!mounted.current) return;
      if (rejected) setPending(null);
      if (error.code === "IDEMPOTENCY_CONFLICT") setVerification("conflict");
      setTransferError(rejected || error.code === "IDEMPOTENCY_CONFLICT" ? error.message
        : "Ответ о переводе пока не получен. Можно проверить, появился ли он в журнале.");
    } finally { finishTransferRequest(); }
  }

  async function checkTransfer() {
    if (!pending || busyRef.current) return;
    const intent = pending;
    startTransferRequest("check");
    setVerification(null);
    let posted = false;
    try {
      const result = await api.get(`/rolls/transfers/${encodeURIComponent(intent.payload.idempotencyKey)}`);
      if (!mounted.current) return;
      if (result.transfer === null) setVerification("missing");
      else if (!result.transfer?.id || typeof result.transfer.recipientId !== "string" ||
          !Number.isSafeInteger(result.transfer.amount) || typeof result.transfer.note !== "string") {
        throw new Error("Не удалось проверить перевод.");
      }
      else if (rollTransferMatches(result.transfer, intent.payload)) {
        posted = true;
        completeTransfer(intent);
      } else setVerification("conflict");
    } catch (error) {
      if (mounted.current) setTransferError(error.message || "Не удалось проверить перевод.");
    } finally {
      finishTransferRequest();
      if (posted && mounted.current) void refresh({ quiet: true });
    }
  }

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

  const transferLabel = pending ? "Проверить перевод" : "Продолжить";
  const transferSubmit = <Button type="submit" form={transferFormId} className={embedded ? undefined : "w-full"} disabled={busy || (!pending && !canReview)} aria-label={transferLabel}>
    {embedded && pending ? <><span className="md:hidden">Проверить</span><span className="hidden md:inline">{transferLabel}</span></> : transferLabel}
  </Button>;
  const content = <div className={cn("rolls-page rollapp-body", embedded ? "rolls-page--embedded min-w-0 px-4 pt-4 pb-1" : "app-page")}>
    <div className="rollapp-body flex flex-col gap-6">
      {loadError && <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>{loadError}</span><Button variant="outline" onClick={() => refresh()} disabled={loading}>Повторить</Button>
      </AlertDescription></Alert>}

      {topupView ? <RollsTopup key={user.id} user={user} onBack={() => {
        restoreTopupFocus.current = true;
        setTopupView(false);
      }} onPaid={() => refresh({ quiet: true })} /> : transferView ? <section className="rolls-transfer flex min-w-0 flex-col gap-6" aria-labelledby="rolls-transfer-title">
          <header className="flex min-w-0 flex-col items-center gap-3 text-center">
            <RollsHeroIcon />
            <h1 id="rolls-transfer-title" className="rolls-balance__value">Перевод</h1>
          </header>
          <form id={transferFormId} className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); if (pending || canReview) openTransferReview(); }}>
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
              {!embedded && <div className="flex flex-col gap-2">
                {transferSubmit}
                <PageActionButton variant="ghost" type="button" onClick={returnToWallet} disabled={busy}>К кошельку</PageActionButton>
              </div>}
          </form>
        </section> : <>
          {pending && <Alert><AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>Ожидает проверки перевод · {formatRolls(pending.payload.amount)}</span>
            <PageActionButton ref={pendingTransferOpener} variant="outline" onClick={() => { setTransferView(true); openTransferReview(); }}>Проверить перевод</PageActionButton>
          </AlertDescription></Alert>}
          {pendingTopup && <Alert><AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>Ожидает проверки пополнение через Telegram Stars</span>
            <PageActionButton ref={pendingTopupOpener} variant="outline" onClick={() => setTopupView(true)}>Открыть счёт Stars</PageActionButton>
          </AlertDescription></Alert>}
          <section className="rolls-balance flex min-w-0 flex-col items-center gap-3 text-center" aria-label="Баланс роллов">
            {wallet ? <div className="flex w-full min-w-0 flex-col gap-1">
              <div className="rolls-balance__value max-w-full wrap-anywhere !whitespace-normal" aria-live="polite" aria-atomic="true" data-rolls-balance>
                {new Intl.NumberFormat("ru-RU").format(wallet.balance)}
              </div>
              <span className="text-caption text-muted-foreground">Доступно</span>
            </div> : <div className="flex min-h-15 items-center justify-center gap-2 text-base text-muted-foreground" role="status" aria-live="polite" aria-atomic="true" data-rolls-balance>
              {loading && <Spinner />}
              <span>{loading ? "Загружаем баланс…" : "Баланс недоступен"}</span>
            </div>}
            {wallet?.balances && <RollsBalanceBreakdown balances={wallet.balances} />}
            {[wallet?.balances?.reservedOrders, wallet?.balances?.pendingSales].some((amount) => amount && amount !== "0") &&
              <PageActionButton variant="outline" nativeButton={false} role="link"
                render={<Link to={APP_ORDERS_PATH} state={{ ordersFromStore: true }} />}>Заказы и продажи</PageActionButton>}
            <div className="mt-5 mb-5 flex w-full items-center justify-center gap-3" aria-label="Действия с роллами">
              {wallet?.features?.starsPurchases && !pendingTopup && <Button ref={topupOpener} type="button" size="icon" className="size-12 justify-self-center rounded-full" aria-label="Пополнить баланс" title="Пополнить баланс" onClick={() => setTopupView(true)} disabled={!wallet || busy}><Plus aria-hidden="true" /></Button>}
              <Button ref={transferOpener} type="button" size="icon" className="size-12 justify-self-center rounded-full" aria-label="Отправить роллы" title="Отправить роллы" onClick={() => {
                walletScrollArea.current?.focus({ preventScroll: true });
                setTransferError("");
                setTransferView(true);
              }} disabled={!wallet || busy || Boolean(pending)}><ArrowRight aria-hidden="true" /></Button>
            </div>
          </section>
          <MarketplaceOrderAttention attention={wallet?.orderAttention} />

          {embedded && <div className="flex justify-center">
            <PageActionButton ref={importOpener} type="button" variant="outline" onClick={() => setImportOpen(true)}>
              Импорт покупок
            </PageActionButton>
          </div>}

          {wallet?.features?.rollActivity && <div className="flex justify-center">
            <PageActionButton variant="outline" aria-expanded={activityOpen} onClick={() => setActivityOpen((open) => !open)}>
              {activityOpen ? "Скрыть сводку" : "Сводка по роллам"}
            </PageActionButton>
          </div>}
          {wallet?.features?.rollActivity && activityOpen && <RollsActivity key={`activity:${user.id}`} />}

          <FinanceFundraiserCards key={user.id} ownerId={user.id} />
          <PersonalOffers user={user} onPaid={() => refresh({ quiet: true })} />

          {wallet?.features?.tonWallet && <Suspense fallback={<p role="status" className="flex items-center gap-2"><Spinner />Загружаем TON Connect</p>}>
            <TonWallet key={user.id} userId={user.id} onPaid={refresh} />
          </Suspense>}
          {wallet && !wallet.features?.tonWallet && hasTonStatus.current && <Suspense fallback={null}>
            <TonOrderStatus key={user.id} userId={user.id} onPaid={refresh} />
          </Suspense>}

          {!(wallet?.features?.rollActivity && activityOpen) && <RollsHistory
            transactions={wallet?.transactions ?? null}
            hasMore={wallet?.nextOffset != null}
            loading={loading}
            loadingMore={loadingMore}
            busy={busy}
            onLoadMore={loadMore}
          />}
        </>}
    </div>

    {importOpen && <PurchaseHistoryImport
      returnFocusRef={importOpener}
      onClose={() => setImportOpen(false)}
      onSaved={({ created, skipped }) => {
        setImportOpen(false);
        if (created) {
          onWishlistsImported?.();
          toast.success(`Создано карточек: ${created}${skipped ? ` · Повторов: ${skipped}` : ""}`);
        } else {
          toast("Такие карточки уже есть в этом списке");
        }
      }}
    />}

    <AlertDialog open={confirmOpen} onOpenChange={(open) => { if (!busyRef.current) setConfirmOpen(open); }}>
      <AlertDialogContent className="rollapp-body flex w-[calc(100%-2rem)] flex-col overflow-hidden" data-roll-transfer-review="">
        <AlertDialogHeader className="shrink-0">
          <AlertDialogTitle>{pending ? "Проверить перевод" : `Перевести ${formatRolls(numericAmount || 0)}?`}</AlertDialogTitle>
          <AlertDialogDescription className="wrap-anywhere">
            {recipient && `${recipient.name}${recipient.username ? ` · @${recipient.username}` : ""}.`} Комиссия — 0 роллов.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {(note.trim() || pending || transferError || insufficient) && <div className="grid min-h-0 min-w-0 gap-2 overflow-y-auto overscroll-contain px-px">
          {pending && <p>Сумма · {formatRolls(pending.payload.amount)}</p>}
          {verification === "missing" && <div className="grid gap-1" role="status">
            <p>В журнале пока нет перевода.</p>
            <p className="text-xs text-muted-foreground">Повторная отправка сохранит реквизиты. Роллы спишутся только один раз.</p>
          </div>}
          {verification === "conflict" && <Alert variant="destructive"><AlertDescription>По этому номеру уже проведён перевод с другими реквизитами. Сверьте его в истории.</AlertDescription></Alert>}
          {!pending && insufficient && <Alert variant="destructive"><AlertDescription>На балансе недостаточно роллов.</AlertDescription></Alert>}
          {transferError && <Alert variant="destructive"><AlertDescription>{transferError}</AlertDescription></Alert>}
          {note.trim() && <p className="wrap-anywhere whitespace-pre-wrap">{note.trim()}</p>}
        </div>}
        <AlertDialogFooter className="shrink-0 flex-row flex-wrap justify-end">
          <AlertDialogCancel className="rounded-full" disabled={busy}>{pending ? "Позже" : "Назад"}</AlertDialogCancel>
          {pending && verification === "missing" && <Button variant="outline" className="rounded-full" disabled={busy}
            aria-label="Повторить отправку" onClick={() => void sendTransfer()}>
            <span className="sm:hidden">Отправить снова</span><span className="hidden sm:inline">Повторить отправку</span>
          </Button>}
          {pending && verification === "conflict" && <Button variant="outline" className="rounded-full"
            disabled={busy} onClick={closeConflictingTransfer}>Закрыть запрос</Button>}
          <AlertDialogAction className="rounded-full" disabled={busy || (!pending && !canReview)} onClick={(event) => {
            event.preventDefault();
            void (pending ? checkTransfer() : sendTransfer());
          }}>
            {busy ? <Spinner /> : !pending && <Check aria-hidden="true" />}
            {busy ? (requestMode === "send" ? "Отправляем…" : "Проверяем…") : pending ? "Проверить перевод" : "Перевести"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;

  if (!embedded) return content;
  return <>
    <ScrollArea ref={walletScrollArea} tabIndex={-1} className="min-h-0 min-w-0 w-full flex-1">{content}</ScrollArea>
    <DrawerFooter className="empty:hidden">
      {transferView && <>
        {transferSubmit}
        <Button data-control-icon type="button" size="icon" variant="outline" aria-label="К кошельку" title="К кошельку" disabled={busy} onClick={returnToWallet}><Coins aria-hidden="true" /></Button>
      </>}
    </DrawerFooter>
  </>;
}
