import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PlanningDatePicker } from "@/components/planning-date-picker";
import { addCalendarDays, dateFromKey, sortCalendarTasks } from "../../shared/planning-calendar.js";
import { isPlanningDate, localDateKey } from "../../shared/planning.js";
import "./planning-daily-todo.css";

const dateLabel = (key) => {
  const label = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(dateFromKey(key));
  return label.charAt(0).toUpperCase() + label.slice(1);
};

function TodoRow({ task, onEdit, onSave }) {
  const [busy, setBusy] = useState(false);
  const toggle = async (checked) => {
    if (busy) return;
    setBusy(true);
    try { await onSave(task.id, { completed: checked === true }, { quiet: true }); }
    catch (cause) { toast.error(cause.message || "Не удалось обновить задачу"); }
    finally { setBusy(false); }
  };
  return <li className="daily-todo__item" data-completed={task.completed || undefined}>
    <Checkbox aria-label={`Выполнено: ${task.title}`} checked={task.completed} disabled={busy} onCheckedChange={toggle} />
    <Button variant="ghost" className="daily-todo__task" onClick={() => onEdit(task)}>
      <span className="daily-todo__task-title">{task.title}</span>
      {task.startTime && <span className="daily-todo__time">{task.startTime}</span>}
    </Button>
  </li>;
}

export function PlanningDailyTodo({ tasks, columns, onCreate, onEdit, onSave }) {
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
  const dayTasks = sortCalendarTasks(tasks.filter((task) => !task.archived && task.dueOn === selected));
  const active = dayTasks.filter((task) => !task.completed);
  const done = dayTasks.filter((task) => task.completed);
  return <div className="daily-todo">
    <div className="daily-todo__content">
      <header className="daily-todo__header">
        <div className="daily-todo__heading">
          <span className="daily-todo__eyebrow">TO DO НА КАЖДЫЙ ДЕНЬ</span>
          <h2 className="text-3xl font-semibold tracking-tight">{dateLabel(selected)}</h2>
          <p>Задачи на выбранную дату из этой доски.</p>
        </div>
        <div className="daily-todo__navigation" aria-label="Выбрать день">
          <Button variant="outline" size="icon" className="rounded-full" aria-label="Предыдущий день" onClick={() => setDate(addCalendarDays(selected, -1))}><ChevronLeft /></Button>
          <Button variant="outline" className="rounded-full" onClick={() => setDate(today)}>Сегодня</Button>
          <Button variant="outline" size="icon" className="rounded-full" aria-label="Следующий день" onClick={() => setDate(addCalendarDays(selected, 1))}><ChevronRight /></Button>
          <PlanningDatePicker className="daily-todo__date" value={selected} onChange={setDate} />
        </div>
      </header>

      <form className="daily-todo__composer" onSubmit={add}>
        <Input value={title} onChange={(event) => { setTitle(event.target.value); if (error) setError(""); }} maxLength={200} placeholder="Новая задача на этот день" aria-label="Новая задача на этот день" disabled={busy} />
        <Button type="submit" disabled={busy || !title.trim()}><Plus aria-hidden="true" /><span>Добавить</span></Button>
      </form>
      {error && <p className="daily-todo__error" role="alert">{error}</p>}

      <section className="daily-todo__group" aria-label="Нужно сделать">
        <div className="daily-todo__group-heading"><h3 className="text-2xl font-semibold tracking-tight">Нужно сделать</h3><span>{active.length}</span></div>
        {active.length ? <ul className="daily-todo__list">{active.map((task) => <TodoRow key={task.id} task={task} onEdit={onEdit} onSave={onSave} />)}</ul> : <div className="daily-todo__empty">{done.length ? "На этот день всё сделано." : "На этот день пока нет задач."}</div>}
      </section>

      {done.length > 0 && <section className="daily-todo__group" aria-label="Выполнено">
        <div className="daily-todo__group-heading"><h3 className="text-2xl font-semibold tracking-tight">Выполнено</h3><span>{done.length}</span></div>
        <ul className="daily-todo__list">{done.map((task) => <TodoRow key={task.id} task={task} onEdit={onEdit} onSave={onSave} />)}</ul>
      </section>}

      <Button variant="ghost" className="daily-todo__details" onClick={() => onCreate({ dueOn: selected })}><Plus aria-hidden="true" />Добавить с описанием и временем</Button>
    </div>
  </div>;
}
