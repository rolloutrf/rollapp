import { ControlBar } from "@/components/control-bar";
import { calendarTaskSchedules } from "../../shared/planning-calendar.js";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, Copy, Pencil, CalendarDays } from "lucide-react";
import { useCalendarGesture } from "@/hooks/use-calendar-gesture";
import { useIsMobile } from "@/hooks/use-mobile";
import { relatedKindLabel } from "@/lib/planning-related-items";
import { toast } from "sonner";
import { MiniMonth } from "@/components/calendar-mini-month";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { calendarDays, isPlanningDate, localDateKey } from "../../shared/planning.js";
import { CALENDAR_VIEWS, calendarMove, timeMinutes, calendarWeek, dateFromKey, layoutCalendarEvents, minutesTime, shiftCalendarDate, sortCalendarTasks, taskTimeLabel } from "../../shared/planning-calendar.js";
import { expandRecurringTasks, recurrenceLabel } from "../../shared/planning-recurrence.js";
import "./planning-calendar.css";

const label = (key, options = { day: "numeric", month: "long" }) => new Intl.DateTimeFormat("ru-RU", options).format(dateFromKey(key));
const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const CalendarActions = createContext(null);
function EventDetails({ task, onAction }) {
  const { onEdit, onCreate, columns, sourceTasks } = useContext(CalendarActions);
  const source = sourceTasks.find(item => item.id === (task.sourceId || task.id)) || task;
  if (task.external) return <><p className="schedule-caption">Apple Calendar · {label(task.dueOn)} · {taskTimeLabel(task)}</p>{task.description && <p className="schedule-preview__description">{task.description}</p>}<p className="schedule-caption">Изменяйте это событие в календаре устройства. Изменения появятся после следующей синхронизации.</p></>;
  return <>
    <p className="schedule-caption">{task.dueOn ? label(task.dueOn, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Без даты"} · {taskTimeLabel(task)}</p>
    <p className="schedule-caption">{columns.find((column) => column.id === task.columnId)?.title}{task.completed ? " · Завершено" : ""}</p>
    {task.recurrence && <p className="schedule-caption">{recurrenceLabel(task.recurrence)}. Изменения применяются ко всей серии.</p>}
    {task.description && <p className="schedule-preview__description">{task.description}</p>}
    {task.relatedItems?.length > 0 && <div className="flex flex-col gap-1" aria-label="Связанные объекты">{task.relatedItems.map((item) => <p key={`${item.kind}:${item.id}`} className="schedule-caption">{relatedKindLabel(item.kind)} · {item.title}</p>)}</div>}
    <div className="flex flex-wrap gap-2"><Button onClick={() => { onAction?.(); onEdit(task); }}><Pencil />{task.recurrence ? "Изменить серию" : "Изменить"}</Button><Button variant="outline" onClick={() => { onAction?.(); const { id, sourceId, occurrenceDate, seriesDueOn, recurrenceCompletedDates, ...copy } = task; onCreate({ ...copy, startTime: source.startTime, unscheduled: !source.startTime, durationMinutes: source.durationMinutes, completed: false, title: `${task.title.slice(0, 190)} — копия` }); }}><Copy />Дублировать</Button></div>
  </>;
}
function EventPreview({ task, children, className, onMove, ...props }) {
  const { onEdit, busy, startDrag, endDrag } = useContext(CalendarActions);
  const [open, setOpen] = useState(false);
  const interaction = {
    draggable: !task.external && !onMove && !busy && !task.recurrence,
    onPointerDown: onMove && !task.external ? (event) => onMove(event, task) : undefined,
    onDoubleClick: task.external ? undefined : () => { setOpen(false); onEdit(task); },
    onDragStart: (event) => { if (!startDrag(event, task)) return; setOpen(false); },
    onDragEnd: endDrag,
  };
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger render={<Button variant="ghost" className={className} {...props} />} {...interaction}>{children}</PopoverTrigger>
    <PopoverContent className="rollapp-body schedule-preview" side="right" align="start"><PopoverTitle className="text-xl font-semibold">{task.title}</PopoverTitle><EventDetails task={task} onAction={() => setOpen(false)} /></PopoverContent>
  </Popover>;
}
function EventButton({ task, compact = false, style, onResize, onMove }) {
  return <div className="schedule-event-wrap" style={style} data-calendar-event={task.id} data-compact={compact || undefined}>
    <EventPreview task={task} onMove={onMove} className={`schedule-event ${compact ? "schedule-event--compact" : ""}`} data-completed={task.completed || undefined} aria-label={`${task.title}, ${taskTimeLabel(task)}`}>
      <span className="schedule-event__content">{compact && task.startTime && <span className="schedule-event__start">{task.startTime}</span>}<span className="schedule-event__title">{task.title}</span>{!compact && <span className="schedule-caption">{taskTimeLabel(task)}</span>}{task.relatedItems?.length > 0 && <span className="schedule-caption schedule-event__related">{task.relatedItems.map((item) => item.title).join(", ")}</span>}</span>
    </EventPreview>
    {onResize && !task.external && !task.recurrence && <Button variant="ghost" className="schedule-resize" aria-label={`Изменить длительность: ${task.title}`} onPointerDown={(event) => onResize(event, task)} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (["ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); onResize(event, task, event.key === "ArrowUp" ? -15 : 15); } }}><span /></Button>}
  </div>;
}

function Agenda({ date, tasks, columns, onEdit, onCreate, heading = true }) {
  return <section className="planning-agenda schedule-agenda" aria-label={`Задачи на ${label(date)}`}>
    {heading && <header className="schedule-agenda__header"><h3 className="text-lg font-semibold">{label(date, { weekday: "long", day: "numeric", month: "long" })}</h3><Button variant="ghost" size="icon" aria-label={`Добавить задачу на ${label(date)}`} onClick={() => onCreate({ dueOn: date })}><Plus /></Button></header>}
    {tasks.length ? tasks.map((task) => <div className="schedule-agenda__row" key={task.id}><EventPreview task={task} className="schedule-agenda__task" data-completed={task.completed || undefined}><span>{task.title}</span><span className="schedule-caption">{columns.find((column) => column.id === task.columnId)?.title}</span>{task.relatedItems?.length > 0 && <span className="schedule-caption">{task.relatedItems.map((item) => item.title).join(", ")}</span>}</EventPreview><span className="schedule-caption schedule-agenda__time">{taskTimeLabel(task)}</span></div>) : <p className="text-muted-foreground">На этот день планов нет.</p>}
  </section>;
}

function Timeline({ dates, selected, today, tasks, onSelect, onCreate }) {
  const { saveSchedule, dropTask, allowDrop, busy, cancelInteractionRef, sourceTasks } = useContext(CalendarActions);
  const scroll = useRef(null);
  const { preview, beginMove, beginRange, beginResize, guardClick, resetClick } = useCalendarGesture({ scroll, sourceTasks, scopeKey: dates.join(), busy, onCreate, saveSchedule, cancelInteractionRef });
  const [now, setNow] = useState(() => new Date());
  const dateSignature = dates.join();
  const hasAllDayTasks = tasks.some((task) => dates.includes(task.dueOn) && task.startTime === "00:00" && task.durationMinutes === 1440);
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const viewport = scroll.current?.querySelector('[data-slot="scroll-area-viewport"]');
    if (viewport) viewport.scrollTop = hasAllDayTasks ? 0 : 8 * 96;
  }, [dateSignature, hasAllDayTasks]);
  useEffect(() => {
    const viewport = scroll.current?.querySelector('[data-slot="scroll-area-viewport"]');
    if (!viewport || dates.length < 2) return;
    const revealSelectedDay = () => {
      const column = viewport.querySelectorAll(".schedule-time-column")[dates.indexOf(selected)];
      if (!column || viewport.scrollWidth <= viewport.clientWidth) return;
      const bounds = column.getBoundingClientRect();
      viewport.scrollLeft += bounds.left - viewport.getBoundingClientRect().left - Math.max(76, (viewport.clientWidth - bounds.width) / 2);
    };
    const observer = new ResizeObserver(revealSelectedDay);
    observer.observe(viewport); revealSelectedDay();
    return () => observer.disconnect();
  }, [dateSignature, selected]);
  const minuteAt = (event, column) => Math.max(0, Math.min(1440, (event.clientY - column.getBoundingClientRect().top) / 1.6));
  const rendered = preview?.kind === "resize" ? tasks.map(task => task.id === preview.task.id ? { ...task, durationMinutes: preview.durationMinutes } : task) : tasks;
  return <ScrollArea ref={scroll} className="schedule-timeline" aria-label="Расписание по времени">
    {tasks.some((task) => dates.includes(task.dueOn) && !task.startTime) && <section className="flex flex-col gap-2 p-4" aria-label="Задачи без свободного получасового слота">
      <p className="schedule-caption">Нет свободного получасового слота</p>
      {tasks.filter((task) => dates.includes(task.dueOn) && !task.startTime).map((task) => <EventPreview key={task.id} task={task}>{label(task.dueOn)} · {task.title}</EventPreview>)}
    </section>}
    <div className={`schedule-timegrid ${dates.length > 1 ? "schedule-timegrid--week" : ""}`} style={{ "--days": dates.length }} onClickCapture={guardClick} onPointerDownCapture={resetClick}>
      <div className="schedule-timegrid__head">
        {dates.length > 1 && <><span className="schedule-timezone" aria-hidden="true" />
        {dates.map((date) => <Button variant="ghost" key={date} className="schedule-day-heading" aria-pressed={selected === date} onClick={() => onSelect(date, "day")}><span data-today={date === today || undefined}>{label(date, { weekday: "short" })}, {dateFromKey(date).getDate()}</span></Button>)}</>}

      </div>
      <div className="schedule-timegrid__body">
        <div className="schedule-hour-labels" aria-hidden="true">{Array.from({ length: 24 }, (_, hour) => <span key={hour} className="schedule-caption" style={{ top: hour * 96 }}>{minutesTime(hour * 60)}</span>)}</div>
        {dates.map((date) => <div className="schedule-time-column" key={date} data-date={date} aria-label={label(date)} data-weekend={[0, 6].includes(dateFromKey(date).getDay()) || undefined} onDragOver={allowDrop} onDrop={(event) => dropTask(event, date, minuteAt(event, event.currentTarget))}>
          {Array.from({ length: 48 }, (_, slot) => <Button variant="ghost" key={slot} className="schedule-slot" aria-label={`Добавить задачу ${label(date)}, ${minutesTime(slot * 30)}`} onPointerDown={(event) => beginRange(event, date)} onClick={(event) => { if (busy) return; onCreate({ dueOn: date, startTime: minutesTime(slot * 30), durationMinutes: slot === 47 ? 30 : 60 }); }} />)}
          {layoutCalendarEvents(rendered.filter((task) => task.dueOn === date)).map(({ task, start, end, lane, lanes }) => <EventButton key={task.id} task={task} compact={end - start < 60} onResize={beginResize} onMove={beginMove} style={{ position: "absolute", top: start * 1.6, height: (end - start) * 1.6 - 2, left: `calc(${lane / lanes * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }} />)}
          {preview && preview.kind !== "resize" && preview.date === date && <div className="schedule-range" data-calendar-preview={preview.kind} aria-live="polite" style={{ top: timeMinutes(preview.startTime) * 1.6, height: preview.durationMinutes * 1.6 }}><span className={preview.kind === "move" ? "sr-only" : undefined}>{preview.task && <strong>{preview.task.title} · </strong>}{taskTimeLabel(preview)}</span></div>}
          {date === today && <div className="schedule-now" style={{ top: (now.getHours() * 60 + now.getMinutes()) * 1.6 }} aria-label={`Сейчас ${minutesTime(now.getHours() * 60 + now.getMinutes())}`} />}
        </div>)}
      </div>
    </div><ScrollBar orientation="horizontal" />
  </ScrollArea>;
}
export function PlanningCalendar({ tasks: sourceTasks, columns, onEdit, onCreate, onSave }) {
  const tasks = sourceTasks;
  // Display slots are projections. Editing must always start from stored data.
  const editTask = (task) => onEdit(sourceTasks.find((item) => item.id === (task.sourceId || task.id)) || task);
  const [search, setSearch] = useSearchParams();
  const today = localDateKey(new Date());
  const selected = isPlanningDate(search.get("date")) ? search.get("date") : today;
  const view = CALENDAR_VIEWS.some((item) => item.id === search.get("view")) ? search.get("view") : "month";
  const mobile = useIsMobile();
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const latestTasks = useRef(sourceTasks);
  latestTasks.current = sourceTasks;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const dragOwner = useRef(null);
  const endDrag = () => { dragOwner.current = null; };
  const startDrag = (event, task) => {
    const source = sourceTasks.find(item => item.id === task.id);
    if (saving.current || task.recurrence || !source) { event.preventDefault(); return false; }
    dragOwner.current = source;
    event.dataTransfer.setData("application/x-rollapp-calendar", task.id);
    event.dataTransfer.effectAllowed = "move";
    return true;
  };
  const allowDrop = event => {
    if (!saving.current && dragOwner.current && sourceTasks.includes(dragOwner.current) && event.dataTransfer.types.includes("application/x-rollapp-calendar")) {
      event.preventDefault(); event.dataTransfer.dropEffect = "move";
    }
  };
  useEffect(() => {
    endDrag();
    const visibility = () => { if (document.hidden) endDrag(); };
    const key = event => { if (event.key === "Escape") endDrag(); };
    window.addEventListener("blur", endDrag); document.addEventListener("visibilitychange", visibility); document.addEventListener("keydown", key, true);
    return () => { endDrag(); window.removeEventListener("blur", endDrag); document.removeEventListener("visibilitychange", visibility); document.removeEventListener("keydown", key, true); };
  }, [selected, view, sourceTasks]);
  const cancelInteractionRef = useRef(null);
  const navigate = (date, mode = view) => { cancelInteractionRef.current?.(); setSearch((current) => { const next = new URLSearchParams(current); next.set("date", date); next.set("view", mode); return next; }); };
  const saveSchedule = async (task, patch) => {
    const original = sourceTasks.find((item) => item.id === task.id);
    const payload = { startTime: task.startTime, durationMinutes: task.durationMinutes, ...patch };
    if (saving.current || !original || Object.entries(payload).every(([key, value]) => value === original[key])) return;
    saving.current = true; setBusy(true);
    try {
      await onSave(task.id, payload, { quiet: true });
      const previous = Object.fromEntries([...new Set(["startTime", "durationMinutes", ...Object.keys(patch)])].map((key) => [key, original[key] ?? (key === "durationMinutes" ? 60 : "")]));
      const expected = { ...original, ...payload };
      toast.success("Расписание обновлено", { action: { label: "Отменить", onClick: async () => {
        if (!mounted.current || saving.current) return;
        const current = latestTasks.current.find(item => item.id === task.id);
        if (!current || ["dueOn", "startTime", "durationMinutes"].some(key => expected[key] !== current[key])) { toast.error("Расписание уже изменилось. Откройте событие для редактирования."); return; }
        saving.current = true; setBusy(true);
        try { await onSave(task.id, previous, { quiet: true }); }
        catch (error) { toast.error(error.message); }
        finally { saving.current = false; if (mounted.current) setBusy(false); }
      } } });
    } catch (error) { toast.error(error.message); }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  };
  const dropTask = (event, date, minute, preserveTime = false) => {
    event.preventDefault(); event.stopPropagation();
    const owner = dragOwner.current; endDrag();
    const task = owner && sourceTasks.includes(owner) && visible.find((item) => item.id === owner.id && item.id === event.dataTransfer.getData("application/x-rollapp-calendar"));
    if (task && !task.recurrence && !saving.current) saveSchedule(preserveTime ? owner : task, preserveTime ? { dueOn: date } : calendarMove(task, date, minute));
  };
  const dates = view === "year" ? [`${selected.slice(0, 4)}-01-01`, `${selected.slice(0, 4)}-12-31`]
    : view === "week" ? calendarWeek(selected)
    : view === "day" ? [selected]
    : calendarDays(dateFromKey(selected)).map(localDateKey);
  const visible = sortCalendarTasks(calendarTaskSchedules(expandRecurringTasks(tasks, dates[0], dates.at(-1))));
  const dayTasks = visible.filter((task) => task.dueOn === selected);
  const month = selected.slice(0, 7);
  const listed = visible.filter((task) => task.dueOn?.startsWith(month));
  const groupedDates = [...new Set(listed.map((task) => task.dueOn))];
  const periodLabel = label(selected, view === "day" ? { day: "numeric", month: "long" } : { month: "long" });
  const title = view === "year" ? selected.slice(0, 4) : <><strong className="font-semibold">{periodLabel[0].toLocaleUpperCase("ru") + periodLabel.slice(1)}</strong> {selected.slice(0, 4)} г.</>;
  const agendaProps = { columns, onEdit: editTask, onCreate };
  const listContent = <div className="schedule-list">{groupedDates.length ? groupedDates.map((date) => <Agenda key={date} date={date} tasks={listed.filter((task) => task.dueOn === date)} {...agendaProps} />) : <div className="schedule-empty"><CalendarDays className="size-8" /><p>В этом месяце планов нет.</p><Button variant="outline" onClick={() => onCreate({ dueOn: selected })}><Plus />Добавить задачу</Button></div>}</div>;
  const keyboard = (event) => {
    if (event.target.closest('input, textarea, [contenteditable="true"], [data-slot="popover-content"], [data-calendar-sync]') || !(event.metaKey || event.ctrlKey)) return;
    if (["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); navigate(shiftCalendarDate(selected, view, event.key === "ArrowLeft" ? -1 : 1)); }
    if (event.key.toLowerCase() === "t") { event.preventDefault(); navigate(today); }
    const mode = CALENDAR_VIEWS[Number(event.key) - 1];
    if (mode) { event.preventDefault(); navigate(selected, mode.id); }
  };
  const navigation = <div className="schedule-navigation"><Button data-control-icon variant="outline" size="icon" className="rounded-full" aria-label="Предыдущий период" onClick={() => navigate(shiftCalendarDate(selected, view, -1))}><ChevronLeft /></Button><Button variant="outline" className="schedule-current-date rounded-full" aria-label={`Сегодня. Выбрано: ${label(selected, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}. Перейти к сегодняшней дате`} title="Перейти к сегодняшней дате" onClick={() => navigate(today)}><span className="hidden xl:inline">{label(selected, { day: "numeric", month: "long", year: "numeric" })}, {label(selected, { weekday: "long" })}</span><span className="xl:hidden">{label(selected, { day: "2-digit", month: "2-digit" })}<span className="schedule-current-date__weekday">, {label(selected, { weekday: "short" })}</span></span></Button><Button data-control-icon variant="outline" size="icon" className="rounded-full" aria-label="Следующий период" onClick={() => navigate(shiftCalendarDate(selected, view, 1))}><ChevronRight /></Button></div>;
  return <CalendarActions.Provider value={{ onEdit: editTask, onCreate, columns, busy, saveSchedule, dropTask, allowDrop, startDrag, endDrag, cancelInteractionRef, sourceTasks }}><div className="schedule" aria-busy={busy} data-view={view} onKeyDown={keyboard}>
    <Tabs value={view} onValueChange={(value) => navigate(selected, value)} className="schedule-window">
      <ControlBar className="schedule-toolbar">
        {navigation}
        <TabsList className="rounded-full" aria-label="Вид календаря">{CALENDAR_VIEWS.filter((item) => item.id !== "list").map((item, index) => <TabsTrigger className="rounded-full" key={item.id} value={item.id} title={`⌘ / Ctrl + ${index + 1}`}>{item.label}</TabsTrigger>)}</TabsList>
        <Button data-control-icon variant="outline" size="icon" className="rounded-full" aria-label="Новая задача в календаре" onClick={() => onCreate({ dueOn: selected })}><Plus aria-hidden="true" /></Button>
      </ControlBar>
      <div className="schedule-layout">
        <div className="schedule-main">
          <h2 className="sr-only" aria-live="polite">{title}{view === "day" && `, ${label(selected, { weekday: "long" })}`}</h2>
          <TabsContent value="month" className="schedule-month-panel"><div className="schedule-month" aria-label="Дни месяца"><div className="schedule-weekdays">{weekdays.map((day) => <span className="schedule-caption" key={day}>{day}</span>)}</div><div className="schedule-month__grid">{calendarDays(dateFromKey(selected)).map((date) => {
            const key = localDateKey(date); const events = visible.filter((task) => task.dueOn === key);
            return <div className="schedule-month__cell" key={key} data-date={key} data-weekend={[0, 6].includes(date.getDay()) || undefined} data-outside={!key.startsWith(month) || undefined} data-selected={selected === key || undefined} onClick={(event) => { if (!event.target.closest("button, a, [role='button']")) navigate(key, "day"); }} onDragOver={allowDrop} onDrop={(event) => dropTask(event, key, null, true)}><Button variant="ghost" className="schedule-month__date" aria-pressed={selected === key} aria-current={key === today ? "date" : undefined} aria-label={`${label(key, { day: "numeric", month: "long", year: "numeric" })}, задач: ${events.length}`} onClick={() => navigate(key, "day")}><span className="schedule-month__number" data-today={key === today || undefined}>{date.getDate() === 1 ? label(key, { day: "numeric", month: "short" }) : date.getDate()}<span className="schedule-month__indicator" aria-hidden="true" data-has-events={events.length > 0 || undefined} /></span></Button></div>;
          })}</div></div>{mobile && <Agenda date={selected} tasks={dayTasks} {...agendaProps} heading={false} />}</TabsContent>
          {['day', 'week'].map((mode) => <TabsContent key={mode} value={mode} className="schedule-timeline-panel">{view === mode && <Timeline dates={mode === 'week' ? calendarWeek(selected) : [selected]} selected={selected} today={today} tasks={visible} onSelect={navigate} onCreate={onCreate} />}</TabsContent>)}
          <TabsContent value="year" className="schedule-year-panel"><div className="schedule-year">{Array.from({ length: 12 }, (_, index) => <MiniMonth key={index} month={`${selected.slice(0, 4)}-${String(index + 1).padStart(2, "0")}-01`} selected={selected} today={today} tasks={visible} onSelect={(date) => navigate(date, "day")} onOpenMonth={(date) => navigate(date, "month")} />)}</div></TabsContent>
          <TabsContent value="list" className="schedule-list-panel">{listContent}</TabsContent>
        </div>
      </div>
    </Tabs>
  </div></CalendarActions.Provider>;
}
