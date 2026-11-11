import { useEffect, useId, useRef, useState } from "react";
import { CreditCard } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatRolls } from "../../shared/rolls.js";
import { issueVirtualCard, listVirtualCards, purchaseWithVirtualCard, syncVirtualCard } from "@/lib/virtual-card-emulator";

export function FundraiserVirtualCard({ fundraiser, ownerId, groupTitle, busy, children }) {
  const [card, setCard] = useState(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [intent, setIntent] = useState(null);
  const [success, setSuccess] = useState("");
  const locked = useRef(false);
  const id = useId();
  useEffect(() => {
    try {
      setCard(syncVirtualCard(sessionStorage, { ownerId, fundraiser, groupTitle }));
      setReady(true);
      setError("");
    }
    catch {
      setReady(false);
      setError("Не удалось загрузить тестовую карту. Проверьте доступ к хранилищу браузера и перезагрузите страницу.");
    }
  }, [ownerId, fundraiser, groupTitle]);
  const run = action => {
    if (locked.current) return;
    locked.current = true;
    try { action(); setError(""); }
    catch (failure) { setError(failure.message); }
    finally { locked.current = false; }
  };
  const value = Number(amount);
  const valid = merchant.trim() && /^\d+$/.test(amount) && Number.isSafeInteger(value) && value > 0 && value <= (card?.balance || 0);
  const purchaseForm = `${id}-purchase`;
  const actions = !card
    ? <Button type="button" aria-label="Выпустить виртуальную карту" disabled={busy || !ready} onClick={() => run(() => setCard(issueVirtualCard(sessionStorage, { ownerId, fundraiser, groupTitle, isOwner: true })))}>Выпустить карту</Button>
    : intent ? <>
      <Button type="button" disabled={busy || !ready} onClick={() => run(() => {
        setCard(purchaseWithVirtualCard(sessionStorage, { ownerId, fundraiserId: fundraiser.id, ...intent }));
        setIntent(null);
        setAmount("");
        setSuccess("Тестовая покупка выполнена. Реальные средства не списаны.");
      })}>Подтвердить покупку</Button>
      <Button type="button" variant="outline" onClick={() => setIntent(null)}>Отмена</Button>
    </> : <Button type="submit" form={purchaseForm} disabled={busy || !ready || !valid} aria-label="Эмулировать покупку">
      <span className="[[data-overlay-compact]_&]:hidden">Эмулировать покупку</span>
      <span className="hidden [[data-overlay-compact]_&]:inline">Покупка</span>
    </Button>;
  const body = <section className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-background p-4" aria-label="Виртуальная карта — эмулятор">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 font-semibold"><CreditCard className="size-5 shrink-0" aria-hidden="true" />Виртуальная карта</h3><span className="text-xs text-muted-foreground">Тестовый режим</span></div>
    <p>Тестовая карта для пробных покупок. Карта доступна в этой вкладке браузера.</p>
    {card && <>
      <div className="flex min-w-0 flex-col gap-2"><span className="text-xs text-muted-foreground">Тестовая карта · {card.id.slice(-8)}</span><strong>{formatRolls(card.balance)} · тестовый баланс</strong></div>
      {!busy && !intent && <Link className="w-fit underline underline-offset-4" to="/app/rolls">Открыть «Финансы»</Link>}
      <form id={purchaseForm} className="flex min-w-0 flex-col gap-3" onSubmit={event => { event.preventDefault(); if (valid && ready && !busy && !intent) { setSuccess(""); setIntent({ merchant: merchant.trim(), amount: value, idempotencyKey: crypto.randomUUID() }); } }}>
        <Field><FieldLabel htmlFor={`${id}-merchant`}>Тестовый магазин</FieldLabel><Input id={`${id}-merchant`} maxLength={100} value={merchant} disabled={Boolean(intent)} onChange={event => setMerchant(event.target.value)} /></Field>
        <Field><FieldLabel htmlFor={`${id}-amount`}>Сумма тестовой покупки, роллы</FieldLabel><Input id={`${id}-amount`} inputMode="numeric" value={amount} disabled={Boolean(intent)} onChange={event => setAmount(event.target.value)} /></Field>
      </form>
      {intent && <p className="break-words">Подтвердить тестовую покупку в «{intent.merchant}» на {formatRolls(intent.amount)}?</p>}
      {card.purchases.length > 0 && <div className="flex min-w-0 flex-col gap-2" aria-label="Тестовые покупки"><h4 className="font-semibold">Тестовые покупки</h4>{card.purchases.map(purchase => <p key={purchase.id} className="break-words">{purchase.merchant} · {formatRolls(purchase.amount)}</p>)}</div>}
    </>}
    {error && <p role="alert">{error}</p>}{success && <p role="status">{success}</p>}
  </section>;
  return children(body, actions, Boolean(intent));
}

export function FinanceFundraiserCards({ ownerId }) {
  const [listing, setListing] = useState(null);
  useEffect(() => {
    try { setListing(listVirtualCards(sessionStorage, ownerId)); }
    catch { setListing({ cards: [], hasUnreadableCards: true }); }
  }, [ownerId]);

  if (!listing || (!listing.cards.length && !listing.hasUnreadableCards)) return null;
  return <section className="flex min-w-0 flex-col gap-3" aria-label="Карты сборов">
    <header className="typeset typeset-rollapp"><h2>Карты сборов</h2></header>
    {listing.cards.length > 0 && <ul className="flex min-w-0 flex-col gap-2">
      {listing.cards.map(card => <li key={card.fundraiserId} className="flex min-w-0 items-start gap-3 rounded-2xl border bg-card p-4">
        <CreditCard className="size-5 shrink-0 self-center" aria-hidden="true" />
        <div className="flex min-w-0 flex-col gap-1 wrap-anywhere">
          <strong>{card.groupTitle || "Карта сбора"}</strong>
          <span>{formatRolls(card.balance)} · тестовый баланс</span>
          <span className="text-xs text-muted-foreground">Тестовая карта · {card.id.slice(-8)}</span>
        </div>
      </li>)}
    </ul>}
    {listing.hasUnreadableCards && <p role="alert">Не удалось прочитать данные тестовых карт в этой вкладке.</p>}
  </section>;
}
