import { useEffect, useId, useRef, useState } from "react";
import { CalendarPlus, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/form-surface";
import { PlanningDatePicker } from "@/modules/planning/planning-date-picker";
import { api } from "@/modules/runtime/api";
import { useToast } from "@/modules/shell/toast";
import { purchaseBudgetMinor } from "../../../shared/modules/planning/purchase-plan.js";
import { WISH_CURRENCY_SYMBOLS, formatEventDate } from "./wish-form-data.jsx";
import { PriceWatchSettings } from "./wish-price-watch.jsx";
import { PurchaseLimitPreview } from "./wish-purchase-limits.jsx";

const planPath = (id) => `/wishes/${encodeURIComponent(id)}/purchase-plan`;
const readPlan = (id) => api.get(planPath(id));
const savePlan = (id, payload) => api.post(planPath(id), payload);

export function PurchasePlanMenuItem({ disabled, onSelect }) {
  return <DropdownMenuItem className="min-h-12 gap-2 px-3 py-2 text-base" disabled={disabled} aria-haspopup="dialog" onClick={onSelect}>
    <CalendarPlus aria-hidden="true" /> Запланировать покупку
  </DropdownMenuItem>;
}

export function WishPurchasePlan({ wish, onClose, onSaved, load = readPlan, save = savePlan, loadMonth }) {
  const id = useId();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const saving = useRef(false);

  useEffect(() => {
    active.current = true;
    let current = true;
    load(wish.id).then(({ plan, revision, isOpen }) => {
      if (!current) return;
      const budget = plan.budgetMinor === null ? "" : (plan.budgetMinor / 100).toFixed(plan.budgetMinor % 100 ? 2 : 0).replace(".", ",");
      setForm({ ...plan, budget, revision, previousPlan: isOpen ? plan : null, priceWatchCountry: plan.priceWatch?.country ?? null });
    }).catch((cause) => {
      if (current) setError(cause.message || "Не удалось загрузить план покупки");
    });
    return () => { current = false; active.current = false; };
  }, [wish.id, load, retry]);

  const change = (field, value) => {
    setError("");
    setForm((current) => ({ ...current, [field]: value }));
  };
  const budgetMinor = form ? purchaseBudgetMinor(form.budget) : null;
  const submit = async (event) => {
    event.preventDefault();
    if (saving.current || !budgetMinor || !form?.dueOn) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const { plan } = await save(wish.id, { dueOn: form.dueOn, budgetMinor, currency: form.currency, revision: form.revision, priceWatchCountry: form.priceWatchCountry });
      if (!active.current) return;
      toast(`Покупка в To Do на ${formatEventDate(plan.dueOn)}`);
      onClose();
      onSaved?.(plan);
    } catch (cause) {
      if (active.current) setError(cause.message || "Не удалось сохранить план покупки");
    } finally {
      saving.current = false;
      if (active.current) setBusy(false);
    }
  };

  return <Drawer open disablePointerDismissal={busy} onOpenChange={(open) => { if (!open && !saving.current) onClose(); }}>
    <DrawerContent className="rollapp-body app-drawer--form">
      <DrawerHeader className="pr-16 text-left!">
        <DrawerTitle>Запланировать покупку</DrawerTitle>
        <DrawerDescription className="wrap-anywhere">{wish.title}</DrawerDescription>
      </DrawerHeader>
      <DrawerClose render={<Button variant="ghost" type="button" size="icon" className="absolute top-2 right-2 z-10" disabled={busy} />} aria-label="Закрыть"><X aria-hidden="true" /></DrawerClose>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
        <div className="app-drawer-body flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {form ? <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${id}-budget`}>Бюджет, {WISH_CURRENCY_SYMBOLS[form.currency] || form.currency}</FieldLabel>
              <Input id={`${id}-budget`} inputMode="decimal" required maxLength={12} value={form.budget} disabled={busy} aria-invalid={Boolean(form.budget.trim() && !budgetMinor)} onChange={(event) => change("budget", event.target.value)} />
              {form.budget.trim() && !budgetMinor && <p className="text-muted-foreground text-sm">Укажите сумму больше нуля, до двух знаков после запятой.</p>}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-date`}>Дата пересмотра</FieldLabel>
              <PlanningDatePicker id={`${id}-date`} value={form.dueOn} onChange={(value) => change("dueOn", value)} label="Дата пересмотра" className="w-full" disabled={busy} />
            </Field>
            {budgetMinor && form.dueOn && <PurchaseLimitPreview dueOn={form.dueOn} currency={form.currency} budgetMinor={budgetMinor}
              previousPlan={form.previousPlan} load={loadMonth} />}
            <PriceWatchSettings country={form.priceWatchCountry} hasSource={Boolean(wish.url)} disabled={busy}
              onChange={(value) => change("priceWatchCountry", value)} />
          </FieldGroup> : error ? <Button type="button" variant="outline" onClick={() => { setError(""); setRetry((value) => value + 1); }}>Повторить</Button> : <p className="flex items-center gap-2" role="status"><Spinner />Загружаем план…</p>}
          {form && <p className="text-muted-foreground">Появится в основном списке To Do.</p>}
        </div>
        <DrawerFooter><Button type="submit" disabled={busy || !budgetMinor || !form?.dueOn}>{busy && <Spinner />}Сохранить</Button></DrawerFooter>
      </form>
    </DrawerContent>
  </Drawer>;
}
