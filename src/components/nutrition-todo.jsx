import { useRef, useState } from "react";
import { ArrowUp, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { ControlBar } from "@/components/control-bar";
import { PlanningDayRibbon } from "@/components/planning-day-ribbon";
import { PlanningDatePicker } from "@/components/planning-date-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { addCalendarDays, dateFromKey } from "../../shared/planning-calendar.js";
import { MEAL_TYPES } from "../../shared/health-trackers.js";
import "./planning-daily-todo.css";

const number = value => value == null ? "—" : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
const completed = entry => entry.completed !== false;
const compactDate = date => new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", weekday: "short" }).format(dateFromKey(date));
export const nutritionEntryPayload = entry => ({ date: entry.date, time: entry.time, mealType: entry.mealType, title: entry.title, completed: completed(entry), calories: entry.calories ?? null, protein: entry.protein ?? null, fat: entry.fat ?? null, carbs: entry.carbs ?? null, notes: entry.notes || "" });

function MealRow({ entry, canEdit, onSave, onEdit, onDelete }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function toggle(checked) {
    if (lock.current || !canEdit) return;
    lock.current = true; setBusy(true); setError("");
    try { await onSave({ ...nutritionEntryPayload(entry), completed: checked === true }, entry.id); }
    catch (cause) { setError(cause.message || "Не удалось изменить отметку"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <li className="flex min-w-0 flex-col gap-2" data-meal-id={entry.id}>
    <div className="daily-todo__item" data-completed={completed(entry) || undefined}>
      <Checkbox checked={completed(entry)} disabled={busy || !canEdit} onCheckedChange={toggle} aria-label={`Съедено: ${entry.title}`} />
      <Button variant="ghost" className="daily-todo__task font-normal" disabled={busy || !canEdit} onClick={() => onEdit(entry)} aria-label={`Редактировать приём пищи: ${entry.title}`}>
        <span className="daily-todo__task-content"><span className="daily-todo__task-title">{entry.title}</span><span className="nutrition-todo__meta text-muted-foreground">{MEAL_TYPES[entry.mealType]} · {number(entry.calories)} ккал</span></span><span className="daily-todo__time">{entry.time}</span>
      </Button>
      {canEdit && <Button variant="destructive" size="icon" disabled={busy} aria-label={`Удалить: ${entry.title}`} onClick={() => onDelete(entry)}><Trash2 aria-hidden="true" /></Button>}
    </div>
    {entry.notes && <p className="text-muted-foreground whitespace-pre-wrap wrap-anywhere">{entry.notes}</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </li>;
}

export function NutritionTodo({ entries, selected, today, onDateChange, canEdit, onCreate, onEdit, onSave, onDelete }) {
  const mobile = useIsMobile();
  const [draft, setDraft] = useState({ date: selected, title: "" });
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState(null);
  const title = draft.date === selected ? draft.title : "";
  const dayEntries = entries.filter(entry => entry.date === selected).sort((a, b) => a.time.localeCompare(b.time));
  const done = dayEntries.filter(completed);
  const planned = dayEntries.filter(entry => !completed(entry));
  async function add(event) {
    event.preventDefault();
    if (!title.trim() || lock.current || !canEdit) return;
    const owner = selected;
    lock.current = true; setBusy(true); setError(null);
    try {
      await onSave({ date: owner, title: title.trim(), time: "12:00", mealType: "lunch", completed: false, calories: null, protein: null, fat: null, carbs: null, notes: "" });
      setDraft(current => current.date === owner ? { date: owner, title: "" } : current);
    } catch (cause) { setError({ date: owner, message: cause.message || "Не удалось добавить приём пищи" }); }
    finally { lock.current = false; setBusy(false); }
  }
  const create = () => onCreate(selected, title.trim() ? { date: selected, title: title.trim(), time: "12:00", mealType: "lunch", completed: false, notes: "" } : null);
  const rows = items => <ul className="daily-todo__list">{items.map(entry => <MealRow key={entry.id} entry={entry} canEdit={canEdit} onSave={onSave} onEdit={onEdit} onDelete={onDelete} />)}</ul>;
  return <div className="nutrition-todo not-typeset page-stack">
    {mobile ? <ControlBar className={`daily-todo__toolbar${canEdit ? "" : " nutrition-todo__toolbar--readonly"}`} aria-label="День и добавление приёма пищи">
      <Button data-control-icon variant="outline" size="icon" aria-label="Предыдущий день" onClick={() => onDateChange(addCalendarDays(selected, -1))}><ChevronLeft /></Button>
      <PlanningDatePicker value={selected} onChange={onDateChange} label="День питания" className="min-w-0 w-full"><span className="truncate">{compactDate(selected)}</span></PlanningDatePicker>
      <Button data-control-icon variant="outline" size="icon" aria-label="Следующий день" onClick={() => onDateChange(addCalendarDays(selected, 1))}><ChevronRight /></Button>
      {canEdit && <Button data-control-icon variant="outline" size="icon" aria-label="Добавить приём пищи" onClick={create}><Plus /></Button>}
    </ControlBar> : <PlanningDayRibbon selected={selected} today={today} onChange={onDateChange} />}
    <div className="nutrition-todo__body page-stack">
      {planned.length > 0 && <section aria-label="Запланировано" className="page-stack">{rows(planned)}</section>}
      {done.length > 0 && <section aria-label="Съедено" className="page-stack">{rows(done)}</section>}
      {dayEntries.length === 0 && <p className="py-8 text-center text-muted-foreground">Нет записей о питании</p>}
      {!mobile && canEdit && <form className="daily-todo__composer" onSubmit={add}>
        {error?.date === selected && <p role="alert" className="text-destructive">{error.message}</p>}
        <InputGroup className="daily-todo__composer-input">
          <InputGroupTextarea value={title} onChange={event => { setDraft({ date: selected, title: event.target.value }); setError(null); }} rows={1} maxLength={200} disabled={busy} placeholder="Новый приём пищи на этот день" aria-label="Новый приём пищи на этот день" onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }} />
          <InputGroupAddon align="block-end" className="daily-todo__composer-addon"><ControlBar className="daily-todo__composer-actions"><Button data-control-icon type="button" variant="outline" size="icon" aria-label="Добавить приём пищи" disabled={busy} onClick={create}><Plus /></Button><Button data-control-icon type="submit" size="icon" aria-label="Добавить в список питания" disabled={busy || !title.trim()}><ArrowUp /></Button></ControlBar></InputGroupAddon>
        </InputGroup>
      </form>}
    </div>
  </div>;
}
