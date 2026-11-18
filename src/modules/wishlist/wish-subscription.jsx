import { useId, useRef, useState } from "react";
import { ChevronRight, ExternalLink, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/form-surface";
import { PlanningDatePicker } from "@/modules/planning/planning-date-picker";
import { api } from "@/modules/runtime/api";
import { useAsync } from "@/modules/shell/use-async";
import { cn } from "@/lib/utils";
import { dateFromKey } from "../../../shared/modules/calendar/planning-calendar.js";
import { localDateKey } from "../../../shared/modules/planning/planning.js";
import { formatPurchaseBudget, purchaseBudgetMinor } from "../../../shared/modules/planning/purchase-plan.js";
import { SUBSCRIPTION_LEAD_DAYS, SUBSCRIPTION_PERIODS, subscriptionReminderOn } from "../../../shared/modules/planning/subscription-renewal.js";
import { WISH_CURRENCIES } from "./wish-form-data.jsx";
import { PurchaseLimitPreview } from "./wish-purchase-limits.jsx";

const formatDate = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" });
const displayDate = (value) => formatDate.format(dateFromKey(value));
const displayAmount = ({ budgetMinor, currency }) => formatPurchaseBudget({ minor: budgetMinor, currency });
const inputAmount = (minor) => String(minor / 100).replace(".", ",");
const periodLabels = { 1: "Каждый месяц", 3: "Раз в три месяца", 12: "Раз в год" };
const leadLabels = { 0: "В день списания", 1: "За день", 3: "За 3 дня", 7: "За неделю", 14: "За две недели" };
const subscriptionPath = (id) => `/dashboard/subscriptions/${encodeURIComponent(id)}`;

export function WishSubscriptions({ subscriptions, onOpen }) {
  if (!subscriptions?.length) return null;
  return <section aria-label="Подписки и продления" className="grid min-w-0 gap-2 border-t pt-3">
    <h3 className="text-2xl leading-8 font-semibold">Подписки и продления</h3>
    <ul className="min-w-0 divide-y">
      {subscriptions.map((subscription) => <li key={subscription.id}>
        <Button type="button" variant="ghost" aria-label={`Открыть подписку: ${subscription.title}`}
          className="h-auto min-h-12 w-full justify-between gap-3 rounded-xl px-2 py-2 text-left whitespace-normal font-normal"
          onClick={() => onOpen(subscription.id)}>
          <span className="grid min-w-0 gap-1">
            <span className="wrap-anywhere">{subscription.title}</span>
            <span className="text-xs text-muted-foreground">{subscription.trial ? "Первое списание" : "Списание"} {displayDate(subscription.chargeOn)} · {displayAmount(subscription)}</span>
          </span>
          <ChevronRight aria-hidden="true" />
        </Button>
      </li>)}
    </ul>
  </section>;
}

function SubscriptionSelect({ id, value, entries, disabled, onChange }) {
  return <Select value={String(value)} items={entries} onValueChange={(next) => { if (next !== null) onChange(next); }} disabled={disabled}>
    <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
    <SelectContent>{entries.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
  </Select>;
}

function SubscriptionFields({ subscription, busy, onSubmit, error, onBack }) {
  const id = useId();
  const [form, setForm] = useState(() => subscription ? { ...subscription, amount: inputAmount(subscription.budgetMinor) }
    : { title: "", amount: "", currency: "RUB", chargeOn: "", intervalMonths: 1, leadDays: 3, trial: false, url: "" });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const budgetMinor = purchaseBudgetMinor(form.amount, { allowZero: true });
  const currencies = [...new Set([...WISH_CURRENCIES, form.currency])];
  const valid = Boolean(form.title.trim() && form.chargeOn && budgetMinor !== null);
  function submit(event) {
    event.preventDefault();
    if (!valid || busy) return;
    const { title, currency, chargeOn, intervalMonths, leadDays, url, trial } = form;
    onSubmit({ title, budgetMinor, currency, chargeOn, intervalMonths, leadDays, url, trial, revision: subscription?.revision ?? null });
  }
  return <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
    <div className="app-drawer-body flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <FieldGroup>
        <Field><FieldLabel htmlFor={`${id}-title`}>Сервис</FieldLabel>
          <Input id={`${id}-title`} value={form.title} maxLength={160} required disabled={busy} onChange={(event) => set("title", event.target.value)} />
        </Field>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field><FieldLabel htmlFor={`${id}-budget`}>Ожидаемая сумма</FieldLabel>
            <Input id={`${id}-budget`} inputMode="decimal" maxLength={12} value={form.amount} required disabled={busy}
              aria-invalid={Boolean(form.amount && budgetMinor === null)} onChange={(event) => set("amount", event.target.value)} />
          </Field>
          <Field><FieldLabel htmlFor={`${id}-currency`}>Валюта</FieldLabel>
            <SubscriptionSelect id={`${id}-currency`} value={form.currency} entries={currencies.map((value) => ({ value, label: value }))} disabled={busy} onChange={(value) => set("currency", value)} />
          </Field>
        </div>
        <Field><FieldLabel htmlFor={`${id}-date`}>Дата списания</FieldLabel>
          <PlanningDatePicker id={`${id}-date`} label="Дата списания" value={form.chargeOn} disabled={busy} onChange={(value) => set("chargeOn", value)} />
        </Field>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field><FieldLabel htmlFor={`${id}-period`}>Период</FieldLabel>
            <SubscriptionSelect id={`${id}-period`} value={form.intervalMonths} entries={SUBSCRIPTION_PERIODS.map((value) => ({ value: String(value), label: periodLabels[value] }))} disabled={busy} onChange={(value) => set("intervalMonths", Number(value))} />
          </Field>
          <Field><FieldLabel htmlFor={`${id}-lead`}>Напомнить в To Do</FieldLabel>
            <SubscriptionSelect id={`${id}-lead`} value={form.leadDays} entries={SUBSCRIPTION_LEAD_DAYS.map((value) => ({ value: String(value), label: leadLabels[value] }))} disabled={busy} onChange={(value) => set("leadDays", Number(value))} />
          </Field>
        </div>
        <Field orientation="horizontal"><Switch id={`${id}-trial`} checked={form.trial} disabled={busy} onCheckedChange={(value) => set("trial", value)} />
          <FieldLabel htmlFor={`${id}-trial`}>Первое списание после пробного периода</FieldLabel>
        </Field>
        <Field><FieldLabel htmlFor={`${id}-url`}>Ссылка на управление</FieldLabel>
          <Input id={`${id}-url`} type="url" maxLength={2048} value={form.url} disabled={busy} onChange={(event) => set("url", event.target.value)} />
          <FieldDescription>Необязательно. Например, страница подписки в сервисе.</FieldDescription>
        </Field>
      </FieldGroup>
      {budgetMinor !== null && form.chargeOn && <PurchaseLimitPreview dueOn={form.chargeOn} currency={form.currency} budgetMinor={budgetMinor}
        previousPlan={subscription && { currency: subscription.currency, dueOn: subscription.chargeOn, budgetMinor: subscription.budgetMinor }} />}
      {onBack && <Button type="button" variant="ghost" className="self-start" disabled={busy} onClick={onBack}>К подписке</Button>}
    </div>
    <DrawerFooter>
      <Button type="submit" disabled={!valid || busy}>{busy && <Spinner />}Сохранить</Button>
    </DrawerFooter>
  </form>;
}

function ConfirmCharge({ subscription, busy, error, onCharge, onBack }) {
  const id = useId();
  const today = localDateKey(new Date());
  const [amount, setAmount] = useState(() => inputAmount(subscription.budgetMinor));
  const [purchasedOn, setPurchasedOn] = useState(today);
  const amountMinor = purchaseBudgetMinor(amount, { allowZero: true });
  const valid = amountMinor !== null && Boolean(purchasedOn);
  function submit(event) {
    event.preventDefault();
    if (valid && !busy) onCharge({ action: "paid", amountMinor, purchasedOn });
  }
  return <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
    <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <FieldGroup>
        <Field><FieldLabel htmlFor={`${id}-amount`}>Списали, {subscription.currency}</FieldLabel>
          <Input id={`${id}-amount`} inputMode="decimal" maxLength={12} value={amount} required disabled={busy}
            aria-invalid={Boolean(amount && amountMinor === null)} onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <Field><FieldLabel htmlFor={`${id}-date`}>Фактическая дата списания</FieldLabel>
          <PlanningDatePicker id={`${id}-date`} label="Фактическая дата списания" value={purchasedOn} disabled={busy} onChange={setPurchasedOn} />
        </Field>
      </FieldGroup>
      <Button type="button" variant="ghost" className="self-start" disabled={busy} onClick={onBack}>К подписке</Button>
    </div>
    <DrawerFooter><Button type="submit" disabled={!valid || busy}>{busy && <Spinner />}Сохранить списание</Button></DrawerFooter>
  </form>;
}

function StopReminders({ busy, error, onStop, onBack }) {
  return <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); if (!busy) onStop(); }}>
    <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <Button type="button" variant="outline" className="min-h-12 self-start rounded-full" disabled={busy} onClick={onBack}>К подписке</Button>
    </div>
    <DrawerFooter><Button type="submit" variant="destructive" disabled={busy}>{busy && <Spinner />}Остановить</Button></DrawerFooter>
  </form>;
}

