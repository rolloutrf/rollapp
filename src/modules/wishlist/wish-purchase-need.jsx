import { useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/form-surface";
import { PlanningDatePicker } from "@/modules/planning/planning-date-picker";
import { api } from "@/modules/runtime/api";
import { MAX_PURCHASE_VARIANTS, PURCHASE_DELIVERY_COUNTRIES, purchaseBudgetMinor } from "../../../shared/modules/planning/purchase-plan.js";
import { WISH_CURRENCIES } from "./wish-form-data.jsx";
import { PurchaseLimitPreview } from "./wish-purchase-limits.jsx";

const countryNames = new Intl.DisplayNames("ru", { type: "region" });

function NeedSelect({ id, disabled, value, onValueChange, items, placeholder }) {
  return <Select items={items} value={value} onValueChange={onValueChange} disabled={disabled}>
    <SelectTrigger id={id} className="w-full min-w-0"><SelectValue placeholder={placeholder} className="min-w-0 truncate" /></SelectTrigger>
    <SelectContent>{items.map(({ value: key, label }) => <SelectItem key={key} value={key} title={label} className="*:first:min-w-0">
      <span className="truncate">{label}</span>
    </SelectItem>)}</SelectContent>
  </Select>;
}

export function WishPurchaseNeed({ plan, wishes, onClose, onSaved }) {
  const formId = useId();
  const [id] = useState(() => plan?.id || `need-${crypto.randomUUID()}`);
  const [form, setForm] = useState(() => ({
    title: plan?.title || "", criteria: plan?.need.criteria || "", dueOn: plan?.dueOn || "", neededBy: plan?.need.neededBy || "",
    currency: plan?.purchaseBudget.currency || "RUB", budget: plan ? String(plan.purchaseBudget.minor / 100).replace(".", ",") : "",
    saved: plan?.need.savedMinor ? String(plan.need.savedMinor / 100).replace(".", ",") : "",
    country: plan?.need.country || "RU", variantIds: plan?.need.variantIds || [],
  }));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const eligible = wishes.filter((wish) => wish.currency === form.currency);
  const options = eligible.filter((wish) => !form.variantIds.includes(wish.id)).map(({ id: value, title: label }) => ({ value, label }));
  const budgetMinor = purchaseBudgetMinor(form.budget);
  const savedMinor = form.saved.trim() ? purchaseBudgetMinor(form.saved, { allowZero: true }) : 0;
  const invalidSaved = savedMinor === null || (budgetMinor !== null && savedMinor > budgetMinor);
  const valid = form.title.trim() && budgetMinor && !invalidSaved && form.dueOn && form.variantIds.every((key) => eligible.some((wish) => wish.id === key));
  async function submit(event) {
    event.preventDefault();
    if (!valid || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    const { budget: _budget, saved: _saved, ...fields } = form;
    try {
      await api.post(`/dashboard/purchase-needs/${id}`, { ...fields, budgetMinor, savedMinor, revision: plan?.revision ?? null });
      onSaved();
      onClose();
    } catch (cause) {
      setError(cause.message || "Не удалось сохранить потребность");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return <Drawer open disablePointerDismissal={busy} onOpenChange={(open) => { if (!open && !saving.current) onClose(); }}>
    <DrawerContent className="rollapp-body app-drawer--form">
      <DrawerHeader className="pr-16 text-left!">
        <DrawerTitle>{plan ? "Изменить потребность" : "Новая потребность"}</DrawerTitle>
        <DrawerDescription>Один бюджет и один пересмотр в To Do для всех вариантов.</DrawerDescription>
      </DrawerHeader>
      <DrawerClose render={<Button variant="ghost" type="button" size="icon" className="absolute top-2 right-2 z-10" disabled={busy} />} aria-label="Закрыть"><X aria-hidden="true" /></DrawerClose>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
        <div className="app-drawer-body flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${formId}-title`}>Что нужно</FieldLabel>
              <Input id={`${formId}-title`} value={form.title} disabled={busy} maxLength={160} required onChange={(event) => set("title", event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${formId}-criteria`}>Требования к товару</FieldLabel>
              <Textarea id={`${formId}-criteria`} value={form.criteria} maxLength={500} disabled={busy} onChange={(event) => set("criteria", event.target.value)} />
              <FieldDescription>Необязательно. Например, совместимая модель или объём упаковки.</FieldDescription>
            </Field>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${formId}-budget`}>Бюджет с доставкой</FieldLabel>
                <Input id={`${formId}-budget`} inputMode="decimal" maxLength={12} required disabled={busy}
                  aria-invalid={Boolean(form.budget.trim() && !budgetMinor)} value={form.budget} onChange={(event) => set("budget", event.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-currency`}>Валюта</FieldLabel>
                <NeedSelect id={`${formId}-currency`} value={form.currency} items={WISH_CURRENCIES.map((value) => ({ value, label: value }))}
                  disabled={busy || Boolean(plan?.replenishment)} onValueChange={(currency) => {
                    if (currency && currency !== form.currency) setForm((current) => ({ ...current, currency, saved: "", variantIds: [] }));
                  }} />
              </Field>
            </div>
            <Field data-invalid={invalidSaved || undefined}>
              <FieldLabel htmlFor={`${formId}-saved`}>Уже отложили</FieldLabel>
              <Input id={`${formId}-saved`} inputMode="decimal" maxLength={12} disabled={busy} aria-invalid={invalidSaved}
                value={form.saved} onChange={(event) => set("saved", event.target.value)} />
              <FieldDescription>{invalidSaved ? "Введите сумму в пределах бюджета потребности." : "Укажите сумму, которую уже отложили на эту покупку."}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${formId}-due`}>Дата пересмотра в To Do</FieldLabel>
              <PlanningDatePicker id={`${formId}-due`} label="Дата пересмотра в To Do" value={form.dueOn} disabled={busy} onChange={(date) => set("dueOn", date)} />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${formId}-needed`}>Получить к дате</FieldLabel>
              <PlanningDatePicker id={`${formId}-needed`} label="Получить к дате" value={form.neededBy} disabled={busy} clearable onChange={(date) => set("neededBy", date)} />
            </Field>
            {budgetMinor && form.dueOn && <PurchaseLimitPreview dueOn={form.dueOn} currency={form.currency} budgetMinor={budgetMinor}
              previousPlan={plan && { currency: plan.purchaseBudget.currency, budgetMinor: plan.purchaseBudget.minor, dueOn: plan.dueOn }} />}
            <Field>
              <FieldLabel htmlFor={`${formId}-country`}>Страна доставки</FieldLabel>
              <NeedSelect id={`${formId}-country`} value={form.country} disabled={busy} onValueChange={(country) => { if (country) set("country", country); }}
                items={PURCHASE_DELIVERY_COUNTRIES.map((value) => ({ value, label: countryNames.of(value) }))} />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${formId}-variants`}>Варианты из «Моих желаний»</FieldLabel>
              <NeedSelect id={`${formId}-variants`} value={null} placeholder="Добавить вариант" items={options}
                disabled={busy || !options.length || form.variantIds.length >= MAX_PURCHASE_VARIANTS}
                onValueChange={(next) => { if (next) setForm((current) => ({ ...current, variantIds: [...current.variantIds, next] })); }} />
              <FieldDescription>Можно добавить до {MAX_PURCHASE_VARIANTS} товаров в этой валюте.</FieldDescription>
              {form.variantIds.length > 0 && <ul className="grid min-w-0 gap-2">
                {form.variantIds.map((key) => {
                  const title = eligible.find((wish) => wish.id === key)?.title || "Недоступный товар";
                  return <li key={key} className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 wrap-anywhere">{title}</span>
                    <Button type="button" variant="destructive" size="icon" className="size-12 shrink-0 rounded-full" disabled={busy}
                      aria-label={`Убрать ${title}`} onClick={() => set("variantIds", form.variantIds.filter((item) => item !== key))}><X aria-hidden="true" /></Button>
                  </li>;
                })}
              </ul>}
            </Field>
          </FieldGroup>
        </div>
        <DrawerFooter><Button type="submit" disabled={!valid || busy} aria-busy={Boolean(busy) || undefined}>Сохранить</Button></DrawerFooter>
      </form>
    </DrawerContent>
  </Drawer>;
}
