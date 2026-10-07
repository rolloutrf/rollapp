import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, Search, PanelLeft, Copy, Pencil, CalendarDays, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { MiniMonth } from "@/components/calendar-mini-month";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { calendarDays, isPlanningDate, localDateKey } from "../../shared/planning.js";
import { CALENDAR_VIEWS, calendarRange, calendarMove, calendarResize, timeMinutes, calendarWeek, dateFromKey, layoutCalendarEvents, minutesTime, shiftCalendarDate, sortCalendarTasks, taskTimeLabel } from "../../shared/planning-calendar.js";
import "./planning-calendar.css";

const label = (key, options = { day: "numeric", month: "long" }) => new Intl.DateTimeFormat("ru-RU", options).format(dateFromKey(key));
const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const CalendarActions = createContext(null);
function EventDetails({ task, onAction }) {
  const { onEdit, onCreate, columns } = useContext(CalendarActions);
  return <>
    <p className="schedule-caption">{task.dueOn ? label(task.dueOn, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Без даты"} · {taskTimeLabel(task)}</p>
    <p className="schedule-caption">{columns.find((column) => column.id === task.columnId)?.title}{task.completed ? " · Завершено" : ""}</p>
    {task.description && <p className="schedule-preview__description">{task.description}</p>}
    <div className="flex flex-wrap gap-2"><Button onClick={() => { onAction?.(); onEdit(task); }}><Pencil />Изменить</Button><Button variant="outline" onClick={() => { onAction?.(); const { id, ...copy } = task; onCreate({ ...copy, completed: false, title: `${task.title.slice(0, 190)} — копия` }); }}><Copy />Дублировать</Button></div>
  </>;
}
function EventPreview({ task, children, className, ...props }) {
  const { onEdit, busy, inspectInSidebar, onInspect, inspectedId } = useContext(CalendarActions);
  const [open, setOpen] = useState(false);
  const interaction = {
    draggable: !busy,
    onDoubleClick: () => { setOpen(false); onEdit(task); },
    onDragStart: (event) => { setOpen(false); event.dataTransfer.setData("application/x-rollapp-calendar", task.id); event.dataTransfer.effectAllowed = "move"; },
  };
  if (inspectInSidebar) return <Button variant="ghost" className={className} {...props} {...interaction} aria-pressed={inspectedId === task.id} onClick={() => onInspect(task.id)}>{children}</Button>;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger render={<Button variant="ghost" className={className} {...props} />} {...interaction}>{children}</PopoverTrigger>
    <PopoverContent className="rollapp-body schedule-preview" side="right" align="start"><PopoverTitle className="text-xl font-semibold">{task.title}</PopoverTitle><EventDetails task={task} onAction={() => setOpen(false)} /></PopoverContent>
  </Popover>;
}
function EventButton({ task, compact = false, style, onResize }) {
  return <div className="schedule-event-wrap" style={style} data-calendar-event={task.id}>
    <EventPreview task={task} className={`schedule-event ${compact ? "schedule-event--compact" : ""}`} data-completed={task.completed || undefined} aria-label={`${task.title}, ${taskTimeLabel(task)}`}>
      {compact && task.startTime && <span className="schedule-event__start">{task.startTime}</span>}<span className="schedule-event__title">{task.title}</span>{!compact && <span className="schedule-caption">{taskTimeLabel(task)}</span>}
    </EventPreview>
    {onResize && <Button variant="ghost" className="schedule-resize" aria-label={`Изменить длительность: ${task.title}`} onPointerDown={(event) => onResize(event, task)} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (["ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); onResize(event, task, event.key === "ArrowUp" ? -15 : 15); } }}><span /></Button>}
  </div>;
}

function Agenda({ date, tasks, columns, onEdit, onCreate, heading = true }) {
  return <section className="planning-agenda schedule-agenda" aria-label={`Задачи на ${label(date)}`}>
    {heading && <header className="schedule-agenda__header"><h3 className="text-lg font-semibold">{label(date, { weekday: "long", day: "numeric", month: "long" })}</h3><Button variant="ghost" size="icon" aria-label={`Добавить задачу на ${label(date)}`} onClick={() => onCreate({ dueOn: date })}><Plus /></Button></header>}
    {tasks.length ? tasks.map((task) => <div className="schedule-agenda__row" key={task.id}><span className="schedule-caption schedule-agenda__time">{taskTimeLabel(task)}</span><EventPreview task={task} className="schedule-agenda__task" data-completed={task.completed || undefined}><span>{task.title}</span><span className="schedule-caption">{columns.find((column) => column.id === task.columnId)?.title}</span></EventPreview></div>) : <p className="text-muted-foreground">На этот день планов нет.</p>}
  </section>;
}

function Timeline({ dates, selected, today, tasks, onSelect, onCreate }) {
  const { saveSchedule, dropTask, busy } = useContext(CalendarActions);
  const scroll = useRef(null);
  const gesture = useRef(null);
  const skipClick = useRef(0);
  const [preview, setPreview] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const dateSignature = dates.join();
  const [short, setShort] = useState(() => window.matchMedia("(max-height: 500px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-height: 500px)");
    const update = () => setShort(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const allDayLimit = short ? 0 : 2;
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const viewport = scroll.current?.querySelector('[data-slot="scroll-area-viewport"]');
    if (viewport) viewport.scrollTop = 8 * 96;
  }, [dateSignature]);
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
  const beginRange = (event, date) => {
    if (event.pointerType !== "mouse" || event.button !== 0 || busy) return;
    const column = event.currentTarget.closest(".schedule-time-column");
    gesture.current = { kind: "range", date, column, first: minuteAt(event, column), y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const beginResize = (event, task, delta) => {
    if (busy) return;
    if (delta) { saveSchedule(task, calendarResize(task, timeMinutes(task.startTime) + task.durationMinutes + delta)); return; }
    event.preventDefault(); event.stopPropagation();
    gesture.current = { kind: "resize", task, column: event.currentTarget.closest(".schedule-time-column"), y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveGesture = (event) => {
    const active = gesture.current;
    if (!active) return;
    active.moved ||= Math.abs(event.clientY - active.y) > 4;
    if (!active.moved) return;
    const minute = minuteAt(event, active.column);
    const patch = active.kind === "range" ? calendarRange(active.first, minute) : calendarResize(active.task, minute);
    active.patch = patch;
    setPreview({ ...patch, date: active.date || active.task.dueOn, id: active.task?.id });
  };
  const endGesture = () => {
    const active = gesture.current;
    gesture.current = null; setPreview(null);
    if (!active?.moved || !active.patch) return;
    skipClick.current = Date.now() + 150;
    if (active.kind === "range") onCreate({ dueOn: active.date, ...active.patch });
    else saveSchedule(active.task, active.patch);
  };
  const rendered = preview?.id ? tasks.map((task) => task.id === preview.id ? { ...task, durationMinutes: preview.durationMinutes } : task) : tasks;
  return <ScrollArea ref={scroll} className="schedule-timeline" aria-label="Расписание по времени">
    <div className={`schedule-timegrid ${dates.length > 1 ? "schedule-timegrid--week" : ""}`} style={{ "--days": dates.length }} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={() => { gesture.current = null; setPreview(null); }}>
      <div className="schedule-timegrid__head">
        {dates.length > 1 && <><span className="schedule-timezone" aria-hidden="true" />
        {dates.map((date) => <Button variant="ghost" key={date} className="schedule-day-heading" aria-pressed={selected === date} onClick={() => onSelect(date, "day")}><span data-today={date === today || undefined}>{label(date, { weekday: "short" })}, {dateFromKey(date).getDate()}</span></Button>)}</>}
        <span className="schedule-caption schedule-all-day-label">Весь день</span>
        {dates.map((date) => <div className="schedule-all-day" key={date} onDragOver={allowDrop} onDrop={(event) => dropTask(event, date, null)}>{tasks.filter((task) => task.dueOn === date && !task.startTime).slice(0, allDayLimit).map((task) => <EventButton key={task.id} task={task} compact />)}{tasks.filter((task) => task.dueOn === date && !task.startTime).length > allDayLimit && <Button variant="ghost" className="schedule-more" onClick={() => onSelect(date, "list")}>Ещё {tasks.filter((task) => task.dueOn === date && !task.startTime).length - allDayLimit}</Button>}{!tasks.some((task) => task.dueOn === date && !task.startTime) && <Button variant="ghost" size="icon" aria-label={`Добавить на весь день, ${label(date)}`} onClick={() => onCreate({ dueOn: date })}><Plus className="size-4" /></Button>}</div>)}
      </div>
      <div className="schedule-timegrid__body">
        <div className="schedule-hour-labels" aria-hidden="true">{Array.from({ length: 24 }, (_, hour) => <span key={hour} className="schedule-caption" style={{ top: hour * 96 }}>{minutesTime(hour * 60)}</span>)}</div>
        {dates.map((date) => <div className="schedule-time-column" key={date} aria-label={label(date)} data-weekend={[0, 6].includes(dateFromKey(date).getDay()) || undefined} onDragOver={allowDrop} onDrop={(event) => dropTask(event, date, minuteAt(event, event.currentTarget))}>
          {Array.from({ length: 48 }, (_, slot) => <Button variant="ghost" key={slot} className="schedule-slot" aria-label={`Добавить задачу ${label(date)}, ${minutesTime(slot * 30)}`} onPointerDown={(event) => beginRange(event, date)} onClick={() => { if (Date.now() < skipClick.current) return; onCreate({ dueOn: date, startTime: minutesTime(slot * 30), durationMinutes: slot === 47 ? 30 : 60 }); }} />)}
          {layoutCalendarEvents(rendered.filter((task) => task.dueOn === date)).map(({ task, start, end, lane, lanes }) => <EventButton key={task.id} task={task} onResize={beginResize} style={{ position: "absolute", top: start * 1.6, height: (end - start) * 1.6 - 2, left: `calc(${lane / lanes * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }} />)}
          {preview && !preview.id && preview.date === date && <div className="schedule-range" style={{ top: timeMinutes(preview.startTime) * 1.6, height: preview.durationMinutes * 1.6 }}>{taskTimeLabel(preview)}</div>}
          {date === today && <div className="schedule-now" style={{ top: (now.getHours() * 60 + now.getMinutes()) * 1.6 }} aria-label={`Сейчас ${minutesTime(now.getHours() * 60 + now.getMinutes())}`} />}
        </div>)}
      </div>
    </div><ScrollBar orientation="horizontal" />
  </ScrollArea>;
}
function allowDrop(event) {
  if (event.dataTransfer.types.includes("application/x-rollapp-calendar")) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }
}

export function PlanningCalendar({ tasks, columns, onEdit, onCreate, onSave }) {
  const [search, setSearch] = useSearchParams();
  const today = localDateKey(new Date());
  const selected = isPlanningDate(search.get("date")) ? search.get("date") : today;
  const view = CALENDAR_VIEWS.some((item) => item.id === search.get("view")) ? search.get("view") : "month";
  const [query, setQuery] = useState("");
  const monthGrid = useRef(null);
  const [monthEventLimit, setMonthEventLimit] = useState(1);
  useEffect(() => {
    const grid = monthGrid.current;
    if (!grid) return;
    const measure = () => setMonthEventLimit(Math.max(0, Math.min(4, Math.floor((grid.clientHeight / 6 - 36) / 34))));
    const observer = new ResizeObserver(measure);
    observer.observe(grid); measure();
    return () => observer.disconnect();
  }, [view, query]);
  const [hidden, setHidden] = useState([]);
  const [showCompleted, setShowCompleted] = useState(true);
  const [sidebar, setSidebar] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [inspectedId, setInspectedId] = useState(null);
  const mobile = useIsMobile();
  const [wide, setWide] = useState(() => window.matchMedia("(min-width: 1200px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1200px)");
    const update = () => setWide(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => setInspectedId(null), [selected, view]);
  const [miniMonth, setMiniMonth] = useState(selected);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  useEffect(() => setMiniMonth(selected), [selected]);
  const navigate = (date, mode = view) => setSearch((current) => { const next = new URLSearchParams(current); next.set("date", date); next.set("view", mode); return next; });
  const saveSchedule = async (task, patch) => {
    if (saving.current) return;
    saving.current = true; setBusy(true);
    try {
      await onSave(task.id, patch, { quiet: true });
      const previous = Object.fromEntries(Object.keys(patch).map((key) => [key, task[key] ?? ""]));
      toast.success("Расписание обновлено", { action: { label: "Отменить", onClick: () => onSave(task.id, previous).catch((error) => toast.error(error.message)) } });
    } catch (error) { toast.error(error.message); }
    finally { saving.current = false; setBusy(false); }
  };
  const dropTask = (event, date, minute, preserveTime = false) => {
    event.preventDefault(); event.stopPropagation();
    const task = tasks.find((item) => item.id === event.dataTransfer.getData("application/x-rollapp-calendar"));
    if (task && !busy) saveSchedule(task, preserveTime ? { dueOn: date } : calendarMove(task, date, minute));
  };
  const visible = sortCalendarTasks(tasks.filter((task) => !task.archived && !hidden.includes(task.columnId) && (showCompleted || !task.completed)));
  const found = visible.filter((task) => task.dueOn && `${task.title} ${task.description}`.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru").trim()));
  const dayTasks = visible.filter((task) => task.dueOn === selected);
  const month = selected.slice(0, 7);
  const listed = query.trim() ? found : visible.filter((task) => task.dueOn?.startsWith(month));
  const groupedDates = [...new Set(listed.map((task) => task.dueOn))];
  const inspectInSidebar = view === "day" && wide && !query.trim();
  const inspected = visible.find((task) => task.id === inspectedId && task.dueOn === selected);
  const periodLabel = label(selected, view === "day" ? { day: "numeric", month: "long" } : { month: "long" });
  const title = view === "year" ? selected.slice(0, 4) : <><strong className="font-semibold">{periodLabel[0].toLocaleUpperCase("ru") + periodLabel.slice(1)}</strong> {selected.slice(0, 4)} г.</>;
  const filters = <div className="schedule-filters"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Списки Kanban</span>{columns.map((column) => <label key={column.id} className="schedule-filter"><Checkbox checked={!hidden.includes(column.id)} onCheckedChange={(checked) => setHidden((current) => checked ? current.filter((id) => id !== column.id) : [...current, column.id])} /><span className="schedule-filter__name">{column.title}</span><span className="schedule-caption">{tasks.filter((task) => !task.archived && task.columnId === column.id && task.dueOn).length}</span></label>)}<label className="schedule-filter schedule-filter--completed"><Checkbox checked={showCompleted} onCheckedChange={setShowCompleted} /><span className="schedule-filter__name">Завершённые</span></label></div>;
  const mini = <MiniMonth month={miniMonth} selected={selected} today={today} tasks={visible} onSelect={(date) => navigate(date, view === "year" ? "month" : view)} onMonthChange={setMiniMonth} />;
  const agendaProps = { columns, onEdit, onCreate };
  const listContent = <div className="schedule-list">{groupedDates.length ? groupedDates.map((date) => <Agenda key={date} date={date} tasks={listed.filter((task) => task.dueOn === date)} {...agendaProps} />) : <div className="schedule-empty"><CalendarDays className="size-8" /><p>{query.trim() ? "События не найдены" : "В этом месяце планов нет."}</p>{!query.trim() && <Button variant="outline" onClick={() => onCreate({ dueOn: selected })}><Plus />Добавить задачу</Button>}</div>}</div>;
  const keyboard = (event) => {
    if (event.target.closest('input, textarea, [contenteditable="true"], [data-slot="popover-content"]') || !(event.metaKey || event.ctrlKey)) return;
    if (["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); navigate(shiftCalendarDate(selected, view, event.key === "ArrowLeft" ? -1 : 1)); }
    if (event.key.toLowerCase() === "t") { event.preventDefault(); navigate(today); }
    const mode = CALENDAR_VIEWS[Number(event.key) - 1];
    if (mode) { event.preventDefault(); navigate(selected, mode.id); }
  };
  const navigation = <div className="schedule-navigation"><Button variant="outline" size="icon" className="rounded-full" aria-label="Предыдущий период" onClick={() => navigate(shiftCalendarDate(selected, view, -1))}><ChevronLeft /></Button><Button variant="outline" className="rounded-full" onClick={() => navigate(today)}>Сегодня</Button><Button variant="outline" size="icon" className="rounded-full" aria-label="Следующий период" onClick={() => navigate(shiftCalendarDate(selected, view, 1))}><ChevronRight /></Button></div>;
  return <CalendarActions.Provider value={{ onEdit, onCreate, columns, busy, saveSchedule, dropTask, inspectInSidebar, inspectedId, onInspect: setInspectedId }}><div className="schedule" aria-busy={busy} data-view={view} onKeyDown={keyboard}>
    <Tabs value={view} onValueChange={(value) => { setQuery(""); navigate(selected, value); }} className="schedule-window">
      <div className="schedule-toolbar">
        <div className="schedule-window-actions"><Button variant="outline" size="icon" className="schedule-sidebar-toggle rounded-full" aria-label={sidebar ? "Скрыть боковую панель" : "Показать боковую панель"} aria-expanded={sidebar} onClick={() => setSidebar(!sidebar)}><PanelLeft /></Button><Popover open={filterOpen} onOpenChange={setFilterOpen}><PopoverTrigger render={<Button variant="outline" size="icon" className="schedule-filter-toggle rounded-full" aria-label="Фильтры календаря" />}><PanelLeft /></PopoverTrigger><PopoverContent className="rollapp-body schedule-mobile-sidebar" align="start"><PopoverTitle>Календарь</PopoverTitle>{mini}{filters}<Button variant="ghost" onClick={() => { setFilterOpen(false); navigate(selected, "list"); }}>Список событий</Button></PopoverContent></Popover><Button variant="outline" size="icon" className="rounded-full" aria-label="Новое событие" onClick={() => onCreate({ dueOn: selected })}><Plus /></Button></div>
        <TabsList aria-label="Вид календаря">{CALENDAR_VIEWS.filter((item) => item.id !== "list").map((item, index) => <TabsTrigger key={item.id} value={item.id} title={`⌘ / Ctrl + ${index + 1}`}>{item.label}</TabsTrigger>)}</TabsList>
        <Popover open={searchOpen} onOpenChange={setSearchOpen}><PopoverTrigger render={<Button variant="outline" size="icon" className="schedule-search-toggle rounded-full" aria-label="Поиск событий" />}><Search /></PopoverTrigger><PopoverContent className="rollapp-body schedule-search" align="end"><PopoverTitle>Поиск событий</PopoverTitle><Input aria-label="Поиск в календаре" placeholder="Название или заметка" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <Button variant="ghost" aria-label="Очистить поиск календаря" onClick={() => setQuery("")}><X />Очистить поиск</Button>}</PopoverContent></Popover>
      </div>
      <div className="schedule-layout" data-sidebar={sidebar || undefined}>
        {sidebar && <aside className="schedule-sidebar">{filters}<Button variant="ghost" onClick={() => navigate(selected, "list")}>Список событий</Button><label className="flex flex-col gap-2"><span className="schedule-caption">Перейти к дате</span><Input type="date" aria-label="Дата перехода" value={selected} onChange={(event) => { if (isPlanningDate(event.target.value)) navigate(event.target.value); }} /></label></aside>}
        <div className="schedule-main" data-inspector={inspectInSidebar || undefined}>
          <header className="schedule-header"><div className="schedule-heading"><h2 className="text-4xl" aria-live="polite">{query.trim() ? "Результаты поиска" : title}</h2>{view === "day" && !query.trim() && <p>{label(selected, { weekday: "long" })}</p>}</div>{!inspectInSidebar && navigation}</header>
          {inspectInSidebar && <aside className="schedule-inspector" aria-label="Выбранное событие"><div className="schedule-inspector__top"><MiniMonth compact month={selected} selected={selected} today={today} tasks={visible} onSelect={(date) => navigate(date, "day")} />{navigation}</div>{inspected ? <section className="schedule-inspector__details"><header className="flex items-start justify-between gap-2"><h3 className="text-xl font-semibold">{inspected.title}</h3><Button variant="ghost" size="icon" aria-label="Снять выбор события" onClick={() => setInspectedId(null)}><X /></Button></header><EventDetails task={inspected} /></section> : <div className="schedule-inspector__empty">Нет выбранных событий</div>}</aside>}
          {query.trim() ? <div className="schedule-search-results"><div className="flex items-center justify-between gap-2 px-5 py-3"><p className="schedule-caption" role="status">Найдено: {found.length} · Все даты</p><Button variant="ghost" onClick={() => { setQuery(""); setSearchOpen(false); }}>Закрыть поиск</Button></div>{listContent}</div> : <>
          <TabsContent value="month" className="schedule-month-panel"><div className="schedule-month" aria-label="Дни месяца"><div className="schedule-weekdays">{weekdays.map((day) => <span className="schedule-caption" key={day}>{day}</span>)}</div><div ref={monthGrid} className="schedule-month__grid">{calendarDays(dateFromKey(selected)).map((date) => {
            const key = localDateKey(date); const events = visible.filter((task) => task.dueOn === key);
            const shown = events.length > monthEventLimit ? Math.max(0, monthEventLimit - 1) : monthEventLimit;
            return <div className="schedule-month__cell" key={key} data-date={key} data-weekend={[0, 6].includes(date.getDay()) || undefined} data-outside={!key.startsWith(month) || undefined} data-selected={selected === key || undefined} onDragOver={allowDrop} onDrop={(event) => dropTask(event, key, null, true)} onDoubleClick={(event) => { if (!event.target.closest(".schedule-event-wrap")) onCreate({ dueOn: key }); }}><Button variant="ghost" className="schedule-month__date" aria-pressed={selected === key} aria-current={key === today ? "date" : undefined} aria-label={`${label(key, { day: "numeric", month: "long", year: "numeric" })}, задач: ${events.length}`} onClick={() => navigate(key)}><span className="schedule-month__number" data-today={key === today || undefined}>{date.getDate() === 1 ? label(key, { day: "numeric", month: "short" }) : date.getDate()}</span><span className="schedule-mobile-dot" data-has-events={events.length > 0 || undefined} /></Button><div className="schedule-month__events">{events.slice(0, shown).map((task) => <EventButton key={task.id} task={task} compact />)}{events.length > shown && <Button variant="ghost" className="schedule-more" onClick={() => navigate(key, "day")}>Ещё {events.length - shown}</Button>}</div></div>;
          })}</div></div>{mobile && <Agenda date={selected} tasks={dayTasks} {...agendaProps} />}</TabsContent>
          {['day', 'week'].map((mode) => <TabsContent key={mode} value={mode} className="schedule-timeline-panel">{view === mode && <Timeline dates={mode === 'week' ? calendarWeek(selected) : [selected]} selected={selected} today={today} tasks={visible} onSelect={navigate} onCreate={onCreate} />}</TabsContent>)}
          <TabsContent value="year" className="schedule-year-panel"><div className="schedule-year">{Array.from({ length: 12 }, (_, index) => <MiniMonth key={index} month={`${selected.slice(0, 4)}-${String(index + 1).padStart(2, "0")}-01`} selected={selected} today={today} tasks={visible} onSelect={(date) => navigate(date, "day")} onOpenMonth={(date) => navigate(date, "month")} />)}</div></TabsContent>
          <TabsContent value="list" className="schedule-list-panel">{listContent}</TabsContent>
        </>}
        </div>
      </div>
    </Tabs>
  </div></CalendarActions.Provider>;
}