function SubscriptionDetails({ subscription, busy, error, onPaid, onEdit, onSkip, onStop }) {
  return <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {subscription.stopped ? <p>Напоминания остановлены.</p> : <dl className="grid gap-3">
      <div><dt className="text-xs text-muted-foreground">{subscription.trial ? "Первое списание после пробного периода" : "Ближайшее списание"}</dt><dd className="font-semibold">{displayDate(subscription.chargeOn)} · {displayAmount(subscription)}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Напоминание</dt><dd>{displayDate(subscriptionReminderOn(subscription))} · {periodLabels[subscription.intervalMonths]}</dd></div>
    </dl>}
    {!subscription.stopped && <Button type="button" className="min-h-12 self-start rounded-full" disabled={busy} onClick={onPaid}>Записать списание</Button>}
    {subscription.url && <a href={subscription.url} target="_blank" rel="noreferrer"
      className={cn(buttonVariants({ variant: "outline" }), "min-h-12 self-start rounded-full")}>
      Открыть сервис <ExternalLink aria-hidden="true" />
    </a>}
    {!subscription.stopped && <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" className="min-h-12 rounded-full" disabled={busy} onClick={onEdit}>Изменить</Button>
      <Button type="button" variant="outline" className="min-h-12 rounded-full" disabled={busy} onClick={onSkip}>Пропустить период</Button>
      <Button type="button" variant="destructive" className="min-h-12 rounded-full" disabled={busy} onClick={onStop}>Остановить напоминания</Button>
    </div>}
  </div>;
}

