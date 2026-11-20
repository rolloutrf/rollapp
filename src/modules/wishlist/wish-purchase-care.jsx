import { useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/form-surface";
import { cn } from "@/lib/utils";
import { PlanningDatePicker } from "@/modules/planning/planning-date-picker";
import { api } from "@/modules/runtime/api";
import { useAsync } from "@/modules/shell/use-async";
import { addCalendarDays, dateFromKey } from "../../../shared/modules/calendar/planning-calendar.js";
import { PURCHASE_CARE_LABELS, purchaseCareItem } from "../../../shared/modules/planning/purchase-care.js";
import { formatPurchaseBudget } from "../../../shared/modules/planning/purchase-plan.js";

const dateLabel = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" });
const dateText = (date) => dateLabel.format(dateFromKey(date));
const historyPath = (id) => `/dashboard/purchase-history/${encodeURIComponent(id)}`;
const receiptTypes = "application/pdf,image/jpeg,image/png,image/webp";

function ReceiptField({ purchaseId, receipt, file, onFile, onUpload, onRemove, busy }) {
  const id = useId();
  const input = useRef(null);
  const [confirm, setConfirm] = useState(false);

  function clearFile() {
    if (input.current) input.current.value = "";
    onFile(null);
  }

  return <FieldGroup>
    <h3 className="text-xl leading-7 font-semibold">Чек</h3>
    {receipt && <div className="grid min-w-0 gap-2">
      <p className="wrap-anywhere">{receipt.filename}</p>
      <div className="flex flex-wrap gap-2">
        <a href={`/api${historyPath(purchaseId)}/receipt`} download={receipt.filename}
          className={cn(buttonVariants({ variant: "outline" }), "min-h-12 rounded-full")}>Скачать чек</a>
        {!confirm && <Button variant="destructive" className="min-h-12 rounded-full" type="button" disabled={busy}
          onClick={() => setConfirm(true)}>Удалить чек</Button>}
      </div>
      {confirm && <div className="grid min-w-0 gap-2">
        <p>Удалить сохранённый файл?</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="destructive" type="button" className="min-h-12 rounded-full" disabled={busy}
            onClick={async () => { if (await onRemove()) setConfirm(false); }}>Удалить</Button>
          <Button variant="outline" type="button" className="min-h-12 rounded-full" disabled={busy} onClick={() => setConfirm(false)}>Отмена</Button>
        </div>
      </div>}
    </div>}
    <Field>
      <FieldLabel htmlFor={id}>{receipt ? "Выбрать новый файл" : "Выбрать файл чека"}</FieldLabel>
      <Input id={id} type="file" className="w-full min-w-0" accept={receiptTypes} ref={input} disabled={busy}
        onChange={(event) => onFile(event.target.files?.[0] ?? null)} />
      <FieldDescription>PDF, JPG, PNG или WebP до 5 МБ. Файл доступен только вам.</FieldDescription>
      {file && <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-12 rounded-full" disabled={busy} onClick={async () => { if (await onUpload()) clearFile(); }}>
          {receipt ? "Заменить чек" : "Загрузить чек"}
        </Button>
        <Button type="button" variant="outline" className="min-h-12 rounded-full" disabled={busy} onClick={clearFile}>Убрать выбранный файл</Button>
      </div>}
    </Field>
  </FieldGroup>;
}

function ReminderRows({ reminders, busy, toggle }) {
  if (!reminders.length) return null;
  return <section aria-label="Напоминания в To Do" className="grid min-w-0 gap-2 border-t pt-4">
    <h3 className="text-xl leading-7 font-semibold">Напоминания в To Do</h3>
    <ul className="grid min-w-0 gap-3">
      {reminders.map((task) => {
        const label = PURCHASE_CARE_LABELS[purchaseCareItem(task).type];
        const action = task.completed ? "Вернуть в To Do" : "Отметить выполненным";
        return <li key={task.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="grid min-w-0 gap-1">
            <span>{label}</span>
            <span className="text-xs text-muted-foreground">{dateText(task.dueOn)}{task.completed && " · Выполнено"}</span>
          </div>
          <Button type="button" variant="outline" className="min-h-12 rounded-full" aria-label={`${action}: ${label}`} disabled={busy}
            onClick={() => toggle(task)}>{action}</Button>
        </li>;
      })}
    </ul>
  </section>;
}

function PurchaseCareFields({ purchase, form, update, busy }) {
  const id = useId();
  function setWarranty(date) {
    const suggested = date ? addCalendarDays(date, -14) : "";
    const reminder = date && purchase.purchasedOn && suggested < purchase.purchasedOn ? purchase.purchasedOn : suggested;
    update({ warrantyOn: date, warrantyReminderOn: reminder });
  }
  return <FieldGroup className="border-t pt-4">
    <h3 className="text-xl leading-7 font-semibold">Гарантия и обслуживание</h3>
    <Field>
      <FieldLabel htmlFor={`${id}-warranty`}>Гарантия до</FieldLabel>
      <PlanningDatePicker id={`${id}-warranty`} label="Гарантия до" value={form.warrantyOn} clearable disabled={busy} onChange={setWarranty} />
    </Field>
    {form.warrantyOn && <Field>
      <FieldLabel htmlFor={`${id}-reminder`}>Напомнить о гарантии</FieldLabel>
      <PlanningDatePicker id={`${id}-reminder`} label="Напомнить о гарантии" value={form.warrantyReminderOn} clearable disabled={busy}
        onChange={(value) => update({ warrantyReminderOn: value })} />
    </Field>}
    <Field>
      <FieldLabel htmlFor={`${id}-maintenance`}>Следующее обслуживание</FieldLabel>
      <PlanningDatePicker id={`${id}-maintenance`} label="Следующее обслуживание" value={form.maintenanceOn} clearable disabled={busy}
        onChange={(value) => update({ maintenanceOn: value })} />
    </Field>
    <Field>
      <FieldLabel htmlFor={`${id}-note`}>Что нужно сделать</FieldLabel>
      <Textarea id={`${id}-note`} value={form.maintenanceNote} maxLength={500} disabled={busy} onChange={(event) => update({ maintenanceNote: event.target.value })} />
    </Field>
  </FieldGroup>;
}

function CareForm({ data, onData, purchaseId, onClose, onChanged, busy, setBusy }) {
  const { purchase, receipt, reminders } = data;
  const [form, setForm] = useState(purchase.care);
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const running = useRef(false);
  const careAvailable = purchase.purchaseType !== "subscription";
  const dirty = Object.keys(purchase.care).some((key) => purchase.care[key] !== form[key]);
  const next = (fields) => setForm((current) => ({ ...current, ...fields }));
  const path = `${historyPath(purchaseId)}/care`;

  async function run(operation, accept) {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      accept(await operation());
      return true;
    } catch (cause) {
      setError(cause.message || "Не удалось сохранить изменения");
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  function updateCard(next) {
    onData(next);
    onChanged?.(next.reminders);
  }

  function submit(event) {
    event.preventDefault();
    if (!careAvailable || !dirty || file || busy) return;
    run(() => api.post(path, { ...form, revision: purchase.revision }), (next) => {
      updateCard(next);
      onClose();
    });
  }

  function upload() {
    if (file.size > 5 * 1024 * 1024) { setError("Размер файла должен быть не больше 5 МБ."); return false; }
    return run(() => api.uploadPurchaseReceipt(purchaseId, file, receipt?.version), (next) => onData({ ...data, ...next }));
  }

  function remove() {
    return run(() => api.deletePurchaseReceipt(purchaseId, receipt.version), (next) => onData({ ...data, ...next }));
  }

  function toggle(task) {
    const { type } = purchaseCareItem(task);
    run(() => api.post(`${path}/reminder`, { type, dueOn: task.dueOn, completed: !task.completed, revision: task.revision }), updateCard);
  }

  return <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
    <div className="app-drawer-body flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4" aria-busy={busy}>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {busy && <p className="flex items-center gap-2" role="status"><Spinner />Сохраняем изменения…</p>}
      <ReceiptField purchaseId={purchaseId} receipt={receipt} file={file} onFile={(nextFile) => { setError(""); setFile(nextFile); }}
        onUpload={upload} onRemove={remove} busy={busy} />
      {careAvailable && <>
        <PurchaseCareFields purchase={purchase} form={form} update={next} busy={busy} />
        <ReminderRows reminders={reminders} busy={busy} toggle={toggle} />
      </>}
    </div>
    {careAvailable && <DrawerFooter>
      <Button type="submit" disabled={!dirty || busy || Boolean(file)} aria-busy={Boolean(busy) || undefined}>Сохранить</Button>
    </DrawerFooter>}
  </form>;
}

export function WishPurchaseCare({ purchaseId, onClose, onChanged }) {
  const { data, loading, error, reload, updateData } = useAsync(() => api.get(`${historyPath(purchaseId)}/care`), [purchaseId]);
  const [busy, setBusy] = useState(false);
  const purchase = data?.purchase;
  const date = purchase?.purchasedOn ? dateText(purchase.purchasedOn) : "Дата не сохранена";
  const amount = purchase?.amountMinor == null ? "Сумма не указана" : formatPurchaseBudget({ minor: purchase.amountMinor, currency: purchase.currency });
  return <Drawer open disablePointerDismissal={busy} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DrawerContent className="rollapp-body app-drawer--form">
      <DrawerHeader className="min-w-0 pr-16 text-left!">
        <DrawerTitle className="wrap-anywhere">{purchase?.title || "Покупка"}</DrawerTitle>
        <DrawerDescription>{purchase ? `${date} · ${amount}` : "Детали покупки"}</DrawerDescription>
      </DrawerHeader>
      <DrawerClose render={<Button variant="ghost" type="button" size="icon" className="absolute top-2 right-2 z-10" disabled={busy} />} aria-label="Закрыть"><X aria-hidden="true" /></DrawerClose>
      {loading || error ? <div className="app-drawer-body grid gap-3 overflow-y-auto p-4">
        {error ? <><Alert variant="destructive"><AlertDescription>{error.message}</AlertDescription></Alert>
          <Button type="button" variant="outline" className="min-h-12 justify-self-start rounded-full" onClick={() => reload().catch(() => {})}>Повторить</Button></>
          : <p className="flex items-center gap-2" role="status"><Spinner />Загружаем покупку…</p>}
      </div> : <CareForm data={data} onData={(next) => updateData(() => next)} purchaseId={purchaseId} onClose={onClose} onChanged={onChanged} busy={busy} setBusy={setBusy} />}
    </DrawerContent>
  </Drawer>;
}
