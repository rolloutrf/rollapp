import { useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/form-surface";
import { api } from "@/modules/runtime/api";
import { useAsync } from "@/modules/shell/use-async";
import { formatPurchaseBudget, purchaseBudgetMinor } from "../../../shared/modules/planning/purchase-plan.js";
import { WISH_CURRENCIES } from "./wish-form-data.jsx";
import { dateFromKey } from "../../../shared/modules/calendar/planning-calendar.js";

const monthPath = "/dashboard/purchase-month";
const monthLabel = new Intl.DateTimeFormat("ru", { month: "long", year: "numeric" });
export const readPurchaseMonth = (month) => api.get(`${monthPath}?${new URLSearchParams({ month })}`);

function limitText(balance, currency, missing) {
  const amount = formatPurchaseBudget({ minor: Math.abs(balance), currency });
  if (balance < 0) return `Превышение лимита ${missing ? "от " : ""}${amount}`;
  return missing ? `Свободно до ${amount}` : `Свободно ${amount}`;
}

export function PurchaseLimitPreview({ dueOn, currency, budgetMinor, previousPlan, load = readPurchaseMonth }) {
  const month = dueOn.slice(0, 7);
  const { data, error } = useAsync(async () => ({ month, ...await load(month) }), [month, load]);
  if (error) return <Alert><AlertDescription>Не удалось проверить лимит месяца.</AlertDescription></Alert>;
  const limit = data?.month === month && data.limits?.find((entry) => entry.currency === currency);
  if (!limit) return null;
  const oldMinor = previousPlan?.currency === currency && previousPlan.dueOn?.startsWith(`${month}-`) ? previousPlan.budgetMinor : 0;
  const balance = limit.minor - limit.spentMinor - limit.openMinor + (oldMinor || 0) - budgetMinor;
  return <Alert variant={balance < 0 ? "destructive" : "default"} role="status">
    <AlertDescription>{limitText(balance, currency, limit.missingAmountCount)} с учётом этой покупки.</AlertDescription>
  </Alert>;
}

export function PurchaseMonthLimits({ limits }) {
  if (!limits.length) return null;
  return <ul className="grid min-w-0 gap-2" aria-label="Лимиты месяца">
    {limits.map(({ currency, minor, spentMinor, openMinor, missingAmountCount }) => {
      const balance = minor - spentMinor - openMinor;
      return <li key={currency} className="grid min-w-0 gap-1 rounded-xl border px-3 py-2 @lg/purchases:grid-cols-2 @lg/purchases:gap-4">
        <span className="wrap-anywhere">Лимит {formatPurchaseBudget({ minor, currency })}</span>
        <span className={`wrap-anywhere @lg/purchases:text-right ${balance < 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{limitText(balance, currency, missingAmountCount)}</span>
      </li>;
    })}
  </ul>;
}

export function WishPurchaseLimitEditor({ month, limits, monthCurrencies, returnFocusRef, onClose, onSaved }) {
  const id = useId();
  const [currency, setCurrency] = useState(limits[0]?.currency || "RUB");
  const initialValue = (key) => {
    const current = limits.find((limit) => limit.currency === key);
    return current ? String(current.minor / 100).replace(".", ",") : "";
  };
  const [amount, setAmount] = useState(() => initialValue(currency));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const currencies = [...new Set([...WISH_CURRENCIES, ...monthCurrencies, ...limits.map((entry) => entry.currency)])];
  const hasLimit = limits.some((entry) => entry.currency === currency);
  const minor = amount.trim() ? purchaseBudgetMinor(amount, { allowZero: true }) : null;
  const valid = amount.trim() ? minor !== null : hasLimit;

  async function submit(event) {
    event.preventDefault();
    if (!valid || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await api.post(`${monthPath}/limit`, { month, currency, minor });
      onSaved();
      onClose();
    } catch (cause) {
      setError(cause.message || "Не удалось сохранить лимит");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return <Drawer open disablePointerDismissal={busy} onOpenChange={(open) => { if (!open && !saving.current) onClose(); }}>
    <DrawerContent className="rollapp-body app-drawer--form" finalFocus={returnFocusRef}>
      <DrawerHeader className="pr-16 text-left!">
        <DrawerTitle>Лимит месяца</DrawerTitle>
        <DrawerDescription>{monthLabel.format(dateFromKey(`${month}-01`))}. Свободная сумма учитывает траты и открытые планы.</DrawerDescription>
      </DrawerHeader>
      <DrawerClose render={<Button variant="ghost" type="button" size="icon" className="absolute top-2 right-2 z-10" disabled={busy} />} aria-label="Закрыть"><X aria-hidden="true" /></DrawerClose>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
        <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${id}-currency`}>Валюта лимита</FieldLabel>
              <Select items={currencies.map((value) => ({ value, label: value }))} value={currency} disabled={busy} onValueChange={(next) => {
                if (next) { setCurrency(next); setAmount(initialValue(next)); }
              }}>
                <SelectTrigger id={`${id}-currency`} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{currencies.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-amount`}>Сумма лимита</FieldLabel>
              <Input id={`${id}-amount`} value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy} inputMode="decimal" maxLength={12} />
              {hasLimit && <FieldDescription>Очистите поле, чтобы убрать лимит.</FieldDescription>}
            </Field>
          </FieldGroup>
        </div>
        <DrawerFooter><Button type="submit" variant={hasLimit && !amount.trim() ? "destructive" : "default"} disabled={busy || !valid}>
          {busy && <Spinner />}{hasLimit && !amount.trim() ? "Убрать лимит" : "Сохранить"}
        </Button></DrawerFooter>
      </form>
    </DrawerContent>
  </Drawer>;
}