export function WishSubscription({ id, onClose, onSaved }) {
  const { data, loading, error: loadError, reload } = useAsync(() => id ? api.get(subscriptionPath(id)) : Promise.resolve(null), [id]);
  const [screen, setScreen] = useState(id ? "review" : "edit");
  const [draftId] = useState(() => id || crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const subscription = data?.subscription;
  const changeScreen = (next) => { setScreen(next); setError(""); };
  const review = () => changeScreen("review");

  async function save(payload, action) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const path = subscriptionPath(draftId);
      const { task } = await api.post(action ? `${path}/review` : path, action ? { ...payload, revision: subscription.revision } : payload);
      onSaved(task, action);
      onClose();
    } catch (cause) {
      setError(cause.message || "Не удалось сохранить подписку");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const title = screen === "paid" ? "Подтверждение списания"
    : screen === "stop" ? "Остановить напоминания?"
      : screen === "edit" ? (id ? "Изменить подписку" : "Новая подписка") : subscription?.title || "Подписка";
  return <Drawer open disablePointerDismissal={busy} onOpenChange={(open) => { if (!open && !saving.current) onClose(); }}>
    <DrawerContent className="rollapp-body app-drawer--form">
      <DrawerHeader className="min-w-0 pr-16 text-left!">
        <DrawerTitle className="wrap-anywhere">{title}</DrawerTitle>
        <DrawerDescription>{screen === "stop" ? "Управление подпиской и её отмена остаются в самом сервисе. История списаний сохранится."
          : screen === "paid" ? "Запись попадёт в историю покупок. Напоминание перейдёт на следующий период."
            : "Напоминание о продлении в To Do."}</DrawerDescription>
      </DrawerHeader>
      <DrawerClose render={<Button variant="ghost" type="button" size="icon" className="absolute top-2 right-2 z-10" disabled={busy} />} aria-label="Закрыть"><X aria-hidden="true" /></DrawerClose>
      {id && (loading || loadError) ? <div className="app-drawer-body grid gap-3 overflow-y-auto p-4">
        {loadError ? <><Alert variant="destructive"><AlertDescription>{loadError.message}</AlertDescription></Alert>
          <Button type="button" variant="outline" className="min-h-12 justify-self-start rounded-full" onClick={() => reload().catch(() => {})}>Повторить</Button></>
          : <p className="flex items-center gap-2" role="status"><Spinner />Загружаем подписку…</p>}
      </div> : screen === "edit" ? <SubscriptionFields subscription={subscription} busy={busy} error={error} onBack={id ? review : undefined} onSubmit={save} />
        : screen === "paid" ? <ConfirmCharge subscription={subscription} busy={busy} error={error} onBack={review} onCharge={(payload) => save(payload, "paid")} />
          : screen === "stop" ? <StopReminders busy={busy} error={error} onBack={review} onStop={() => save({ action: "stop" }, "stop")} />
            : <SubscriptionDetails subscription={subscription} busy={busy} error={error} onPaid={() => changeScreen("paid")}
              onEdit={() => changeScreen("edit")} onSkip={() => save({ action: "skip" }, "skip")} onStop={() => changeScreen("stop")} />}
    </DrawerContent>
  </Drawer>;
}
