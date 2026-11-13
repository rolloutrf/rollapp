import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { ListTodo, Trash2, X } from "lucide-react";
import { api } from "@/api";
import { ControlBar } from "@/components/control-bar";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EditableTextBlock } from "@/components/editable-text-block";
import { InlineTextField } from "@/components/inline-text-field";
import { InlineSaveStatus, useDocumentDraft } from "@/components/inline-document";
import { NotesLibrary } from "@/components/notes-library";
import { buildNoteLibrary } from "@/lib/note-layout";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/form-surface";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NOTE_TASKS_REQUEST_EVENT, usePlanningAssistantDraft } from "@/lib/planning-assistant";
import "./planning-notes.css";

const emptyLayout = { revision: 0, groups: [], order: [] };

function NoteError({ error, retry }) {
  return error && <Alert variant="destructive" className="not-typeset rollapp-body"><AlertDescription>{error}</AlertDescription>{retry && <Button variant="outline" onClick={retry}>Повторить</Button>}</Alert>;
}

export function PlanningNotes({ client = api }) {
  const [search, setSearch] = useSearchParams();
  const location = useLocation();
  const navigation = useRef({ key: location.key, revision: 0 });
  if (navigation.current.key !== location.key) navigation.current = { key: location.key, revision: navigation.current.revision + 1 };
  const noteId = search.get("note");
  const groupId = search.get("noteGroup");
  const [notes, setNotes] = useState([]);
  const [layout, setLayout] = useState(emptyLayout);
  const library = useMemo(() => buildNoteLibrary(notes, layout), [notes, layout]);
  const group = library.layout.groups.find(group => group.id === groupId);
  const layoutWrite = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [assistantDraft, clearAssistantDraft] = usePlanningAssistantDraft("draft_note");
  const [version, setVersion] = useState(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (noteId) return;
    let current = true;
    setLoading(true); setError("");
    client.get("/planning/notes").then(result => {
      if (!current) return;
      setNotes(result.notes);
      const next = result.layout || emptyLayout;
      setLayout(current => next.revision >= current.revision ? next : current);
    })
      .catch(cause => { if (current) setError(cause.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [client, noteId, version]);
  useEffect(() => {
    if (!noteId && groupId && !group && !loading && !error) {
      setSearch({ tab: "notes" }, { replace: true });
    }
  }, [noteId, groupId, group, loading, error, setSearch]);
  const saveLayout = async next => {
    if (layoutWrite.current) throw new Error("Дождитесь сохранения предыдущего изменения.");
    const sourceRevision = navigation.current.revision;
    layoutWrite.current = true;
    try {
      const result = await client.patch("/planning/notes/layout", next);
      if (mounted.current) setLayout(current => result.layout.revision >= current.revision ? result.layout : current);
    } catch (cause) {
      if (cause.code === "NOTE_LAYOUT_CHANGED" && mounted.current && navigation.current.revision === sourceRevision) {
        const latest = await client.get("/planning/notes").catch(() => null);
        if (latest && mounted.current && navigation.current.revision === sourceRevision) {
          setNotes(latest.notes);
          setLayout(latest.layout);
        }
      }
      throw cause;
    } finally {
      layoutWrite.current = false;
    }
  };
  const open = id => setSearch(current => {
    const next = new URLSearchParams(current);
    next.set("tab", "notes"); next.set("note", id);
    next.delete("space"); next.delete("spaceKind");
    return next;
  });
  const create = async () => {
    if (creating) return;
    const sourceRevision = navigation.current.revision;
    setCreating(true); setError("");
    try {
      const { note } = await client.post("/planning/notes", { title: "Без названия", content: "" });
      if (mounted.current && navigation.current.revision === sourceRevision) open(note.id);
    }
    catch (cause) { if (mounted.current && navigation.current.revision === sourceRevision) setError(cause.message); }
    finally { if (mounted.current) setCreating(false); }
  };
  return <section className={`app-page planning-notes page-stack ${noteId ? "typeset typeset-rollapp" : "rollapp-body planning-notes--library"}`} aria-label="Заметки">
    {noteId ? <NoteLoader key={noteId} noteId={noteId} client={client} /> : <NotesLibrary key={groupId || ""} library={library} group={group} onSaveLayout={saveLayout} loading={loading} error={error} creating={creating} onCreate={create} errorContent={<NoteError error={error} retry={() => setVersion(v => v + 1)} />} />}
    {!noteId && assistantDraft && <AssistantNoteForm draft={assistantDraft} client={client} onClose={clearAssistantDraft} onCreated={open} />}
  </section>;
}

function AssistantNoteForm({ draft, client, onClose, onCreated }) {
  const [open, setOpen] = useState(true);
  const [title, setTitle] = useState(draft.title);
  const [content, setContent] = useState(draft.content);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const createdId = useRef(null);
  const saving = useRef(false);
  async function save(event) {
    event.preventDefault();
    if (saving.current || createdId.current || !title.trim() || !content.trim()) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      // Import the proposed text without turning model-generated media or HTML into authored nodes.
      const { note } = await client.post("/planning/notes", { title, content: content.replace(/[\\[\]<>]/g, "\\$&") });
      createdId.current = note.id;
      setOpen(false);
    } catch (cause) { setError(cause.message); }
    finally { saving.current = false; setBusy(false); }
  }
  return <Drawer open={open} onOpenChange={value => { if (!value && !busy) setOpen(false); }} onAfterClose={() => {
    onClose();
    if (createdId.current) onCreated(createdId.current);
  }}>
    <DrawerContent className="rollapp-body app-drawer--form">
      <DrawerClose render={<Button variant="outline" size="icon" className="absolute top-2 right-2 z-10" disabled={busy} />} aria-label="Закрыть заметку"><X aria-hidden="true" /></DrawerClose>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={save}>
        <DrawerHeader className="pr-16 text-left!"><DrawerTitle>Новая заметка</DrawerTitle><DrawerDescription>Проверьте черновик ассистента перед сохранением.</DrawerDescription></DrawerHeader>
        <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <NoteError error={error} />
          <FieldGroup>
            <Field><FieldLabel htmlFor="assistant-note-title">Название</FieldLabel><Input id="assistant-note-title" required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="assistant-note-content">Текст заметки</FieldLabel><Textarea id="assistant-note-content" required maxLength={5000} rows={6} value={content} onChange={event => setContent(event.target.value)} /></Field>
          </FieldGroup>
        </div>
        <DrawerFooter><Button type="submit" disabled={busy || !title.trim() || !content.trim()}>Сохранить</Button></DrawerFooter>
      </form>
    </DrawerContent>
  </Drawer>;
}

function NoteLoader({ noteId, client }) {
  const [note, setNote] = useState(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let current = true;
    setNote(null); setError("");
    client.get(`/planning/notes/${encodeURIComponent(noteId)}`).then(result => { if (current) setNote(result.note); })
      .catch(cause => { if (current) setError(cause.message); });
    return () => { current = false; };
  }, [client, noteId, version]);
  if (note) return <NoteEditor note={note} client={client} />;
  return <>
    <NoteError error={error} retry={() => setVersion(v => v + 1)} />
    {!error && <p role="status">Загружаем заметку…</p>}
  </>;
}

function NoteEditor({ note, client }) {
  const [, setSearch] = useSearchParams();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [saved, setSaved] = useState({ title: note.title, content: note.content });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const autosave = useDocumentDraft(saved, async draft => {
    await client.patch(`/planning/notes/${encodeURIComponent(note.id)}`, draft);
    setSaved(draft);
  }, `planning:notes:${note.id}`);
  const prepareTasks = async () => {
    if (busy || !autosave.draft.content.trim()) return;
    setBusy(true); setError("");
    try {
      if (!await autosave.flush(true)) throw new Error("Сначала сохраните изменения заметки.");
      if (mounted.current) window.dispatchEvent(new CustomEvent(NOTE_TASKS_REQUEST_EVENT, { detail: { noteId: note.id } }));
    } catch (cause) { if (mounted.current) setError(cause.message); }
    finally { if (mounted.current) setBusy(false); }
  };
  const remove = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (!await autosave.flush(true)) throw new Error("Сначала сохраните изменения заметки.");
      await client.delete(`/planning/notes/${encodeURIComponent(note.id)}`);
      if (mounted.current) setSearch(current => {
        const next = new URLSearchParams({ tab: "notes" });
        if (current.has("noteGroup")) next.set("noteGroup", current.get("noteGroup"));
        return next;
      }, { replace: true });
    } catch (cause) { if (mounted.current) setError(cause.message); }
    finally { if (mounted.current) { setBusy(false); setConfirmDelete(false); } }
  };
  return <>
    <NoteError error={error} />
    <article className="typeset typeset-rollapp typeset-document planning-notes__document page-stack">
      <ControlBar as="header" className="page-toolbar flex-nowrap">
        <h1 className="min-w-0"><InlineTextField value={autosave.draft.title} onChange={title => autosave.change(current => ({ ...current, title: title.slice(0, 200) }))} onBlur={autosave.flush} label="Название заметки" singleLine placeholder="Без названия" disabled={busy} /></h1>
        <Button className="not-typeset" data-control-icon variant="outline" size="icon" aria-label="Сделать задачи из заметки"
          title="Сделать задачи из заметки" disabled={busy || !autosave.draft.content.trim()} onClick={prepareTasks}><ListTodo aria-hidden="true" /></Button>
        <Button className="not-typeset" data-control-icon variant="destructive" size="icon" aria-label="Удалить заметку" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 aria-hidden="true" /></Button>
      </ControlBar>
      <EditableTextBlock value={autosave.draft.content} onChange={content => autosave.change(current => ({ ...current, content }))} onBlur={autosave.flush} label="Текст заметки" placeholder="Напишите что-нибудь или введите / для выбора блока…" disabled={busy} />
    </article>
    <InlineSaveStatus autosave={autosave} />
    <AlertDialog open={confirmDelete} onOpenChange={open => { if (!busy) setConfirmDelete(open); }}>
      <AlertDialogContent className="rollapp-body"><AlertDialogHeader><AlertDialogTitle>Удалить заметку?</AlertDialogTitle><AlertDialogDescription>«{autosave.draft.title || "Без названия"}» будет удалена. Это действие нельзя отменить.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={remove}>Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </>;
}
