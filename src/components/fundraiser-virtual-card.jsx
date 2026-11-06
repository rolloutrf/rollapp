import { useEffect, useId, useRef, useState } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatRolls } from "../../shared/rolls.js";
import { issueVirtualCard, purchaseWithVirtualCard, readVirtualCard } from "@/lib/virtual-card-emulator";

export function FundraiserVirtualCard({ fundraiser, ownerId, children }) {
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
    try { setCard(readVirtualCard(sessionStorage, ownerId, fundraiser.id)); setReady(true); }
    catch { setError("Не удалось загрузить тестовую карту. Проверьте доступ к хранилищу браузера и перезагрузите страницу."); }
  }, [ownerId, fundraiser.id]);
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
    ? <Button type="button" aria-label="Выпустить виртуальную карту" disabled={!ready} onClick={() => run(() => setCard(issueVirtualCard(sessionStorage, { ownerId, fundraiser, isOwner: true })))}>Выпустить карту</Button>
    : intent ? <>
      <Button type="button" onClick={() => run(() => {
        setCard(purchaseWithVirtualCard(sessionStorage, { ownerId, fundraiserId: fundraiser.id, ...intent }));
        setIntent(null);
        setAmount("");
        setSuccess("Тестовая покупка выполнена. Реальные средства не списаны.");
      })}>Подтвердить покупку</Button>
      <Button type="button" variant="outline" onClick={() => setIntent(null)}>Отмена</Button>
    </> : <Button type="submit" form={purchaseForm} disabled={!valid} aria-label="Эмулировать покупку">
      <span className="[[data-overlay-compact]_&]:hidden">Эмулировать покупку</span>
      <span className="hidden [[data-overlay-compact]_&]:inline">Покупка</span>
    </Button>;
  const body = <section className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-background p-4" aria-label="Виртуальная карта — эмулятор">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 font-semibold"><CreditCard className="size-5 shrink-0" aria-hidden="true" />Виртуальная карта</h3><span className="text-xs text-muted-foreground">Тестовый режим</span></div>
    <p>Эмуляция выпуска и покупок. Реальные платежи не проводятся, роллы из кошелька не списываются. Карта сохранится только в этой вкладке браузера.</p>
    {card && <>
      <div className="flex min-w-0 flex-col gap-2"><span className="text-xs text-muted-foreground">Тестовая карта · {card.id.slice(-8)}</span><strong>{formatRolls(card.balance)} · тестовый баланс</strong></div>
      <form id={purchaseForm} className="flex min-w-0 flex-col gap-3" onSubmit={event => { event.preventDefault(); if (valid && !intent) { setSuccess(""); setIntent({ merchant: merchant.trim(), amount: value, idempotencyKey: crypto.randomUUID() }); } }}>
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
