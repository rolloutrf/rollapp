import { useEffect, useRef, useState } from "react";
import { Archive, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CalendarDays, Check, ChevronDown, ChevronRight, Download, GripVertical, MoreHorizontal, Pencil, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MarkdownDocument } from "@/components/life-strategy";
import { localDateKey, planningMarkdown } from "../../shared/planning.js";

const formatDate = (value) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
function CardTitle({ text }) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|~~[^~]+~~|#[\p{L}\p{N}_/-]+)/gu).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("~~") && part.endsWith("~~")) return <s key={index}>{part.slice(2, -2)}</s>;
    if (part.startsWith("#")) return <span key={index} className="kanban-tag">{part}</span>;
    return part;
  });
}

function CardComposer({ initial, onSave, onCancel, busy, compact = false }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [error, setError] = useState("");
  const input = useRef(null);
  const submitting = useRef(false);
  useEffect(() => { input.current?.focus({ preventScroll: true }); }, []);
  const submit = async (event) => {
    event?.preventDefault();
    if (!title.trim() || busy || submitting.current) return;
    submitting.current = true;
    setError("");
    try { await onSave({ title: title.trim(), description }); setTitle(""); input.current?.focus({ preventScroll: true }); }
    catch (cause) { setError(cause.message); }
    finally { submitting.current = false; }
  };
  return <form className="kanban-composer" onSubmit={submit} onKeyDown={(event) => {
    if (event.key === "Escape" && !busy) { event.stopPropagation(); onCancel(); }
  }}>
    <Textarea ref={input} aria-label={initial ? "Текст карточки" : "Новая карточка"} placeholder="Текст карточки…" rows={2} maxLength={200} value={title} disabled={busy} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); }
    }} />
    {!compact && <Textarea aria-label="Описание карточки" placeholder="Описание · Markdown и чек-листы" rows={4} maxLength={5000} value={description} disabled={busy} onChange={(event) => setDescription(event.target.value)} />}
    {error && <p className="kanban-error" role="alert">{error}</p>}
    <div className="flex items-center gap-2"><Button type="submit" disabled={busy || !title.trim()}>{initial ? "Сохранить" : "Добавить"}</Button><Button variant="ghost" size="icon" type="button" disabled={busy} onClick={onCancel} aria-label="Отменить ввод"><X /></Button></div>
    {compact && <span className="kanban-caption">Enter — добавить · Shift+Enter — новая строка</span>}
  </form>;
}

function ColumnComposer({ initial = "", onSave, onCancel, busy }) {
  const [title, setTitle] = useState(initial);
  const [error, setError] = useState("");
  const input = useRef(null);
  const submitting = useRef(false);
  useEffect(() => { input.current?.focus({ preventScroll: true }); input.current?.select(); }, []);
  return <form className="kanban-composer" onSubmit={async (event) => {
    event.preventDefault();
    if (!title.trim() || busy || submitting.current) return;
    submitting.current = true;
    try { await onSave(title.trim()); } catch (cause) { setError(cause.message); } finally { submitting.current = false; }
  }} onKeyDown={(event) => { if (event.key === "Escape" && !busy) onCancel(); }}>
    <Input ref={input} aria-label="Название списка" placeholder="Название списка" value={title} maxLength={100} disabled={busy} onChange={(event) => setTitle(event.target.value)} />
    {error && <p className="kanban-error" role="alert">{error}</p>}
    <div className="flex gap-2"><Button type="submit" disabled={busy || !title.trim()}>{initial ? "Сохранить" : "Добавить список"}</Button><Button type="button" size="icon" variant="ghost" aria-label="Отменить список" disabled={busy} onClick={onCancel}><X /></Button></div>
  </form>;
}

