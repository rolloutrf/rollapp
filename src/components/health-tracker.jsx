import { NutritionTodo } from "@/components/nutrition-todo";
import { Checkbox } from "@/components/ui/checkbox";
import { useSearchParams } from "react-router-dom";
import { useEffect, useId, useRef, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { api } from "@/api";
import { PlanningDatePicker } from "@/components/planning-date-picker";
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/form-surface";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useSphereSharing } from "@/lib/sphere-sharing";
import { isPlanningDate, localDateKey } from "../../shared/planning.js";
import { durationLabel, MEAL_TYPES, sleepMinutes, sleepHistoryDays, SLEEP_QUALITY, trackerSchemas } from "../../shared/health-trackers.js";

const formatDate = value => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "long" }).format(new Date(`${value}T12:00:00`));
const emptyEntry = (tracker, date) => tracker === "sleep"
  ? { date, bedtime: "23:00", wakeTime: "07:00", quality: 3, notes: "" }
  : { completed: false, date, time: "12:00", mealType: "lunch", title: "", calories: "", protein: "", fat: "", carbs: "", notes: "" };

function useToday() {
  const [today, setToday] = useState(() => localDateKey(new Date()));
  useEffect(() => {
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      const now = new Date();
      setToday(localDateKey(now));
      const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(refresh, nextDay.getTime() - now.getTime() + 50);
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearTimeout(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  return today;
}

function SleepHistory({ entries, today, canEdit, onEdit, onDelete }) {
  return <ul className="not-typeset grid min-w-0 list-none gap-4 p-0" aria-label="История сна">
    {sleepHistoryDays(entries, today).map(day => <li key={day.date} className="min-w-0" data-sleep-day={day.date}>
      <Card className="relative min-w-0">
        {canEdit && <Button type="button" variant="ghost" className="absolute inset-0 z-10 h-full w-full rounded-xl bg-transparent p-0 text-left hover:bg-transparent active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" aria-label={`${day.entries.length ? "Открыть запись сна" : "Записать сон"}: ${day.date}`} onClick={() => onEdit(day.entries[0] || null, day.date)} />}
        <CardHeader><CardTitle className="text-rollapp-body leading-7">{day.date === today ? "Сегодня · " : ""}{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", weekday: "long" }).format(new Date(`${day.date}T12:00:00`))}</CardTitle></CardHeader>
        <CardContent className="rollapp-body flex min-w-0 flex-col gap-3">
          {!day.entries.length ? <><strong>Как вы спали?</strong><span className="text-muted-foreground">{canEdit ? "Нажмите, чтобы записать сон" : "Сон пока не записан"}</span></> : <>
            <strong>{durationLabel(day.entries.reduce((sum, entry) => sum + sleepMinutes(entry.bedtime, entry.wakeTime), 0))}</strong>
            {day.entries.map(entry => <div key={entry.id} className="flex min-w-0 flex-col gap-3">
              <p>{entry.bedtime} — {entry.wakeTime} · {SLEEP_QUALITY[entry.quality]}</p>
              {entry.notes && <p className="whitespace-pre-wrap wrap-anywhere">{entry.notes}</p>}
              {canEdit && <div className="relative z-20 flex flex-wrap gap-2 self-start"><Button variant="outline" onClick={() => onEdit(entry, day.date)} aria-label={`Редактировать: ${entry.bedtime}`}><Pencil aria-hidden="true" />Редактировать</Button><Button variant="destructive" onClick={() => onDelete(entry)} aria-label={`Удалить: ${entry.bedtime}`}><Trash2 aria-hidden="true" />Удалить</Button></div>}
            </div>)}
          </>}
        </CardContent>
      </Card>
    </li>)}
  </ul>;
}

function EntryForm({ tracker, entry, date, onClose, onSave, canEdit }) {
  const id = useId();
  const sleep = tracker === "sleep";
  const [draft, setDraft] = useState(() => entry ? Object.fromEntries(Object.keys(emptyEntry(tracker, date)).map(key => [key, entry[key] ?? (key === "completed" ? true : "")])) : emptyEntry(tracker, date));
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState("");
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  async function submit(event) {
    event.preventDefault();
    if (saving.current || !canEdit) return;
    const result = trackerSchemas[tracker].safeParse(draft);
    if (!result.success) { setError(sleep && draft.bedtime === draft.wakeTime ? "Время засыпания и пробуждения должно отличаться" : "Проверьте дату, время и заполнение полей. Числа должны быть от 0 до 20 000."); return; }
    saving.current = true; setBusy(true); setError("");
    try { await onSave(result.data, entry?.id); onClose(); }
    catch (cause) { setError(cause.message); }
    finally { saving.current = false; setBusy(false); }
  }
  const input = (key, label, props = {}) => <Field key={key}><FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel><Input id={`${id}-${key}`} value={draft[key]} onChange={event => update(key, event.target.value)} {...props} /></Field>;
  const select = (key, label, options) => <Field><FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel><Select value={String(draft[key])} onValueChange={value => update(key, value)}><SelectTrigger id={`${id}-${key}`} className="w-full"><SelectValue>{options[draft[key]]}</SelectValue></SelectTrigger><SelectContent className="not-typeset rollapp-body" alignItemWithTrigger={false}>{Object.entries(options).map(([value, text]) => <SelectItem key={value} value={value}>{text}</SelectItem>)}</SelectContent></Select></Field>;
  return <Drawer open onOpenChange={open => { if (!open && !saving.current) onClose(); }}>
    <DrawerContent className="rollapp-body app-drawer--form">
      <DrawerClose render={<Button className="absolute top-2 right-2 z-10" variant="ghost" size="icon" disabled={busy} />} aria-label="Закрыть запись"><X /></DrawerClose>
      <form className="flex min-h-0 min-w-0 flex-1 flex-col" onSubmit={submit}>
        <DrawerHeader className="pr-16"><DrawerTitle>{entry?.id ? "Редактировать запись" : sleep ? "Записать сон" : "Добавить приём пищи"}</DrawerTitle><DrawerDescription>{sleep ? "Дата относится к дню пробуждения. Время засыпания позже подъёма означает сон через полночь." : "Запланируйте приём пищи или отметьте, что уже съели. Калории и БЖУ необязательны."}</DrawerDescription></DrawerHeader>
        <fieldset disabled={busy || !canEdit} className="app-drawer-body flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {error && <Alert variant="destructive"><AlertTitle>Не удалось сохранить</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          {sleep ? <p className="text-muted-foreground">{formatDate(draft.date)}</p> : <Field><FieldLabel htmlFor={`${id}-date`}>Дата</FieldLabel><PlanningDatePicker id={`${id}-date`} value={draft.date} onChange={value => update("date", value)} label="Дата приёма пищи" className="w-full justify-between" /></Field>}
          {sleep ? <>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">{input("bedtime", "Заснули", { type: "time", required: true })}{input("wakeTime", "Проснулись", { type: "time", required: true })}</div>
            <p className="text-muted-foreground" role="status">Длительность: {durationLabel(sleepMinutes(draft.bedtime, draft.wakeTime) || 0)}</p>
            {select("quality", "Качество сна", SLEEP_QUALITY)}
          </> : <>
            <Field orientation="horizontal"><Checkbox id={`${id}-completed`} checked={draft.completed} onCheckedChange={checked => update("completed", checked === true)} /><FieldLabel htmlFor={`${id}-completed`}>Приём пищи состоялся</FieldLabel></Field>
            {select("mealType", "Приём пищи", MEAL_TYPES)}
            {input("title", "Блюдо или продукты", { required: true, maxLength: 200, placeholder: "Например, омлет и овощи" })}
            {input("time", "Время", { type: "time", required: true })}
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">{[["calories", "Калории, ккал"], ["protein", "Белки, г"], ["fat", "Жиры, г"], ["carbs", "Углеводы, г"]].map(([key, label]) => input(key, label, { type: "number", min: 0, max: 20000, step: "any", inputMode: "decimal", placeholder: "Не указано" }))}</div>
          </>}
          <Field><FieldLabel htmlFor={`${id}-notes`}>Заметки</FieldLabel><Textarea id={`${id}-notes`} rows={3} maxLength={4000} value={draft.notes} onChange={event => update("notes", event.target.value)} /></Field>
        </fieldset>
        <DrawerFooter><Button type="submit" disabled={busy || !canEdit}>{busy && <Spinner />}{busy ? "Сохраняем" : "Сохранить"}</Button><DrawerClose render={<Button type="button" variant="outline" disabled={busy} />}>Отмена</DrawerClose></DrawerFooter>
      </form>
    </DrawerContent>
  </Drawer>;
}

// UI smoke fixtures supply unsaved presentation props and callbacks; live use always calls the production API.
export function HealthTracker({ tracker, initialEntries, onSaveEntry, onDeleteEntry }) {
  const access = useSphereSharing();
  const canEdit = !access.readOnly && !access.loading && !access.error;
  const sleep = tracker === "sleep";
  const title = sleep ? "Сон" : "Питание";
  const today = useToday();
  const [search, setSearch] = useSearchParams();
  const date = isPlanningDate(search.get("date")) ? search.get("date") : today;
  const setDate = nextDate => setSearch(current => {
    const next = new URLSearchParams(current);
    if (nextDate === today) next.delete("date"); else next.set("date", nextDate);
    return next;
  });
  const [entries, setEntries] = useState(initialEntries || []);
  const [loading, setLoading] = useState(initialEntries === undefined);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [editor, setEditor] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const deleteLock = useRef(false);
  const [deleteError, setDeleteError] = useState("");
  const lifecycle = useRef(0);
  useEffect(() => { lifecycle.current += 1; return () => { lifecycle.current += 1; }; }, [tracker, access.owner?.id]);
  useEffect(() => {
    if (initialEntries !== undefined) return;
    let active = true;
    setLoading(true); setError(""); setEntries([]);
    api.get(`/health/trackers/${tracker}`).then(data => { if (active) setEntries(data.entries); }).catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tracker, version, initialEntries, access.owner?.id]);
  useEffect(() => { if (!canEdit) { setEditor(null); setDeleting(null); } }, [canEdit]);
  async function save(data, id) {
    if (!canEdit) throw new Error("Редактирование недоступно");
    const owner = lifecycle.current;
    const result = onSaveEntry ? await onSaveEntry(data, id) : id ? await api.patch(`/health/trackers/${tracker}/${encodeURIComponent(id)}`, data) : await api.post(`/health/trackers/${tracker}`, data);
    if (owner !== lifecycle.current) return;
    const saved = result.entry;
    setEntries(current => [saved, ...current.filter(entry => entry.id !== saved.id)]);
  }
  async function remove(event) {
    event.preventDefault();
    if (deleteLock.current || !canEdit) return;
    deleteLock.current = true; setDeleteBusy(true); setDeleteError("");
    const owner = lifecycle.current;
    try {
      if (onDeleteEntry) await onDeleteEntry(deleting.id); else await api.delete(`/health/trackers/${tracker}/${encodeURIComponent(deleting.id)}`);
      if (owner === lifecycle.current) { setEntries(current => current.filter(entry => entry.id !== deleting.id)); setDeleting(null); }
    } catch (cause) { setDeleteError(cause.message); }
    finally { deleteLock.current = false; setDeleteBusy(false); }
  }
  return <article className="health-tracker rollapp-body text-pretty page-stack mx-auto w-full max-w-(--layout-collection-width)" aria-label={`Трекер: ${title}`}>
    {sleep ? <section className="typeset typeset-rollapp" data-typeset-group><h1>Сон</h1><p>Ваш сон — день за днём.</p></section> : <h1 className="sr-only">Питание</h1>}
    {loading ? <p role="status" className="not-typeset flex items-center gap-2"><Spinner />Загружаем записи…</p> : error ? <Alert className="not-typeset" variant="destructive"><AlertTitle>Не удалось загрузить трекер</AlertTitle><AlertDescription>{error}<Button variant="outline" onClick={() => setVersion(value => value + 1)}>Повторить</Button></AlertDescription></Alert> : sleep ? <SleepHistory entries={entries} today={today} canEdit={canEdit} onEdit={(entry, entryDate) => setEditor({ entry, date: entryDate })} onDelete={entry => { setDeleting(entry); setDeleteError(""); }} /> : <NutritionTodo entries={entries} selected={date} today={today} onDateChange={setDate} canEdit={canEdit} onCreate={(selectedDate, draft = null) => setEditor({ entry: draft, date: selectedDate })} onEdit={entry => setEditor({ entry, date: entry.date })} onSave={save} onDelete={entry => { setDeleting(entry); setDeleteError(""); }} />}
    {editor && canEdit && <EntryForm tracker={tracker} entry={editor.entry} date={editor.date || date} onClose={() => setEditor(null)} onSave={save} canEdit={canEdit} />}
    <AlertDialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !deleteLock.current) setDeleting(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить запись?</AlertDialogTitle><AlertDialogDescription>Запись будет удалена из трекера без возможности восстановления.</AlertDialogDescription></AlertDialogHeader>{deleteError && <Alert variant="destructive"><AlertDescription>{deleteError}</AlertDescription></Alert>}<AlertDialogFooter><AlertDialogCancel disabled={deleteBusy}>Отмена</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={deleteBusy} onClick={remove}>{deleteBusy ? "Удаляем" : "Удалить"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </article>;
}
