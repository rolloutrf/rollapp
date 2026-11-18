import { useId } from "react";
import { Bell, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatPurchaseBudget, PURCHASE_DELIVERY_COUNTRIES } from "../../../shared/modules/planning/purchase-plan.js";

const countries = new Intl.DisplayNames("ru", { type: "region" });
const checkedDate = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" });
const checkMessages = {
  within_budget: "Цена с доставкой укладывается в бюджет",
  above_budget: "Цена с доставкой выше бюджета",
  unconfirmed: "Магазин не подтвердил итог с доставкой для выбранной страны",
  unavailable: "Не удалось загрузить страницу магазина",
};

export function PriceWatchSettings({ country, disabled, hasSource, onChange }) {
  const id = useId();
  return <Field>
    <div className="flex min-h-12 items-center justify-between gap-4">
      <FieldLabel htmlFor={`${id}-enabled`}>Сообщить, когда цена с доставкой уложится в бюджет</FieldLabel>
      <Switch id={`${id}-enabled`} type="button" aria-describedby={`${id}-description`} checked={Boolean(country)}
        disabled={disabled || (!country && !hasSource)} onCheckedChange={(checked) => onChange(checked ? "RU" : null)} />
    </div>
    <FieldDescription id={`${id}-description`}>
      {hasSource ? "Уведомление появится в «Финансах», в разделе «Покупки». Сравниваем только подтверждённые тарифы магазина." : "Для проверки добавьте ссылку на товар в желание."}
    </FieldDescription>
    {country && <Field>
      <FieldLabel htmlFor={`${id}-country`}>Страна доставки</FieldLabel>
      <Select value={country} disabled={disabled} onValueChange={(value) => { if (value) onChange(value); }}>
        <SelectTrigger id={`${id}-country`} className="w-full"><SelectValue>{countries.of(country)}</SelectValue></SelectTrigger>
        <SelectContent>{PURCHASE_DELIVERY_COUNTRIES.map((code) => <SelectItem key={code} value={code}>{countries.of(code)}</SelectItem>)}</SelectContent>
      </Select>
    </Field>}
  </Field>;
}

function PriceCheckTime({ at }) {
  return <span className="text-xs text-muted-foreground">Проверено <time dateTime={at}>{checkedDate.format(new Date(at))}</time></span>;
}

export function PurchasePriceNotice({ notice, title, onOpen }) {
  const total = formatPurchaseBudget({ minor: notice.totalMinor, currency: notice.currency });
  return <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-lg border border-border bg-muted/30 p-3" data-purchase-price-notice="">
    <Bell aria-hidden="true" className="mt-1 size-5" />
    <div className="grid min-w-0 gap-1">
      <strong className="wrap-anywhere">{title || "Цена уложилась в бюджет"}</strong>
      <span className="wrap-anywhere"><strong className="tabular-nums">{total}</strong> с доставкой · {notice.store}</span>
      <PriceCheckTime at={notice.checkedAt} />
      {onOpen ? <Button type="button" variant="outline" className="min-h-12 justify-self-start rounded-full" aria-label={`Пересмотреть предложение: ${title}`} onClick={onOpen}>Пересмотреть</Button>
        : <a className="inline-flex min-h-12 items-center gap-2 justify-self-start underline underline-offset-4" href={notice.url} target="_blank" rel="noopener noreferrer">Открыть магазин <ExternalLink aria-hidden="true" className="size-4" /></a>}
    </div>
  </div>;
}

export function PurchasePriceStatus({ watch, checking, error, onCheck }) {
  const result = watch.result;
  return <section className="grid min-w-0 gap-2" aria-label="Отслеживание цены">
    <p>Доставка · {countries.of(watch.country)}</p>
    {watch.notice && <PurchasePriceNotice notice={watch.notice} />}
    {result ? <div className="grid gap-1 text-muted-foreground" role="status">
      {(!watch.notice || result.status !== "within_budget") && <span>{checkMessages[result.status]}</span>}
      {result.quote && result.status === "above_budget" && <span className="wrap-anywhere">{formatPurchaseBudget({ minor: result.quote.totalMinor, currency: result.quote.currency })} с доставкой · {result.quote.store}</span>}
      {result.checkedAt !== watch.notice?.checkedAt && <PriceCheckTime at={result.checkedAt} />}
    </div> : <p className="text-muted-foreground" role="status">Ожидается первая проверка цены</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <Button type="button" variant="outline" className="min-h-12 justify-self-start rounded-full" disabled={checking} onClick={onCheck}>
      {checking ? "Проверяем цену…" : "Проверить цену"}
    </Button>
  </section>;
}
