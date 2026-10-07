import { useEffect, useId, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, Columns3, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { planningApi } from "@/lib/planning-api";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { PlanningCalendar } from "@/components/planning-calendar";
import { scheduleError } from "../../shared/planning-calendar.js";
import { PlanningKanban } from "@/components/planning-kanban";
import { useIsMobile } from "@/hooks/use-mobile";
import "./planning-space.css";

export const PLANNING_TABS = [
  { id: "kanban", label: "Kanban-доска", icon: Columns3 },
  { id: "calendar", label: "Календарь", icon: CalendarDays },
];
const EMPTY_TASK = { title: "", description: "", status: "todo", dueOn: "", startTime: "", durationMinutes: 60 };
function TaskEditor({ task, columns, onClose, onSave, onDelete }) {
  const id = useId();
  const mobile = useIsMobile();
  const [form, setForm] = useState({ ...EMPTY_TASK, ...task, dueOn: task.dueOn || "", startTime: task.startTime || "" });
  const [allDay, setAllDay] = useState(!task.startTime);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = async (event) => {
    event.preventDefault();
    if (busy) return;
    const invalid = scheduleError({ ...form, startTime: allDay ? "" : form.startTime });
    if (invalid) { setError(invalid); return; }
    setBusy(true);
    setError("");
    try {
      await onSave(task.id, { title: form.title.trim(), description: form.description.trim(), columnId: form.columnId || columns[0]?.id, completed: form.completed ?? false, dueOn: form.dueOn, startTime: allDay ? "" : form.startTime, durationMinutes: form.durationMinutes || 60 });
      onClose();
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await onDelete(task.id); onClose(); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); setConfirmDelete(false); }
  };
  return <>
    <Drawer open onOpenChange={(open) => { if (!open && !busy) onClose(); }} swipeDirection={mobile ? "down" : "left"}>
      <DrawerContent className="rollapp-body app-drawer--form">
        <DrawerClose render={<Button variant="ghost" size="icon" className="absolute top-2 right-2 z-10" disabled={busy} />} aria-label="Закрыть задачу"><X aria-hidden="true" /></DrawerClose>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={save}>
          <DrawerHeader className="pr-16 text-left!">
            <DrawerTitle>{task.id ? "Редактировать задачу" : "Новая задача"}</DrawerTitle>
            <DrawerDescription>Добавьте дату, чтобы задача появилась в календаре.</DrawerDescription>
          </DrawerHeader>
          <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <FieldGroup>
              <Field><FieldLabel htmlFor={`${id}-title`}>Название</FieldLabel><Input id={`${id}-title`} required maxLength={200} placeholder="Что нужно сделать?" value={form.title} onChange={(e) => change("title", e.target.value)} /></Field>
              <Field><FieldLabel htmlFor={`${id}-description`}>Описание</FieldLabel><Textarea id={`${id}-description`} maxLength={5000} rows={4} placeholder="Детали и заметки" value={form.description} onChange={(e) => change("description", e.target.value)} /></Field>
              <Field><FieldLabel htmlFor={`${id}-status`}>Список</FieldLabel><Select value={form.columnId || columns[0]?.id} onValueChange={(value) => { change("columnId", value); change("completed", columns.find((column) => column.id === value)?.complete || false); }}><SelectTrigger id={`${id}-status`}><SelectValue>{columns.find((column) => column.id === (form.columnId || columns[0]?.id))?.title}</SelectValue></SelectTrigger><SelectContent>{columns.map((column) => <SelectItem key={column.id} value={column.id}>{column.title}</SelectItem>)}</SelectContent></Select></Field>
              <Field><FieldLabel htmlFor={`${id}-date`}>Дата</FieldLabel><Input id={`${id}-date`} type="date" min="0001-01-01" max="9999-12-31" value={form.dueOn} onChange={(e) => { change("dueOn", e.target.value); if (!e.target.value) setAllDay(true); }} /></Field>
            {form.dueOn && <>
                <Field orientation="horizontal"><FieldLabel htmlFor={`${id}-all-day`}>Весь день</FieldLabel><Switch id={`${id}-all-day`} checked={allDay} onCheckedChange={(checked) => { setAllDay(checked); if (!checked && !form.startTime) change("startTime", "09:00"); }} /></Field>
                {!allDay && <>
                  <Field><FieldLabel htmlFor={`${id}-time`}>Начало</FieldLabel><Input id={`${id}-time`} type="time" required value={form.startTime} onChange={(event) => change("startTime", event.target.value)} /></Field>
                  <Field><FieldLabel htmlFor={`${id}-duration`}>Длительность, минут</FieldLabel><Input id={`${id}-duration`} type="number" min={15} max={1440} step={1} required value={form.durationMinutes} onChange={(event) => change("durationMinutes", event.target.value === "" ? "" : Number(event.target.value))} /></Field>
                </>}
              </>}
            </FieldGroup>
          </div>
          <DrawerFooter className="gap-2">
            <Button type="submit" disabled={busy || !form.title.trim()}>{busy && <Spinner />}Сохранить</Button>
            {task.id && <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmDelete(true)}>Удалить задачу</Button>}
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent className="rollapp-body">
        <AlertDialogHeader><AlertDialogTitle>Удалить задачу?</AlertDialogTitle><AlertDialogDescription>«{task.title}» исчезнет из доски и календаря.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={remove}>Удалить</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}

