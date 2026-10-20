import { useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { ControlBar } from "@/components/control-bar";
import { Button } from "@/components/ui/button";
import { PageActionButton } from "@/components/page-action-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { PlanningDatePicker } from "@/components/planning-date-picker";
import { addCalendarDays, dateFromKey, sortCalendarTasks } from "../../shared/planning-calendar.js";
import { isPlanningDate, localDateKey } from "../../shared/planning.js";
import { expandRecurringTasks } from "../../shared/planning-recurrence.js";
import "./planning-daily-todo.css";

const dateLabel = (key) => {
  const label = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(dateFromKey(key));
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const weekdayLabel = new Intl.DateTimeFormat("ru-RU", { weekday: "short" });
const compactDateLabel = (key) => {
  const date = dateFromKey(key);
  const weekday = weekdayLabel.format(date);
  return `${new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(date)}, ${weekday.charAt(0).toUpperCase() + weekday.slice(1)}`;
};

function DayRibbon({ selected, today, onChange }) {
  const ribbon = useRef(null);
  const focusSelection = useRef(false);
  const dates = Array.from({ length: 63 }, (_, index) => addCalendarDays(selected, index - 31));

  useLayoutEffect(() => {
    const element = ribbon.current;
    const active = element.querySelector('[aria-pressed="true"]');
    const center = () => {
      element.scrollLeft += active.getBoundingClientRect().left - element.getBoundingClientRect().left - (element.clientWidth - active.offsetWidth) / 2;
    };
    center();
    if (focusSelection.current) {
      active.focus({ preventScroll: true });
      focusSelection.current = false;
    }
    const observer = new ResizeObserver(center);
    observer.observe(element);
    return () => observer.disconnect();
  }, [selected]);

  const navigate = (event) => {
    const offset = { ArrowLeft: -1, ArrowRight: 1, PageUp: -7, PageDown: 7 }[event.key];
    if (offset === undefined && event.key !== "Home") return;
    event.preventDefault();
    focusSelection.current = true;
    onChange(event.key === "Home" ? today : addCalendarDays(selected, offset));
  };

  return <header className="daily-todo__header">
    <h2 className="sr-only" aria-live="polite">{dateLabel(selected)}</h2>
    <ControlBar ref={ribbon} className="daily-todo__ribbon" role="group" aria-label="Выбрать день. Стрелки — соседний день, Home — сегодня." onKeyDown={navigate}>
      {dates.map((date) => <Button key={date} variant={date === selected ? "default" : "outline"} size="icon" className="daily-todo__day rounded-full" aria-label={dateLabel(date)} aria-pressed={date === selected} aria-current={date === today ? "date" : undefined} tabIndex={date === selected ? 0 : -1} onClick={() => onChange(date)}>
        <span className="daily-todo__weekday" aria-hidden="true">{weekdayLabel.format(dateFromKey(date))}</span>
        <span className="text-rollapp-body font-semibold tabular-nums" aria-hidden="true">{dateFromKey(date).getDate()}</span>
      </Button>)}
    </ControlBar>
  </header>;
}

function TodoRow({ task, onSave, onEdit }) {
  const [busy, setBusy] = useState(false);
  const toggle = async (checked) => {
    if (busy) return;
    setBusy(true);
    try { await onSave(task.sourceId || task.id, { completed: checked === true, ...(task.occurrenceDate ? { occurrenceDate: task.occurrenceDate } : {}) }, { quiet: true }); }
    catch (cause) { toast.error(cause.message || "Не удалось обновить задачу"); }
    finally { setBusy(false); }
  };
  return <li className="daily-todo__item" data-completed={task.completed || undefined}>
    <Checkbox aria-label={`Выполнено: ${task.title}`} checked={task.completed} disabled={busy} onCheckedChange={toggle} />
    <Button variant="ghost" className="daily-todo__task font-normal" aria-label={`Редактировать задачу: ${task.title}`} onClick={() => onEdit(task)} disabled={busy}>
      <span className="daily-todo__task-title">{task.title}</span>
      {task.startTime && <span className="daily-todo__time">{task.startTime}</span>}
    </Button>
  </li>;
}

export function PlanningDailyTodo({ tasks, columns, onSave, onEdit, onCreate }) {
  const mobile = useIsMobile();
  const [search, setSearch] = useSearchParams();
  const today = localDateKey(new Date());
  const selected = isPlanningDate(search.get("date")) ? search.get("date") : today;
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const setDate = (date) => {
    if (!isPlanningDate(date)) return;
    if (date !== selected) { setTitle(""); setError(""); }
    setSearch((current) => {
      const next = new URLSearchParams(current);
      if (date === today) next.delete("date"); else next.set("date", date);
      return next;
    });
  };
  const add = async (event) => {
    event.preventDefault();
    if (busy || !title.trim()) return;
    setBusy(true); setError("");
    try {
      await onSave(null, { title: title.trim(), description: "", columnId: columns.find((column) => !column.complete)?.id || columns[0]?.id, completed: false, dueOn: selected, startTime: "", durationMinutes: 60 }, { quiet: true });
      setTitle("");
    } catch (cause) { setError(cause.message || "Не удалось добавить задачу"); }
    finally { setBusy(false); }
  };
  const dayTasks = sortCalendarTasks(expandRecurringTasks(tasks, selected, selected));
  const active = dayTasks.filter((task) => !task.completed);
  const done = dayTasks.filter((task) => task.completed);
  const openCalendar = () => setSearch((current) => {
    const next = new URLSearchParams(current);
    next.set("tab", "calendar");
    next.set("spaceKind", "todo");
    next.set("date", selected);
    next.set("view", "day");
    return next;
  });
  const controls = <footer className="daily-todo__footer">
      <div className="daily-todo__content">
        {mobile ? <ControlBar className="daily-todo__toolbar" role="group" aria-label="День и добавление задачи">
          <Button data-control-icon type="button" variant="outline" size="icon" className="rounded-full" aria-label="Предыдущий день" onClick={() => setDate(addCalendarDays(selected, -1))}><ChevronLeft aria-hidden="true" /></Button>
          <PlanningDatePicker value={selected} onChange={setDate} label="Выбрать дату" className="w-full"><span className="truncate">{compactDateLabel(selected)}</span></PlanningDatePicker>
          <Button data-control-icon type="button" variant="outline" size="icon" className="rounded-full" aria-label="Следующий день" onClick={() => setDate(addCalendarDays(selected, 1))}><ChevronRight aria-hidden="true" /></Button>
          <Button data-control-icon type="button" variant="outline" size="icon" className="rounded-full" aria-label="Добавить задачу" onClick={() => onCreate(selected)}><Plus aria-hidden="true" /></Button>
        </ControlBar> : <>
        {error && <p className="daily-todo__error" role="alert">{error}</p>}
        <form className="daily-todo__composer" onSubmit={add}>
          <Textarea className="field-sizing-fixed resize-none" rows={2} value={title} onChange={(event) => { setTitle(event.target.value); if (error) setError(""); }} maxLength={200} placeholder="Новая задача на этот день" aria-label="Новая задача на этот день" disabled={busy} />
          <PageActionButton className="w-full" type="submit" aria-label="Добавить задачу" disabled={busy || !title.trim()}>Добавить</PageActionButton>
        </form>
        </>}
      </div>
    </footer>;
  return <div className="daily-todo">
    {mobile && controls}
    <div className="daily-todo__scroll">
      {!mobile && <DayRibbon selected={selected} today={today} onChange={setDate} />}
      <div className="daily-todo__content">
        <div className="daily-todo__overview">
          <div className="daily-todo__overview-copy">
            <span className="daily-todo__eyebrow">План на день</span>
            <h2 className="daily-todo__date">{dateLabel(selected)}</h2>
            <p className="daily-todo__progress" aria-live="polite">{dayTasks.length ? `${done.length} из ${dayTasks.length} выполнено` : "Задач пока нет"}</p>
          </div>
          <Button variant="outline" className="daily-todo__calendar rounded-full" onClick={openCalendar} aria-label={`Открыть ${dateLabel(selected)} в календаре`}><CalendarDays aria-hidden="true" /><span>Календарь</span></Button>
        </div>
      </div>
      {dayTasks.length > 0 && <div className="daily-todo__content">
      {active.length > 0 && <section className="daily-todo__group" aria-label="Нужно сделать">
        <h3 className="daily-todo__group-title">Нужно сделать <span>{active.length}</span></h3>
        <ul className="daily-todo__list">{active.map((task) => <TodoRow key={task.id} task={task} onSave={onSave} onEdit={onEdit} />)}</ul>
      </section>}

      {done.length > 0 && <section className="daily-todo__group" aria-label="Выполнено">
        <h3 className="daily-todo__group-title">Выполнено <span>{done.length}</span></h3>
        <ul className="daily-todo__list">{done.map((task) => <TodoRow key={task.id} task={task} onSave={onSave} onEdit={onEdit} />)}</ul>
      </section>}
      </div>}
      {!dayTasks.length && <div className="daily-todo__content"><div className="daily-todo__empty"><CalendarDays aria-hidden="true" /><p>Свободный день. Добавьте задачу, и она появится здесь и в календаре.</p></div></div>}
    </div>
    {!mobile && controls}
  </div>;
}
