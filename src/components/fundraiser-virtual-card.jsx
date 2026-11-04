import { useEffect, useId, useRef, useState } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ControlBar } from "@/components/control-bar";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatRolls } from "../../shared/rolls.js";
import { issueVirtualCard, purchaseWithVirtualCard, readVirtualCard } from "@/lib/virtual-card-emulator";

export function FundraiserVirtualCard({ fundraiser, ownerId }) {
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
  return <section className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-background p-4" aria-label="Виртуальная карта — эмулятор">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 font-semibold"><CreditCard className="size-5 shrink-0" aria-hidden="true" />Виртуальная карта</h3><span className="text-xs text-muted-foreground">Тестовый режим</span></div>
    <p>Эмуляция выпуска и покупок. Реальные платежи не проводятся, роллы из кошелька не списываются. Карта сохранится только в этой вкладке браузера.</p>
    {!card ? <ControlBar className="flex flex-wrap gap-2"><Button aria-label="Выпустить виртуальную карту" disabled={!ready} onClick={() => run(() => setCard(issueVirtualCard(sessionStorage, { ownerId, fundraiser, isOwner: true })))}>Выпустить карту</Button></ControlBar> : <>
      <div className="flex min-w-0 flex-col gap-2"><span className="text-xs text-muted-foreground">Тестовая карта · {card.id.slice(-8)}</span><strong>{formatRolls(card.balance)} · тестовый баланс</strong></div>
      <form className="flex min-w-0 flex-col gap-3" onSubmit={event => { event.preventDefault(); if (valid && !intent) { setSuccess(""); setIntent({ merchant: merchant.trim(), amount: value, idempotencyKey: crypto.randomUUID() }); } }}>
        <Field><FieldLabel htmlFor={`${id}-merchant`}>Тестовый магазин</FieldLabel><Input id={`${id}-merchant`} maxLength={100} value={merchant} disabled={Boolean(intent)} onChange={event => setMerchant(event.target.value)} /></Field>
        <Field><FieldLabel htmlFor={`${id}-amount`}>Сумма тестовой покупки, роллы</FieldLabel><Input id={`${id}-amount`} inputMode="numeric" value={amount} disabled={Boolean(intent)} onChange={event => setAmount(event.target.value)} /></Field>
        {!intent && <ControlBar className="flex flex-wrap gap-2"><Button type="submit" variant="outline" disabled={!valid}>Эмулировать покупку</Button></ControlBar>}
      </form>
      {intent && <div className="flex min-w-0 flex-col gap-3"><p className="break-words">Подтвердить тестовую покупку в «{intent.merchant}» на {formatRolls(intent.amount)}?</p><ControlBar className="flex flex-wrap gap-2"><Button onClick={() => run(() => { setCard(purchaseWithVirtualCard(sessionStorage, { ownerId, fundraiserId: fundraiser.id, ...intent })); setIntent(null); setAmount(""); setSuccess("Тестовая покупка выполнена. Реальные средства не списаны."); })}>Подтвердить покупку</Button><Button variant="outline" onClick={() => setIntent(null)}>Отмена</Button></ControlBar></div>}
      {card.purchases.length > 0 && <div className="flex min-w-0 flex-col gap-2" aria-label="Тестовые покупки"><h4 className="font-semibold">Тестовые покупки</h4>{card.purchases.map(purchase => <p key={purchase.id} className="break-words">{purchase.merchant} · {formatRolls(purchase.amount)}</p>)}</div>}
    </>}
    {error && <p role="alert">{error}</p>}{success && <p role="status">{success}</p>}
  </section>;
}