export function PlanningSpace() {
  const [search] = useSearchParams();
  const activeTab = search.get("tab") === "calendar" ? "calendar" : "kanban";
  const spaceId = search.get("space") || "main";
  return <PlanningSpaceContent key={spaceId} spaceId={spaceId} activeTab={activeTab} />;
}

function PlanningSpaceContent({ spaceId, activeTab }) {
  const api = planningApi(spaceId);
  const [tasks, setTasks] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [editor, setEditor] = useState(null);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    api.get("tasks").then(({ tasks: loaded, columns: loadedColumns }) => { if (current) { setTasks(loaded); setColumns(loadedColumns); } })
      .catch((cause) => { if (current) setError(cause.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [retry]);
  const save = async (id, payload, { quiet = false } = {}) => {
    const { task } = id ? await api.patch(`tasks/${id}`, payload) : await api.post("tasks", payload);
    setTasks((current) => id ? current.map((item) => item.id === id ? task : item) : [...current, task]);
    if (!quiet) toast.success(id ? "Задача сохранена" : "Задача добавлена");
    return task;
  };
  const remove = async (id) => {
    await api.delete(`tasks/${id}`);
    setTasks((current) => current.filter((task) => task.id !== id));
    toast.success("Задача удалена");
  };
  return <section className={`app-page planning-space typeset typeset-rollapp ${activeTab === "kanban" ? "planning-space--kanban" : "planning-space--calendar"}`}>
    {activeTab === "calendar" ? <h1 className="sr-only">Календарь планирования</h1> : <header className="planning-space__header">
      <div data-typeset-group><h1>Планирование</h1></div>
      <Button className="not-typeset" disabled={loading || Boolean(error)} onClick={() => setEditor({ ...EMPTY_TASK, columnId: columns[0]?.id, completed: columns[0]?.complete || false, dueOn: "" })}><Plus aria-hidden="true" />Новая задача</Button>
    </header>}
    <div className="not-typeset planning-tools rollapp-body">
      {loading ? <div className="planning-space__status" role="status"><Spinner />Загружаем задачи…</div> : error ? <Alert variant="destructive"><AlertDescription>{error}<Button variant="outline" onClick={() => setRetry((value) => value + 1)}>Повторить</Button></AlertDescription></Alert> : activeTab === "kanban" ? (
        <PlanningKanban api={api} tasks={tasks} columns={columns} onTasksChange={setTasks} onColumnsChange={setColumns} onSave={save} onEdit={setEditor} />
      ) : (
        <PlanningCalendar onSave={save} tasks={tasks} columns={columns} onEdit={setEditor} onCreate={(schedule) => setEditor({ ...EMPTY_TASK, columnId: columns[0]?.id, completed: columns[0]?.complete || false, ...schedule })} />
      )}
    </div>
    {editor && <TaskEditor task={editor} columns={columns} onClose={() => setEditor(null)} onSave={save} onDelete={remove} />}
  </section>;
}