export function PlanningKanban({ api, tasks, columns, onTasksChange, onColumnsChange, onSave, onEdit }) {
  const [search, setSearch] = useState("");
  const [archive, setArchive] = useState(false);
  const [addingColumn, setAddingColumn] = useState(false);
  const [addingCard, setAddingCard] = useState(null);
  const [editingCard, setEditingCard] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [drag, setDrag] = useState(null);
  const [drop, setDrop] = useState(null);
  const [announcement, setAnnouncement] = useState("");
  const boardRef = useRef(null);
  const pointer = useRef(null);
  const pointerCleanup = useRef(null);
  const suppressClick = useRef(false);
  useEffect(() => () => pointerCleanup.current?.(), []);
  const run = async (operation) => {
    if (busyRef.current) throw new Error("Дождитесь сохранения предыдущего изменения");
    busyRef.current = true; setBusy(true);
    try { return await operation(); } finally { busyRef.current = false; setBusy(false); }
  };
  const act = (operation) => void run(operation).catch((error) => toast.error(error.message));
  const patchColumn = async (id, patch) => {
    const result = await api.patch(`columns/${id}`, patch);
    onColumnsChange(result.columns);
  };
  const moveColumn = async (id, beforeId) => {
    const result = await api.patch(`columns/${id}/move`, { beforeId });
    onColumnsChange(result.columns); setAnnouncement("Порядок списков сохранён");
  };
  const moveTask = async (id, columnId, beforeId = null) => {
    const result = await api.patch(`tasks/${id}/move`, { columnId, beforeId });
    onTasksChange(result.tasks); onColumnsChange(result.columns); setAnnouncement("Положение карточки сохранено");
  };
  const matching = (task) => `${task.title}\n${task.description}`.toLocaleLowerCase("ru").includes(search.trim().toLocaleLowerCase("ru"));
  const visibleTasks = tasks.filter((task) => task.archived === archive && matching(task));
  const stopDrag = () => { setDrag(null); setDrop(null); };
  const targetAt = (x, y, source) => {
    const element = document.elementFromPoint(x, y);
    if (!element || !boardRef.current?.contains(element)) return null;
    const list = element.closest("[data-kanban-column]");
    if (!list) return null;
    const columnId = list.dataset.kanbanColumn;
    if (source.kind === "column") {
      const bounds = list.getBoundingClientRect();
      const index = columns.findIndex((column) => column.id === columnId);
      return { columnId, beforeId: x > bounds.left + bounds.width / 2 ? columns[index + 1]?.id || null : columnId };
    }
    const card = element.closest("[data-kanban-card]");
    let beforeId = card?.dataset.kanbanCard || null;
    if (card && y > card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2) {
      const siblings = tasks.filter((task) => task.columnId === columnId && !task.archived);
      beforeId = siblings[siblings.findIndex((task) => task.id === beforeId) + 1]?.id || null;
    }
    return { columnId, beforeId };
  };
  const finishDrop = (source, target) => {
    stopDrag();
    if (!source || !target) return;
    if (source.kind === "column") { if (source.id !== target.beforeId) act(() => moveColumn(source.id, target.beforeId)); }
    else if (source.id !== target.beforeId) act(() => moveTask(source.id, target.columnId, target.beforeId));
  };
  const nativeDrag = (event, kind, id) => {
    if (busy || search || archive) { event.preventDefault(); return; }
    event.stopPropagation();
    event.dataTransfer.setData("application/x-rollapp-kanban", JSON.stringify({ kind, id }));
    event.dataTransfer.effectAllowed = "move";
    setDrag({ kind, id });
  };
  // A dedicated handle keeps normal touch scrolling available on the rest of a card.
  const touchDrag = (event, kind, id) => {
    if (event.pointerType === "mouse" || busy || search || archive) return;
    event.preventDefault();
    const source = { kind, id };
    const state = { id: event.pointerId, source, x: event.clientX, y: event.clientY, target: null, active: false };
    pointer.current = state;
    const capture = event.currentTarget;
    capture.setPointerCapture(event.pointerId);
    const move = (next) => {
      if (next.pointerId !== state.id) return;
      if (!state.active && Math.hypot(next.clientX - state.x, next.clientY - state.y) < 8) return;
      state.active = true; setDrag(source); suppressClick.current = true;
      const board = boardRef.current;
      const bounds = board?.getBoundingClientRect();
      if (bounds) {
        const delta = next.clientX < bounds.left + 40 ? -24 : next.clientX > bounds.right - 40 ? 24 : 0;
        board.scrollLeft += delta;
        board.scrollTop += next.clientY < bounds.top + 48 ? -24 : next.clientY > bounds.bottom - 40 ? 24 : 0;
      }
      state.target = targetAt(next.clientX, next.clientY, source); setDrop(state.target);
    };
    const clean = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel);
      if (capture.hasPointerCapture(state.id)) capture.releasePointerCapture(state.id);
      pointer.current = null; pointerCleanup.current = null;
      setTimeout(() => { suppressClick.current = false; }, 0);
    };
    const up = (next) => { if (next.pointerId !== state.id) return; clean(); if (state.active) finishDrop(source, state.target); };
    const cancel = () => { clean(); stopDrag(); };
    pointerCleanup.current?.(); pointerCleanup.current = cancel;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel);
  };
  const exportBoard = () => {
    const url = URL.createObjectURL(new Blob([planningMarkdown(columns, tasks)], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "Планирование.md"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const cardView = (task) => {
    if (editingCard === task.id) return <div key={task.id} className="kanban-card"><CardComposer initial={task} busy={busy} onCancel={() => setEditingCard(null)} onSave={(patch) => run(async () => { await onSave(task.id, patch, { quiet: true }); setEditingCard(null); })} /></div>;
    const siblings = tasks.filter((item) => item.columnId === task.columnId && !item.archived);
    const index = siblings.findIndex((item) => item.id === task.id);
    return <article key={task.id} className="kanban-card" data-kanban-card={task.id} data-completed={task.completed || undefined} data-dragging={drag?.id === task.id || undefined} data-drop-before={drag?.kind === "task" && drop?.beforeId === task.id || undefined} draggable={!busy && !search && !archive} onDragStart={(event) => nativeDrag(event, "task", task.id)} onDragEnd={stopDrag}>
      <div className="kanban-card__top">
        <Checkbox aria-label={`Выполнено: ${task.title}`} checked={task.completed} disabled={busy || archive} onCheckedChange={(checked) => act(() => onSave(task.id, { completed: checked === true }, { quiet: true }))} />
        <Button variant="ghost" className="kanban-card__title" onClick={() => { if (!suppressClick.current) setEditingCard(task.id); }} disabled={busy || archive}><CardTitle text={task.title} /></Button>
        <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="kanban-card__menu" disabled={busy} />} aria-label={`Меню карточки ${task.title}`}><MoreHorizontal /></DropdownMenuTrigger>
          <DropdownMenuContent className="rollapp-body min-w-56" align="end">
            <DropdownMenuItem onClick={() => setEditingCard(task.id)}><Pencil />Изменить текст</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(task)}><CalendarDays />Дата и подробности</DropdownMenuItem>
            {!archive && <><DropdownMenuSub><DropdownMenuSubTrigger><ArrowRight />Переместить в список</DropdownMenuSubTrigger><DropdownMenuSubContent className="rollapp-body min-w-56">{columns.map((column) => <DropdownMenuItem key={column.id} disabled={column.id === task.columnId} onClick={() => act(() => moveTask(task.id, column.id))}>{column.title}</DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuSub>
              <DropdownMenuItem disabled={index === 0} onClick={() => act(() => moveTask(task.id, task.columnId, siblings[index - 1].id))}><ArrowUp />Выше</DropdownMenuItem>
              <DropdownMenuItem disabled={index === siblings.length - 1} onClick={() => act(() => moveTask(task.id, task.columnId, siblings[index + 2]?.id || null))}><ArrowDown />Ниже</DropdownMenuItem></>}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => act(() => onSave(task.id, { archived: !archive }, { quiet: true }))}>{archive ? <RotateCcw /> : <Archive />}{archive ? "Вернуть на доску" : "В архив"}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {task.description && <MarkdownDocument className="kanban-card__markdown" label={`Описание: ${task.title}`} source={task.description} taskDisabled={busy || archive} onTaskCheckedChange={(line, checked) => {
        const lines = task.description.split("\n"); lines[line] = lines[line].replace(/^- \[[ xX]\]/, `- [${checked ? "x" : " "}]`);
        act(() => onSave(task.id, { description: lines.join("\n") }, { quiet: true }));
      }} />}
      <div className="kanban-card__footer" data-has-date={Boolean(task.dueOn) || undefined}>
        {task.dueOn && <span className="kanban-card__date" data-overdue={!task.completed && task.dueOn < localDateKey(new Date()) || undefined}><CalendarDays className="size-4" />{formatDate(task.dueOn)}</span>}
        {!archive && <Button variant="ghost" size="icon" className="kanban-drag-handle" aria-label={`Перетащить карточку ${task.title}`} title="Перетащите карточку или используйте её меню" disabled={busy || Boolean(search)} draggable onDragStart={(event) => nativeDrag(event, "task", task.id)} onPointerDown={(event) => touchDrag(event, "task", task.id)}><GripVertical /></Button>}
      </div>
    </article>;
  };
  return <div className="kanban-workspace" aria-busy={busy}>
    <div className="kanban-toolbar">
      <div className="kanban-search"><Search aria-hidden="true" /><Input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Поиск карточек" placeholder="Поиск карточек…" />{search && <Button variant="ghost" size="icon" aria-label="Сбросить поиск" onClick={() => setSearch("")}><X /></Button>}</div>
      <div className="flex items-center gap-2"><Button variant="outline" className="rounded-full aria-pressed:bg-accent" onClick={() => { setArchive(!archive); setEditingCard(null); }} aria-pressed={archive}><Archive />Архив<Badge variant="secondary">{tasks.filter((task) => task.archived).length}</Badge></Button>
        <Button variant="outline" size="icon" className="rounded-full" aria-label="Скачать Markdown" title="Скачать Markdown" onClick={exportBoard}><Download /></Button></div>
    </div>
    <span role="status" className="sr-only">{announcement}</span>
    {search && <p className="kanban-caption">Найдено карточек: {visibleTasks.length}. Очистите поиск, чтобы менять порядок перетаскиванием.</p>}
    {archive ? <section className="kanban-archive" aria-label="Архив карточек">{visibleTasks.length ? visibleTasks.map(cardView) : <p className="kanban-empty">{search ? "Ничего не найдено" : "В архиве пока нет карточек"}</p>}</section> : <div ref={boardRef} className="planning-board" aria-label="Kanban-доска" onDragOver={(event) => {
      if (!drag || !event.dataTransfer.types.includes("application/x-rollapp-kanban")) return;
      event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDrop(targetAt(event.clientX, event.clientY, drag));
      const bounds = boardRef.current.getBoundingClientRect();
      if (event.clientX > bounds.right - 40) boardRef.current.scrollLeft += 20;
      if (event.clientX < bounds.left + 40) boardRef.current.scrollLeft -= 20;
      if (event.clientY > bounds.bottom - 40) boardRef.current.scrollTop += 20;
      if (event.clientY < bounds.top + 48) boardRef.current.scrollTop -= 20;
    }} onDrop={(event) => { event.preventDefault(); finishDrop(drag, targetAt(event.clientX, event.clientY, drag)); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDrop(null); }}>
      {columns.map((column, columnIndex) => {
        const columnTasks = visibleTasks.filter((task) => task.columnId === column.id);
        const total = tasks.filter((task) => task.columnId === column.id && !task.archived).length;
        return <section className="planning-column" key={column.id} data-kanban-column={column.id} data-status={column.id} data-collapsed={column.collapsed || undefined} data-dragging={drag?.kind === "column" && drag.id === column.id || undefined} data-drop-column={drag?.kind === "column" && drop?.beforeId === column.id || undefined} aria-label={column.title}>
          {renaming === column.id ? <ColumnComposer initial={column.title} busy={busy} onCancel={() => setRenaming(null)} onSave={(title) => run(async () => { await patchColumn(column.id, { title }); setRenaming(null); })} /> : <header className="planning-column__header">
            <Button variant="ghost" size="icon" className="kanban-drag-handle" aria-label={`Перетащить список ${column.title}`} disabled={busy || Boolean(search)} draggable onDragStart={(event) => nativeDrag(event, "column", column.id)} onDragEnd={stopDrag} onPointerDown={(event) => touchDrag(event, "column", column.id)}><GripVertical /></Button>
            <Button variant="ghost" className="planning-column__title" onClick={() => act(() => patchColumn(column.id, { collapsed: !column.collapsed }))} disabled={busy} aria-expanded={!column.collapsed}>{column.collapsed ? <ChevronRight /> : <ChevronDown />}<span>{column.title}</span>{column.complete && <Check className="size-4" />}</Button><Badge variant="secondary">{total}</Badge>
            <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" disabled={busy} />} aria-label={`Меню списка ${column.title}`}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent className="rollapp-body min-w-56" align="end">
              <DropdownMenuItem onClick={() => setRenaming(column.id)}><Pencil />Переименовать</DropdownMenuItem>
              <DropdownMenuItem onClick={() => act(() => patchColumn(column.id, { complete: !column.complete }))}><Check />{column.complete ? "Не завершать новые карточки" : "Завершать новые карточки"}</DropdownMenuItem>
              <DropdownMenuItem disabled={columnIndex === 0} onClick={() => act(() => moveColumn(column.id, columns[columnIndex - 1].id))}><ArrowLeft />Сдвинуть влево</DropdownMenuItem>
              <DropdownMenuItem disabled={columnIndex === columns.length - 1} onClick={() => act(() => moveColumn(column.id, columns[columnIndex + 2]?.id || null))}><ArrowRight />Сдвинуть вправо</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={columns.length === 1 || tasks.some((task) => task.columnId === column.id)} onClick={() => act(async () => { const result = await api.delete(`columns/${column.id}`); onColumnsChange(result.columns); })}><Trash2 />Удалить пустой список</DropdownMenuItem>
            </DropdownMenuContent></DropdownMenu>
          </header>}
          {!column.collapsed && <>
            <div className="planning-column__tasks" data-drop-end={drag?.kind === "task" && drop?.columnId === column.id && !drop.beforeId || undefined}>
              {columnTasks.map(cardView)}
              {!columnTasks.length && <p className="kanban-empty">{search ? "Нет совпадений" : "Нет карточек"}</p>}
            </div>
            {addingCard === column.id ? <CardComposer compact busy={busy} onCancel={() => setAddingCard(null)} onSave={(patch) => run(() => onSave(null, { ...patch, columnId: column.id }, { quiet: true }))} /> : <Button variant="ghost" className="planning-column__add" disabled={busy} onClick={() => setAddingCard(column.id)}><Plus />Добавить карточку</Button>}
          </>}
        </section>;
      })}
      <div className="kanban-new-column">{addingColumn ? <ColumnComposer busy={busy} onCancel={() => setAddingColumn(false)} onSave={(title) => run(async () => { const result = await api.post("columns", { title }); onColumnsChange(result.columns); setAddingColumn(false); })} /> : <Button variant="ghost" className="kanban-new-column__button" disabled={busy} onClick={() => setAddingColumn(true)}><Plus />Добавить список</Button>}</div>
    </div>}
  </div>;
}
