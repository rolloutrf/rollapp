import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ArrowLeft, FileText, Plus, Trash2 } from "lucide-react";
import { api } from "@/api";
import { ControlBar } from "@/components/control-bar";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageActionButton } from "@/components/page-action-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { EditableTextBlock } from "@/components/editable-text-block";
import { InlineTextField } from "@/components/inline-text-field";
import { InlineSaveStatus, useDocumentDraft } from "@/components/inline-document";
import { cn } from "@/lib/utils";
import "./planning-notes.css";

function NoteError({ error, retry }) {
  return error && <Alert variant="destructive" className="not-typeset rollapp-body"><AlertDescription>{error}</AlertDescription>{retry && <Button variant="outline" onClick={retry}>Повторить</Button>}</Alert>;
}

export function PlanningNotes({ client = api }) {
  const [search, setSearch] = useSearchParams();
  const location = useLocation();
  const navigation = useRef({ key: location.key, revision: 0 });
  if (navigation.current.key !== location.key) navigation.current = { key: location.key, revision: navigation.current.revision + 1 };
  const noteId = search.get("note");
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [version, setVersion] = useState(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (noteId) return;
    let current = true;
    setLoading(true); setError("");
    client.get("/planning/notes").then(result => { if (current) setNotes(result.notes); })
      .catch(cause => { if (current) setError(cause.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [client, noteId, version]);
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
    try { const { note } = await client.post("/planning/notes", { title: "Без названия", content: "" }); if (mounted.current && navigation.current.revision === sourceRevision) open(note.id); }
    catch (cause) { if (mounted.current && navigation.current.revision === sourceRevision) setError(cause.message); }
    finally { if (mounted.current) setCreating(false); }
  };
  return <section className="app-page planning-notes page-stack typeset typeset-rollapp" aria-label="Заметки">
    {noteId ? <NoteLoader key={noteId} noteId={noteId} client={client} /> : <>
      <h1>Заметки</h1>
      <header className="page-toolbar not-typeset rollapp-body">
        <PageActionButton onClick={create} disabled={creating || loading}><Plus aria-hidden="true" />{creating ? "Создаём…" : "Создать заметку"}</PageActionButton>
      </header>
      <NoteError error={error} retry={() => setVersion(v => v + 1)} />
      {loading ? <p role="status" className="flex items-center gap-2"><Spinner />Загружаем заметки…</p> : !error && (notes.length ?
        <nav aria-label="Список заметок" className="planning-notes__list not-typeset rollapp-body">
          {notes.map(note => <Link className="planning-notes__item" key={note.id} to={`?tab=notes&note=${encodeURIComponent(note.id)}`}>
            <FileText aria-hidden="true" className="size-5 shrink-0" /><span className="min-w-0 flex-1 break-words">{note.title}</span>
          </Link>)}
        </nav> : <p className="text-muted-foreground">Пока нет заметок. Создайте первую, чтобы записать мысли, планы или идеи.</p>)}
    </>}
  </section>;
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
    <ControlBar><Link data-control-icon aria-label="К списку заметок" to="?tab=notes" className={cn(buttonVariants({ variant: "outline", size: "icon" }), "rounded-full")}><ArrowLeft aria-hidden="true" /></Link></ControlBar>
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
  const remove = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (!await autosave.flush(true)) throw new Error("Сначала сохраните изменения заметки.");
      await client.delete(`/planning/notes/${encodeURIComponent(note.id)}`);
      if (mounted.current) setSearch({ tab: "notes" }, { replace: true });
    } catch (cause) { if (mounted.current) setError(cause.message); }
    finally { if (mounted.current) { setBusy(false); setConfirmDelete(false); } }
  };
  return <>
    <ControlBar className="not-typeset page-toolbar rollapp-body">
      <Link data-control-icon aria-label="К списку заметок" to="?tab=notes" aria-disabled={busy || undefined} onClick={event => { if (busy) event.preventDefault(); }} className={cn(buttonVariants({ variant: "outline", size: "icon" }), "rounded-full")}><ArrowLeft aria-hidden="true" /></Link>
      <Button data-control-icon variant="destructive" size="icon" aria-label="Удалить заметку" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 aria-hidden="true" /></Button>
    </ControlBar>
    <NoteError error={error} />
    <article className="typeset typeset-rollapp typeset-document planning-notes__document">
      <h1><InlineTextField value={autosave.draft.title} onChange={title => autosave.change(current => ({ ...current, title: title.slice(0, 200) }))} onBlur={autosave.flush} label="Название заметки" singleLine placeholder="Без названия" disabled={busy} /></h1>
      <EditableTextBlock value={autosave.draft.content} onChange={content => autosave.change(current => ({ ...current, content }))} onBlur={autosave.flush} label="Текст заметки" placeholder="Напишите что-нибудь или введите / для выбора блока…" disabled={busy} />
    </article>
    <InlineSaveStatus autosave={autosave} />
    <AlertDialog open={confirmDelete} onOpenChange={open => { if (!busy) setConfirmDelete(open); }}>
      <AlertDialogContent className="rollapp-body"><AlertDialogHeader><AlertDialogTitle>Удалить заметку?</AlertDialogTitle><AlertDialogDescription>«{autosave.draft.title || "Без названия"}» будет удалена. Это действие нельзя отменить.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={remove}>Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </>;
}
