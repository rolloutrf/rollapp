import { useId, useRef, useState } from "react";
import { ChevronRight, ExternalLink, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/form-surface";
import { cn } from "@/lib/utils";
import { PlanningDatePicker } from "@/modules/planning/planning-date-picker";
import { api } from "@/modules/runtime/api";
import { useAsync } from "@/modules/shell/use-async";
import { formatPurchaseBudget, purchaseBudgetMinor } from "../../../shared/modules/planning/purchase-plan.js";
import { dateFromKey } from "../../../shared/modules/calendar/planning-calendar.js";

const pathFor = (id) => `/dashboard/purchase-collaborations/${encodeURIComponent(id)}`;
const dateFormat = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" });
const readableDate = (date) => dateFormat.format(dateFromKey(date));
const roles = [{ value: "household", label: "Участник общей покупки" }, { value: "seller", label: "Продавец" }];

export function WishPurchaseCollaborations({ records, onOpen }) {
  if (!records?.length) return null;
  return <section className="grid min-w-0 gap-2 border-t pt-3" aria-label="Общие покупки и запросы">
    <h3 className="text-2xl leading-8 font-semibold">Общие покупки и запросы</h3>
    <ul className="grid min-w-0 gap-1">
      {records.map((record) => <li key={record.id} className="min-w-0">
        <Button type="button" variant="ghost" aria-label={`Общая покупка: ${record.title}`} onClick={() => onOpen({ id: record.id })}
          className="h-auto min-h-12 w-full min-w-0 justify-between gap-2 rounded-xl px-2 py-2 text-left whitespace-normal font-normal">
          <span className="grid min-w-0 gap-1"><span className="wrap-anywhere">{record.title}</span>
            <span className="text-xs text-muted-foreground">{record.role === "owner" ? `Приглашено: ${record.recipients.length} · Предложений: ${record.recipients.filter(({ offer }) => offer).length}`
              : record.role === "seller" ? `Запрос продавцу от @${record.ownerUsername}` : `Общая покупка с @${record.ownerUsername}`}</span>
          </span><ChevronRight aria-hidden="true" />
        </Button>
      </li>)}
    </ul>
  </section>;
}

function PurchaseContext({ record }) {
  if (!record) return null;
  const money = (minor) => formatPurchaseBudget({ minor, currency: record.currency });
  const member = record.recipients?.find(({ id }) => id === record.assignedTo);
  const pledged = record.recipients?.reduce((sum, entry) => sum + (entry.pledgeMinor || 0), 0) || 0;
  return <div className="grid min-w-0 gap-2">
    {record.criteria && <p className="wrap-anywhere whitespace-pre-wrap">{record.criteria}</p>}
    {record.city && <p className="wrap-anywhere">Город доставки: {record.city}</p>}
    {record.neededBy && <p>Получить к {readableDate(record.neededBy)}</p>}
    {record.ownOffer && <Badge variant="secondary" className="justify-self-start">Предложение сохранено</Badge>}
    {record.budgetMinor !== undefined && <p>Бюджет {money(record.budgetMinor)}{pledged > 0 && ` · Участники готовы внести ${money(pledged)}`}</p>}
    {record.bought ? <Badge variant="secondary" className="justify-self-start">Участник сообщил о покупке</Badge>
      : member && <p className="wrap-anywhere">Покупку взял @{member.username}</p>}
  </div>;
}

function OwnerDetails({ record, busy, submit, onReview }) {
  if (!record?.recipients.length) return null;
  const offers = record.recipients.filter(({ offer }) => offer).sort((left, right) => {
    const rank = ({ offer }) => Number(offer.totalMinor > record.budgetMinor) + Number(Boolean(record.neededBy && offer.deliveryOn > record.neededBy));
    return rank(left) - rank(right) || left.offer.totalMinor - right.offer.totalMinor || left.offer.deliveryOn.localeCompare(right.offer.deliveryOn);
  });
  const money = (minor) => formatPurchaseBudget({ minor, currency: record.currency });
  return <div className="grid min-w-0 gap-4">
    {record.bought && onReview && <Button type="button" variant="outline" className="min-h-12 justify-self-start rounded-full" disabled={busy} onClick={onReview}>К пересмотру покупки</Button>}
    <ul className="grid min-w-0 gap-2" aria-label="Приглашённые участники">
      {record.recipients.map((recipient) => <li key={recipient.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
        <div className="grid min-w-0 gap-1"><span className="wrap-anywhere">@{recipient.username}</span>
          <span className="text-xs text-muted-foreground">{recipient.role === "seller" ? `Продавец · ${recipient.city}` : recipient.pledgeMinor ? `Готов внести ${money(recipient.pledgeMinor)}` : "Участник общей покупки"}</span>
        </div>
        <Button type="button" variant="destructive" size="icon" className="size-12 rounded-full" aria-label={`Отозвать приглашение для @${recipient.username}`}
          disabled={busy} onClick={() => submit({ action: "revoke", recipientId: recipient.id })}><X aria-hidden="true" /></Button>
      </li>)}
    </ul>
    {offers.length > 0 && <section className="grid min-w-0 gap-2" aria-label="Ответы продавцов">
      <h3 className="text-xl font-semibold">Ответы продавцов</h3>
      <p className="text-xs text-muted-foreground">Сумму и дату доставки указал продавец.</p>
      <ul className="grid min-w-0 gap-2">
        {offers.map(({ id, username, offer }) => <li key={id} className="grid min-w-0 gap-2 rounded-xl border p-3">
          <p className="wrap-anywhere font-semibold">{offer.product}</p>
          <p className="wrap-anywhere">{money(offer.totalMinor)} с доставкой · до {readableDate(offer.deliveryOn)}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{offer.totalMinor <= record.budgetMinor ? "В бюджете" : "Дороже бюджета"}</Badge>
            {record.neededBy && <Badge variant="secondary">{offer.deliveryOn <= record.neededBy ? "К нужной дате" : "Позже нужной даты"}</Badge>}
          </div>
          <a href={offer.url} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline" }), "min-h-12 justify-self-start rounded-full")}>
            Предложение @{username} <ExternalLink aria-hidden="true" />
          </a>
        </li>)}
      </ul>
    </section>}
  </div>;
}

function InviteFields({ busy, submit, children }) {
  const id = useId();
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("household");
  const [city, setCity] = useState("");
  async function send(event) {
    event.preventDefault();
    if (await submit({ action: "invite", username, role, city: role === "seller" ? city : "" })) setUsername("");
  }
  return <form className="flex min-h-0 flex-1 flex-col" onSubmit={send}>
    <div className="app-drawer-body flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      {children}
      <FieldGroup>
        <Field><FieldLabel htmlFor={`${id}-role`}>Кого пригласить</FieldLabel>
          <Select items={roles} value={role} onValueChange={(value) => { if (value) setRole(value); }} disabled={busy}>
            <SelectTrigger id={`${id}-role`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{roles.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field><FieldLabel htmlFor={`${id}-username`}>{role === "seller" ? "Имя бизнес-аккаунта" : "Имя пользователя"}</FieldLabel>
          <Input id={`${id}-username`} value={username} maxLength={81} autoComplete="off" required disabled={busy} onChange={(event) => setUsername(event.target.value)} />
          <FieldDescription>{role === "seller" ? "Продавец увидит требования, город и нужную дату." : "Участник увидит требования, бюджет и статус этой покупки."}</FieldDescription>
        </Field>
        {role === "seller" && <Field><FieldLabel htmlFor={`${id}-city`}>Город доставки</FieldLabel>
          <Input id={`${id}-city`} value={city} maxLength={100} required disabled={busy} onChange={(event) => setCity(event.target.value)} />
        </Field>}
      </FieldGroup>
    </div>
    <DrawerFooter><Button type="submit" disabled={busy || !username.trim() || (role === "seller" && !city.trim())}>Пригласить</Button></DrawerFooter>
  </form>;
}

function RecipientFields({ record, viewerId, busy, submit, children }) {
  const id = useId();
  const seller = record.role === "seller";
  const offer = record.ownOffer;
  const [product, setProduct] = useState(offer?.product || "");
  const [url, setUrl] = useState(offer?.url || "");
  const [date, setDate] = useState(offer?.deliveryOn || "");
  const initialMinor = seller ? offer?.totalMinor : record.recipients.find((entry) => entry.id === viewerId)?.pledgeMinor;
  const [amount, setAmount] = useState(initialMinor == null ? "" : String(initialMinor / 100).replace(".", ","));
  const minor = purchaseBudgetMinor(amount, { allowZero: !seller });
  const ready = minor !== null && (seller ? Boolean(product.trim() && url.trim() && date) : minor <= record.budgetMinor);
  const owned = record.assignedTo === viewerId;
  const send = (event) => {
    event.preventDefault();
    if (ready) submit(seller ? { action: "offer", product, url, deliveryOn: date, totalMinor: minor } : { action: "pledge", minor });
  };
  return <form className="flex min-h-0 flex-1 flex-col" onSubmit={send}>
    <div className="app-drawer-body flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      {children}
      {!seller && !record.bought && <div className="flex flex-wrap gap-2">
        {!record.assignedTo && <Button type="button" variant="outline" className="min-h-12 rounded-full" disabled={busy} onClick={() => submit({ action: "claim" })}>Взять покупку</Button>}
        {owned && <>
          <Button type="button" variant="outline" className="min-h-12 rounded-full" disabled={busy} onClick={() => submit({ action: "bought" })}>Сообщить, что куплено</Button>
          <Button type="button" variant="outline" className="min-h-12 rounded-full" disabled={busy} onClick={() => submit({ action: "release" })}>Освободить покупку</Button>
        </>}
      </div>}
      <FieldGroup>
        {seller && <>
          <Field><FieldLabel htmlFor={`${id}-product`}>Товар</FieldLabel><Input id={`${id}-product`} value={product} disabled={busy} required maxLength={160} onChange={(event) => setProduct(event.target.value)} /></Field>
          <Field><FieldLabel htmlFor={`${id}-url`}>Ссылка на товар</FieldLabel><Input id={`${id}-url`} type="url" value={url} disabled={busy} required maxLength={2048} onChange={(event) => setUrl(event.target.value)} /></Field>
          <Field><FieldLabel htmlFor={`${id}-date`}>Дата доставки</FieldLabel><PlanningDatePicker id={`${id}-date`} label="Дата доставки" value={date} disabled={busy} onChange={setDate} /></Field>
        </>}
        <Field><FieldLabel htmlFor={`${id}-amount`}>{seller ? "Итого с доставкой" : "Готов внести"}, {record.currency}</FieldLabel>
          <Input id={`${id}-amount`} value={amount} disabled={busy} inputMode="decimal" required maxLength={12} onChange={(event) => setAmount(event.target.value)} />
          {!seller && <FieldDescription>Это обещанная доля. Для её отмены укажите 0.</FieldDescription>}
        </Field>
      </FieldGroup>
      <Button type="button" variant="outline" className="min-h-12 self-start rounded-full" disabled={busy} onClick={() => submit({ action: "decline" })}>Отклонить приглашение</Button>
    </div>
    <DrawerFooter><Button type="submit" disabled={!ready || busy}>{seller ? "Сохранить предложение" : "Сохранить долю"}</Button></DrawerFooter>
  </form>;
}

export function WishPurchaseCollaboration({ entry, viewerId, onClose, onChanged, onReview }) {
  const path = pathFor(entry.id);
  const { data, error: loadError, loading, reload, updateData } = useAsync(() => api.get(path), [path]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const record = data?.collaboration;
  const owner = !record || record.role === "owner";
  async function submit(action) {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await api.post(path, action);
      updateData(() => next);
      onChanged(entry.id, next.collaboration);
      if (!next.collaboration) onClose();
      return true;
    } catch (cause) {
      setError(cause.message || "Не удалось сохранить изменения");
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const context = <>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {busy && <p className="flex items-center gap-2" role="status"><Spinner />Сохраняем…</p>}<PurchaseContext record={record || entry} /></>;
  return <Drawer open disablePointerDismissal={busy} onOpenChange={(open) => { if (!open && !pending.current) onClose(); }}>
    <DrawerContent className="rollapp-body app-drawer--form">
      <DrawerHeader className="min-w-0 pr-16 text-left!">
        <DrawerTitle className="wrap-anywhere">{record?.title || entry.title || "Общая покупка"}</DrawerTitle>
        <DrawerDescription>{record?.role === "seller" ? "Ответ на запрос покупателя" : "Общая покупка и предложения продавцов"}</DrawerDescription>
      </DrawerHeader>
      <DrawerClose render={<Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 z-10" disabled={busy} />} aria-label="Закрыть"><X aria-hidden="true" /></DrawerClose>
      {loading || loadError ? <div className="app-drawer-body grid min-w-0 gap-2 overflow-y-auto p-4">
        {loadError ? <><Alert variant="destructive"><AlertDescription>{loadError.message}</AlertDescription></Alert><Button type="button" variant="outline" className="min-h-12 justify-self-start rounded-full" onClick={() => reload().catch(() => {})}>Повторить</Button></>
          : <p className="flex items-center gap-2" role="status"><Spinner />Загружаем покупку…</p>}
      </div> : owner ? <InviteFields busy={busy} submit={submit}>{context}<OwnerDetails record={record} busy={busy} submit={submit} onReview={onReview} /></InviteFields>
        : <RecipientFields record={record} viewerId={viewerId} busy={busy} submit={submit}>{context}</RecipientFields>}
    </DrawerContent>
  </Drawer>;
}
