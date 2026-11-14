import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Gift, X } from "lucide-react";
import { api } from "@/api";
import { ControlBar } from "@/components/control-bar";
import { PageActionButton } from "@/components/page-action-button";
import { Card } from "@/components/ui/card";
import { Drawer, DrawerBack, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerSectionHeader, DrawerTitle } from "@/components/form-surface";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { publicProfilePath } from "../../shared/profile-links.js";
import { formatRolls, ROLLS_MAX_TRANSFER } from "../../shared/rolls.js";

function readPending(key) {
  try {
    const value = JSON.parse(sessionStorage.getItem(key));
    return value && /^\/rolls\/gift-cards(?:\/[a-zA-Z0-9-]+\/(?:topup|send))?$/.test(value.path)
      && typeof value.payload?.idempotencyKey === "string" ? value : null;
  } catch { return null; }
}

export function GiftCardManager({ business, user, initialCardId = "", returnFocusRef, onClose, onChanged }) {
  const storageKey = `rollapp:gift-intent:${user.id}:${business.id}`;
  const [pending, setPending] = useState(() => readPending(storageKey));
  const [cards, setCards] = useState([]);
  const [selectedId, setSelectedId] = useState(initialCardId || null);
  const [wallet, setWallet] = useState(null);
  const [amount, setAmount] = useState("");
  const [search, setSearch] = useState("");
  const [people, setPeople] = useState([]);
  const [recipient, setRecipient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cardsError, setCardsError] = useState("");
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletError, setWalletError] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const cardReads = useRef(0);
  const walletReads = useRef(0);
  const alive = useRef(false);
  const selected = cards.find((card) => card.id === selectedId);
  const locked = busy || Boolean(pending);

  async function loadCards() {
    const read = ++cardReads.current;
    setLoading(true);
    setCardsError("");
    try {
      const result = await api.get("/rolls/gift-cards");
      if (read !== cardReads.current) return;
      const available = result.cards.filter((card) => card.business.id === business.id);
      setCards(available);
      setSelectedId((current) => current ?? available[0]?.id ?? "");
    } catch (cause) {
      if (read === cardReads.current) setCardsError(cause.message || "Не удалось загрузить карту");
    } finally {
      if (read === cardReads.current) setLoading(false);
    }
  }

  async function loadWallet() {
    const read = ++walletReads.current;
    setWalletLoading(true);
    setWalletError("");
    try {
      const balance = await api.get("/rolls");
      if (read === walletReads.current) setWallet(balance);
    } catch (cause) {
      if (read === walletReads.current) {
        setWallet(null);
        setWalletError(cause.message || "Не удалось загрузить кошелёк");
      }
    } finally {
      if (read === walletReads.current) setWalletLoading(false);
    }
  }

  useEffect(() => {
    alive.current = true;
    loadCards();
    loadWallet();
    return () => {
      alive.current = false;
      cardReads.current += 1;
      walletReads.current += 1;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setPeople([]);
    setSearchError("");
    const query = search.trim().replace(/^@/, "");
    if (recipient || query.length < 2) { setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      api.get(`/rolls/recipients?q=${encodeURIComponent(query)}`).then((result) => {
        if (active) setPeople(result.people);
      }).catch((cause) => { if (active) setSearchError(cause.message); }).finally(() => { if (active) setSearching(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [search, recipient]);

  async function run(path, payload, label) {
    if (busyRef.current) return;
    const intent = pending || { path, payload: { ...payload, idempotencyKey: crypto.randomUUID() }, label };
    try { sessionStorage.setItem(storageKey, JSON.stringify(intent)); } catch {
      setError("Разрешите хранение данных, чтобы безопасно повторять операции с картой."); return;
    }
    setPending(intent);
    setError("");
    setMessage("");
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await api.post(intent.path, intent.payload);
      sessionStorage.removeItem(storageKey);
      if (!alive.current) return;
      setPending(null);
      setSelectedId(intent.path.endsWith("/send") ? "" : result.card.id);
      setAmount(""); setRecipient(null); setSearch("");
      setMessage(intent.label);
      loadCards();
      loadWallet();
      onChanged?.();
    } catch (cause) {
      if (!alive.current) return;
      const rejected = cause.status >= 400 && cause.status < 500 && ![408, 429].includes(cause.status);
      if (rejected) { sessionStorage.removeItem(storageKey); setPending(null); }
      setError(rejected ? cause.message : "Ответ пока не получен. Проверьте результат тем же запросом: повторного списания или отправки не будет.");
    } finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  const value = /^\d+$/.test(amount) ? Number(amount) : NaN;
  const validInteger = Number.isSafeInteger(value) && value > 0 && value <= ROLLS_MAX_TRANSFER;
  const insufficient = validInteger && wallet && value > wallet.balance;
  const exceedsLimit = validInteger && selected && value + selected.balance > ROLLS_MAX_TRANSFER;
  const cardsReady = !loading && !cardsError;
  const walletReady = Boolean(wallet && !walletLoading && !walletError);
  const valid = validInteger && walletReady && cardsReady && selected && !insufficient && !exceedsLimit;
  const amountHint = amount && !validInteger ? "Введите положительное целое количество роллов."
    : insufficient ? "На вашем балансе недостаточно роллов."
      : exceedsLimit ? "На карте можно хранить не больше 1 000 000 000 роллов."
        : "Роллы спишутся с вашего баланса.";
  const description = `${business.name} · Роллы с карты можно потратить только у этого бизнеса.`;
  return <Drawer open onAfterClose={returnFocusRef ? () => {
    const opener = returnFocusRef.current;
    if (opener?.isConnected && !opener.closest("[hidden]")) opener.focus({ preventScroll: true });
  } : undefined} onOpenChange={(open, event) => {
    if (!open && busyRef.current) event?.cancel?.();
    else if (!open) onClose();
  }}>
    <DrawerContent className="rollapp-body app-drawer--form" finalFocus={returnFocusRef}>
      {returnFocusRef ? <DrawerSectionHeader title="Подарочная карта" description={description} startAction={<DrawerBack disabled={busy} />} /> : <>
        <DrawerClose render={<Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 size-12" disabled={busy} />} aria-label="Закрыть подарочную карту"><X aria-hidden="true" /></DrawerClose>
        <DrawerHeader className="pr-16"><DrawerTitle>Подарочная карта</DrawerTitle><DrawerDescription className="text-xs break-words">{description}</DrawerDescription></DrawerHeader>
      </>}
      <div className="app-drawer-body flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-4 break-words">
        {loading && <p role="status" className="flex items-center gap-2"><Spinner />Загружаем карты…</p>}
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {cardsError && <Alert variant="destructive"><AlertDescription>{cardsError}</AlertDescription></Alert>}
        {message && <p role="status">{message}</p>}
        {cardsReady && selectedId && !selected && <p role="status">Выбранная карта больше недоступна. Можно выбрать другую карту или выпустить новую.</p>}
        {pending && <Alert><AlertDescription>Сохранён запрос: {pending.label} Проверьте его результат перед следующим действием.</AlertDescription></Alert>}
        {cards.length > 0 && <div className="flex flex-col gap-2" role="group" aria-label="Мои карты этого бизнеса">
          {cards.map((card) => <Button type="button" key={card.id} variant={card.id === selectedId ? "secondary" : "outline"} aria-pressed={card.id === selectedId} disabled={locked || !cardsReady} className="h-auto min-h-12 justify-between gap-3 whitespace-normal text-left" onClick={() => {
            if (card.id === selectedId) return;
            setSelectedId(card.id);
            setAmount(""); setRecipient(null); setSearch("");
            setError(""); setMessage("");
          }}><Gift className="size-5 shrink-0" /><span className="min-w-0 break-words">{business.name} · {formatRolls(card.balance)}</span></Button>)}
        </div>}
        {cardsReady && !cards.length && !selectedId && !message && <p>Выпустите карту, пополните её со своего баланса и отправьте человеку в Rollapp.</p>}
        {selected && <>
          <section className="flex flex-col gap-3" aria-label="Пополнение карты">
            <p>На карте: <strong>{formatRolls(selected.balance)}</strong></p>
            {walletError ? <>
              <Alert variant="destructive"><AlertDescription>{walletError}</AlertDescription></Alert>
              <Button type="button" variant="outline" disabled={busy} onClick={loadWallet}>Повторить загрузку кошелька</Button>
            </> : <p>Ваш баланс: {walletReady ? formatRolls(wallet.balance) : "загружается…"}</p>}
            {selected.balance === 0 && <p className="text-muted-foreground">Пополните карту, чтобы подарить её.</p>}
            <form id="gift-topup" className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); if (valid && !locked) run(`/rolls/gift-cards/${selected.id}/topup`, { amount: value }, `Карта пополнена на ${formatRolls(value)}`); }}>
              <Field><FieldLabel htmlFor="gift-amount">Сколько роллов добавить</FieldLabel><Input id="gift-amount" inputMode="numeric" pattern="[0-9]+" maxLength={10} required value={amount} disabled={locked || !cardsReady || !walletReady} onChange={(event) => setAmount(event.target.value)} aria-invalid={Boolean(amount && !valid)} aria-describedby="gift-amount-hint" /><FieldDescription className="text-xs leading-4" id="gift-amount-hint" aria-live="polite">{amountHint}</FieldDescription></Field>
              <Button type="submit" variant="outline" className="h-auto min-h-12 whitespace-normal" disabled={!valid || locked}>Пополнить{valid ? ` на ${formatRolls(value)}` : ""}</Button>
            </form>
          </section>
          <section className="flex flex-col gap-3" aria-label="Получатель подарочной карты">
            <Field>
              <FieldLabel htmlFor="gift-recipient">Кому подарить</FieldLabel>
              <Input id="gift-recipient" placeholder="Имя или @username" autoComplete="off" maxLength={80} value={search} disabled={locked} aria-describedby="gift-recipient-hint" onChange={(event) => { setSearch(event.target.value); setRecipient(null); }} />
              <FieldDescription className="text-xs leading-4" id="gift-recipient-hint">
                Введите имя или @username в Rollapp. Для поиска нужно хотя бы два символа, не считая @. После отправки карта появится в разделе «Подарочные карты» профиля получателя и исчезнет из вашего списка.
              </FieldDescription>
            </Field>
            {searching && <p role="status">Ищем получателя…</p>}
            {searchError && <p role="alert">{searchError}</p>}
            {!searching && !searchError && !recipient && search.trim().replace(/^@/, "").length >= 2 && !people.length && <p>Никого не нашли. Проверьте имя или username.</p>}
            {people.map((person) => <Button type="button" key={person.id} variant="outline" className="h-auto min-h-12 justify-start whitespace-normal text-left" disabled={locked} onClick={() => { setRecipient(person); setSearch(`@${person.username}`); }}><span className="min-w-0 break-words">{person.name} · @{person.username}</span></Button>)}
            {recipient && <p>Получатель: <strong>{recipient.name}</strong> · @{recipient.username}<br />Подарок: {formatRolls(selected.balance)} у {business.name}.</p>}
          </section>
        </>}
        {selected && !pending && <Button variant="outline" disabled={busy || !cardsReady} onClick={() => run("/rolls/gift-cards", { businessId: business.id }, "Новая карта выпущена")}>Выпустить ещё карту</Button>}
        {cardsError && !pending && <Button variant="outline" disabled={busy} onClick={loadCards}>Повторить загрузку</Button>}
      </div>
      <DrawerFooter>
        {pending ? <Button disabled={busy} onClick={() => run()}>{busy && <Spinner />}Проверить результат</Button>
          : selected ? <Button disabled={busy || !cardsReady || !recipient || selected.balance <= 0} onClick={() => run(`/rolls/gift-cards/${selected.id}/send`, { recipientId: recipient.id }, `Карта отправлена: ${recipient.name}`)}>{busy && <Spinner />}Подарить карту</Button>
            : (!selectedId || cardsReady) && <Button disabled={busy || !cardsReady} onClick={() => run("/rolls/gift-cards", { businessId: business.id }, "Карта выпущена. Теперь её можно пополнить.")}>{busy && <Spinner />}Выпустить карту</Button>}
      </DrawerFooter>
    </DrawerContent>
  </Drawer>;
}

export function BusinessGiftAction({ business, user, labelled = false }) {
  const [open, setOpen] = useState(false);
  const loginPath = `/login?next=${encodeURIComponent(publicProfilePath(business.username))}`;
  return <>
    {labelled ? (user
      ? <PageActionButton type="button" onClick={() => setOpen(true)}>Выпустить и подарить</PageActionButton>
      : <PageActionButton to={loginPath}>Войти и подарить</PageActionButton>
    ) : <ControlBar className="justify-center" aria-label="Подарочная карта бизнеса">
      {user ? <Button type="button" variant="outline" size="icon" data-control-icon aria-label={`Выпустить подарочную карту ${business.name}`} title="Подарочная карта" onClick={() => setOpen(true)}><Gift /></Button>
        : <Link className={buttonVariants({ variant: "outline", size: "icon" })} data-slot="button" data-control-icon to={loginPath} aria-label="Войти и выпустить подарочную карту"><Gift /></Link>}
    </ControlBar>}
    {open && user && <GiftCardManager key={`${user.id}:${business.id}`} business={business} user={user} onClose={() => setOpen(false)} />}
  </>;
}

export function BusinessGiftCertificates({ business, user }) {
  return <section className="typeset typeset-rollapp flex min-w-0 flex-col gap-4" aria-labelledby="business-certificates-title">
    <h2 id="business-certificates-title">Сертификаты</h2>
    <Card className="min-w-0 flex-row flex-wrap items-center justify-between gap-4 p-4 sm:p-5" data-not-typeset>
      <div className="rollapp-body flex min-w-0 flex-1 items-start gap-3 max-sm:basis-full">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-muted"><Gift className="size-5" aria-hidden="true" /></span>
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="font-semibold">Подарочная карта</h3>
          <p className="text-muted-foreground">Выберите номинал в роллах и отправьте карту пользователю Rollapp. Картой можно оплатить покупки у этого бренда.</p>
        </div>
      </div>
      <BusinessGiftAction business={business} user={user} labelled />
    </Card>
  </section>;
}

export function ProfileGiftCards({ user, onNavigate }) {
  const [cards, setCards] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const revision = useRef(0);
  const cardOpener = useRef(null);
  async function refresh() {
    const version = ++revision.current;
    try { const result = await api.get("/rolls/gift-cards"); if (version === revision.current) { setCards(result.cards); setError(""); } }
    catch (cause) { if (version === revision.current) setError(cause.message); }
    finally { if (version === revision.current) setLoading(false); }
  }
  useEffect(() => {
    refresh();
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", visible);
    const timer = setInterval(visible, 30000);
    return () => { revision.current += 1; window.removeEventListener("focus", visible); clearInterval(timer); };
  }, []);
  return <section className="flex min-w-0 flex-col gap-4 p-4" aria-label="Подарочные карты">
    {loading && <p role="status">Загружаем карты…</p>}
    {error && <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" onClick={refresh}>Повторить</Button></AlertDescription></Alert>}
    {!loading && !error && !cards.length && <p className="text-muted-foreground">Полученные и выпущенные карты появятся здесь.</p>}
    {cards.map((card) => <article key={card.id} className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4">
      <Link className="break-words font-semibold underline underline-offset-4" to={publicProfilePath(card.business.username)} onClick={(event) => {
        if (!onNavigate || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
        event.preventDefault();
        onNavigate(publicProfilePath(card.business.username));
      }}>{card.business.name}</Link>
      <p>{formatRolls(card.balance)} · Только у этого бизнеса</p>
      <Button variant="outline" onClick={(event) => { cardOpener.current = event.currentTarget; setSelectedCard(card); }}>Открыть карту</Button>
    </article>)}
    {selectedCard && <GiftCardManager key={`${user.id}:${selectedCard.id}`} business={selectedCard.business} initialCardId={selectedCard.id} user={user}
      returnFocusRef={cardOpener} onClose={() => { setSelectedCard(null); refresh(); }} onChanged={refresh} />}
  </section>;
}
